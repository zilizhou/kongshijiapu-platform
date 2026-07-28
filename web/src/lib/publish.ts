import { RowDataPacket } from "mysql2/promise";
import { resolvePeopleGroupPatterns } from "./branch";
import { query } from "./db";
import {
  getAncestors,
  getChildren,
  getPeopleById,
} from "./people";
import { PeopleRow } from "./types";
import { likeOrClause } from "./zh";

export type PublishEntry = {
  id: number;
  name: string;
  sex: string;
  level: number | null;
  rank: string | null;
  /**
   * 姓名下小字，顺序固定：生年 → 妻 → 子N+名 → 住址
   * 例：一九六五年生妻惠氏子三德成德伦德林以上住水城民主村
   */
  bio: string;
  isFocus?: boolean;
};

const CN_DIGITS = "〇一二三四五六七八九";
const CN_COUNT = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** 出生年 → 「一九六五年生」 */
function toChineseBirth(birthday: string | null | undefined): string {
  const raw = (birthday || "").trim();
  if (!raw) return "";
  const m = raw.match(/(\d{4})/);
  if (m) {
    const y = m[1]
      .split("")
      .map((d) => CN_DIGITS[Number(d)] || d)
      .join("");
    return `${y}年生`;
  }
  const compact = raw.replace(/\s+/g, "");
  if (/[一二三四五六七八九〇零]/.test(compact)) {
    const base = compact.replace(/生$/, "").replace(/年$/, "");
    return base ? `${base}年生` : "";
  }
  return "";
}

function cnCount(n: number): string {
  if (n <= 10) return CN_COUNT[n] || String(n);
  if (n < 20) return `十${CN_COUNT[n - 10]}`;
  return String(n);
}

export type PublishGeneration = {
  level: number | null;
  label: string;
  entries: PublishEntry[];
};

export type PublishPayload = {
  mode: "person" | "branch";
  title: string;
  subtitle: string;
  generations: PublishGeneration[];
  total: number;
  focusId?: number;
};

async function tableExists(name: string): Promise<boolean> {
  const rows = await query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?
     LIMIT 1`,
    [name],
  );
  return Boolean(rows[0]);
}

type ChildRef = { name: string; sex: string };

/**
 * 库内 F_ADDRESS 常把史传、支系说明、妻/子等粘在住址后。
 * 出版物只保留「以上住…」的住址段，例如「安徽靈璧縣」。
 */
export function trimPublishAddress(raw: string | null | undefined): string {
  let s = (raw || "").replace(/\s+/g, "").replace(/　+/g, "").trim();
  if (!s) return "";
  if (s.startsWith("以上住")) s = s.slice(3);

  // 史传 / 支系说明 / 其它字段误入住址的切点
  const markers = [
    "元末",
    "明末",
    "清末",
    "民初",
    "民國",
    "民国",
    "洪武",
    "永樂",
    "永乐",
    "嘉靖",
    "康熙",
    "乾隆",
    "道光",
    "咸豐",
    "咸丰",
    "同治",
    "光緒",
    "光绪",
    "宣統",
    "宣统",
    "自先世",
    "公爲",
    "公为",
    "勅授",
    "敕授",
    "賜世",
    "赐世",
    "有疾",
    "卒葬",
    "卒塟",
    "卒塋",
    "葬于",
    "塟",
    "率領",
    "率领",
    "招撫",
    "招抚",
    "後敘",
    "后叙",
    "後叙",
    "上代未詳",
    "上代未详",
    "妻",
  ];
  let cut = s.length;
  for (const m of markers) {
    const i = s.indexOf(m);
    if (i >= 0 && i < cut) cut = i;
  }
  const birthIdx = s.search(/[一二三四五六七八九〇零\d]{2,4}年生/);
  if (birthIdx >= 0 && birthIdx < cut) cut = birthIdx;
  const sonsIdx = s.search(/子女?[零一二三四五六七八九十\d]+/);
  if (sonsIdx >= 0 && sonsIdx < cut) cut = sonsIdx;

  s = s.slice(0, cut).trim();
  // 仍过长时：保留至首个行政区划后缀（县/市/州等）
  if (s.length > 18) {
    const m = s.match(/^(.+?[縣县市州府])/);
    if (m) s = m[1];
  }
  return s;
}

/**
 * 姓名正下方小字：生年 → 妻 → 子N+名 → 住址
 * 例：一九六五年生妻惠氏子三德成德伦德林以上住水城民主村
 */
export function composePublishBio(
  p: PeopleRow,
  children: ChildRef[] = [],
): string {
  const parts: string[] = [];

  const born = toChineseBirth(p.birthday);
  if (born) parts.push(born);

  const spouse = (p.spouse || "").replace(/\s+/g, "").trim();
  if (spouse) {
    parts.push(spouse.startsWith("妻") ? spouse : `妻${spouse}`);
  }

  const sons = children
    .filter((c) => c.sex !== "女")
    .map((c) => c.name.replace(/\s+/g, ""))
    .filter(Boolean)
    .slice(0, 12);
  if (sons.length) {
    parts.push(`子${cnCount(sons.length)}${sons.join("")}`);
  }

  const address = trimPublishAddress(p.address);
  if (address) {
    parts.push(`以上住${address}`);
  }

  return parts.join("");
}

function toEntry(
  p: PeopleRow,
  children: ChildRef[] = [],
  isFocus = false,
): PublishEntry {
  return {
    id: p.id,
    name: p.name,
    sex: p.sex,
    level: p.level,
    rank: p.rank || null,
    bio: composePublishBio(p, children),
    isFocus,
  };
}

function groupByLevel(
  people: PeopleRow[],
  childMap: Map<number, ChildRef[]>,
  focusId?: number,
): PublishGeneration[] {
  const byLevel = new Map<number, PeopleRow[]>();
  for (const p of people) {
    const lv = p.level ?? -1;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(p);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  return levels.map((lv) => {
    const rows = byLevel.get(lv)!;
    rows.sort((a, b) => {
      const ao = a.siblingOrder ?? 999;
      const bo = b.siblingOrder ?? 999;
      if (ao !== bo) return ao - bo;
      return a.id - b.id;
    });
    return {
      level: lv < 0 ? null : lv,
      label: lv < 0 ? "世次未详" : `第${lv}世`,
      entries: rows.map((p) =>
        toEntry(p, childMap.get(p.id) || [], focusId === p.id),
      ),
    };
  });
}

async function collectDescendants(
  rootId: number,
  down: number,
  cap: number,
): Promise<PeopleRow[]> {
  if (down <= 0) return [];
  const out: PeopleRow[] = [];
  let frontier = [rootId];
  for (let depth = 0; depth < down && frontier.length; depth++) {
    const next: number[] = [];
    for (const pid of frontier) {
      if (out.length >= cap) return out;
      const kids = await getChildren(pid);
      for (const k of kids) {
        if (out.length >= cap) return out;
        // getChildren 轻量无小传，后面统一补全
        out.push(k);
        next.push(k.id);
      }
    }
    frontier = next;
  }
  return out;
}

/** 按父 ID 批量取子嗣（不依赖本刊是否收录该子），保证「子N+名」完整 */
async function loadChildMap(
  parentIds: number[],
): Promise<Map<number, ChildRef[]>> {
  const map = new Map<number, ChildRef[]>();
  const unique = [...new Set(parentIds.filter((id) => id > 0))];
  if (!unique.length) return map;
  if (!(await tableExists("tb_people_relation"))) return map;

  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80);
    const ph = chunk.map(() => "?").join(",");
    const rows = await query<RowDataPacket[]>(
      `SELECT r.F_PARENT_ID, p.F_NAME, p.F_SEX
       FROM tb_people_relation r
       JOIN tb_people p ON p.F_ID = r.F_PEOPLE_ID
       WHERE r.F_PARENT_ID IN (${ph})
       ORDER BY p.F_LEFT ASC, p.F_ID ASC`,
      chunk,
    );
    for (const r of rows) {
      const pid = Number(r.F_PARENT_ID);
      const list = map.get(pid) || [];
      list.push({
        name: String(r.F_NAME || ""),
        sex: String(r.F_SEX || "男"),
      });
      map.set(pid, list);
    }
  }
  return map;
}

async function hydratePeople(ids: number[]): Promise<Map<number, PeopleRow>> {
  const map = new Map<number, PeopleRow>();
  if (!ids.length) return map;
  const unique = [...new Set(ids)];
  const hasInfo = await tableExists("tb_people_info");
  const hasRelation = await tableExists("tb_people_relation");
  // 分批，避免 IN 过长
  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80);
    const ph = chunk.map(() => "?").join(",");
    const rows = await query<RowDataPacket[]>(
      `SELECT p.F_ID, p.F_NAME, p.F_SEX, p.F_NO, p.F_LEVEL, p.F_GROUP,
              p.F_BIRTHDAY, p.F_DEATHDAY, p.F_ADDRESS, p.F_PINYIN, p.F_ALIAS,
              p.F_IS_HEIR, p.F_ORIGINAL_DATA, p.F_LNG_LAT, p.F_EDIT_TIME,
              ${hasRelation ? "r.F_PARENT_ID, r.F_PARENT_NAME, r.F_FATHER_ID" : "NULL AS F_PARENT_ID, NULL AS F_PARENT_NAME, NULL AS F_FATHER_ID"},
              ${
                hasInfo
                  ? "i.F_SPOUSE, i.F_SPOUSE_INFO, i.F_DESCRIPTION, i.F_VOLUME, i.F_PHONE, i.F_COMPANY, i.F_POSITION, i.F_PROFESSIONAL_TITLE, i.F_COLLEGE, i.F_DEGREE"
                  : "NULL AS F_SPOUSE, NULL AS F_SPOUSE_INFO, NULL AS F_DESCRIPTION, NULL AS F_VOLUME, NULL AS F_PHONE, NULL AS F_COMPANY, NULL AS F_POSITION, NULL AS F_PROFESSIONAL_TITLE, NULL AS F_COLLEGE, NULL AS F_DEGREE"
              }
       FROM tb_people p
       ${hasRelation ? "LEFT JOIN tb_people_relation r ON r.F_PEOPLE_ID = p.F_ID" : ""}
       ${hasInfo ? "LEFT JOIN tb_people_info i ON i.F_PEOPLE_ID = p.F_ID" : ""}
       WHERE p.F_ID IN (${ph})`,
      chunk,
    );
    for (const r of rows) {
      map.set(Number(r.F_ID), {
        id: Number(r.F_ID),
        name: String(r.F_NAME || ""),
        sex: String(r.F_SEX || "男"),
        no: r.F_NO ?? null,
        level: r.F_LEVEL != null ? Number(r.F_LEVEL) : null,
        groupName: r.F_GROUP ?? null,
        birthday: r.F_BIRTHDAY ?? null,
        deathday: r.F_DEATHDAY ?? null,
        address: r.F_ADDRESS ?? null,
        pinyin: r.F_PINYIN ?? null,
        alias: r.F_ALIAS ?? null,
        isHeir: r.F_IS_HEIR ?? null,
        originalData: r.F_ORIGINAL_DATA ?? null,
        lngLat: r.F_LNG_LAT ?? null,
        parentId: r.F_PARENT_ID != null ? Number(r.F_PARENT_ID) || null : null,
        parentName: r.F_PARENT_NAME ?? null,
        birthFatherId:
          r.F_FATHER_ID != null ? Number(r.F_FATHER_ID) || null : null,
        spouse: r.F_SPOUSE ?? null,
        spouseInfo: r.F_SPOUSE_INFO ?? null,
        description: r.F_DESCRIPTION ?? null,
        volume: r.F_VOLUME ?? null,
        phone: r.F_PHONE ?? null,
        company: r.F_COMPANY ?? null,
        position: r.F_POSITION ?? null,
        professionalTitle: r.F_PROFESSIONAL_TITLE ?? null,
        college: r.F_COLLEGE ?? null,
        degree: r.F_DEGREE ?? null,
        editTime: r.F_EDIT_TIME ?? null,
      });
    }
  }
  return map;
}

function formatGroupTitle(group: string | null | undefined): string {
  if (!group) return "孔子世家譜";
  const parts = group
    .split(/[,，/]/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "零" && s !== "0");
  if (!parts.length) return "孔子世家譜";
  // 边栏题：取末两段有意义名称
  const tail = parts.slice(-2);
  return tail.join("\n");
}

export async function buildPublishByPerson(
  personId: number,
  up: number,
  down: number,
): Promise<PublishPayload | null> {
  const focus = await getPeopleById(personId);
  if (!focus) return null;

  const upN = Math.min(10, Math.max(0, up));
  const downN = Math.min(6, Math.max(0, down));
  const cap = 280;

  const ancestors = upN > 0 ? await getAncestors(personId, upN) : [];
  const descLite = await collectDescendants(personId, downN, cap);
  const allIds = [
    focus.id,
    ...ancestors.map((a) => a.id),
    ...descLite.map((d) => d.id),
  ];
  const hydrated = await hydratePeople(allIds);

  const people: PeopleRow[] = [];
  for (const id of allIds) {
    const p = hydrated.get(id);
    if (p) people.push(p);
  }
  // 保留祖先顺序信息；hydrate 后 siblingOrder 可能丢失，用 lite 补
  const orderMap = new Map<number, number | null | undefined>();
  for (const d of descLite) orderMap.set(d.id, d.siblingOrder);
  for (const p of people) {
    if (orderMap.has(p.id)) p.siblingOrder = orderMap.get(p.id) ?? null;
  }

  const childMap = await loadChildMap(people.map((p) => p.id));

  const generations = groupByLevel(people, childMap, focus.id);
  return {
    mode: "person",
    title: formatGroupTitle(focus.groupName),
    subtitle: `以「${focus.name}」为中心 · 上${upN}代 · 下${downN}代`,
    generations,
    total: people.length,
    focusId: focus.id,
  };
}

export async function buildPublishByBranch(
  group: string,
  limit: number | "all" = 100,
): Promise<PublishPayload> {
  const g = group.trim();
  const variants = await resolvePeopleGroupPatterns(g);
  if (!variants.length) {
    return {
      mode: "branch",
      title: formatGroupTitle(g),
      subtitle: `派户支「${g}」· 共 0 人`,
      generations: [],
      total: 0,
    };
  }

  const PUBLISH_BRANCH_MAX = 20000;
  const take =
    limit === "all"
      ? PUBLISH_BRANCH_MAX
      : Math.min(PUBLISH_BRANCH_MAX, Math.max(1, Math.floor(limit)));

  const params: Record<string, unknown> = {};
  const groupClause = likeOrClause(
    ["p.F_GROUP"],
    variants,
    "groupName",
    params,
  );

  const countRows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM tb_people p WHERE ${groupClause}`,
    params,
  );
  const matchedTotal = Number(countRows[0]?.c || 0);

  const idRows = await query<RowDataPacket[]>(
    `SELECT p.F_ID
     FROM tb_people p
     WHERE ${groupClause}
     ORDER BY p.F_LEVEL IS NULL, p.F_LEVEL ASC, p.F_LEFT ASC, p.F_ID ASC
     LIMIT ${take}`,
    params,
  );
  const ids = idRows.map((r) => Number(r.F_ID));
  const hydrated = await hydratePeople(ids);
  const people = ids
    .map((id) => hydrated.get(id))
    .filter((p): p is PeopleRow => Boolean(p));

  const childMap = await loadChildMap(people.map((p) => p.id));

  const truncated = matchedTotal > people.length;
  const limitLabel =
    limit === "all" ? "全部" : `前 ${people.length} 人`;
  return {
    mode: "branch",
    title: formatGroupTitle(g),
    subtitle: `派户支「${g}」· 匹配 ${matchedTotal} 人 · 本刊收录 ${people.length} 人（${limitLabel}${
      truncated && limit === "all" ? `，上限 ${PUBLISH_BRANCH_MAX}` : ""
    }）`,
    generations: groupByLevel(people, childMap),
    total: people.length,
  };
}
