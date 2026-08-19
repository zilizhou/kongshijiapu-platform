import { RowDataPacket } from "mysql2/promise";
import {
  daikaoRowToPeopleRow,
  ensureDaikaoSchema,
  getDaikaoById,
  getDaikaoChildren,
} from "./daikao";
import { query } from "./db";
import type { LineageNode, PeoplePayload, PeopleRow } from "./types";

function toLineageNode(p: PeopleRow): LineageNode {
  return {
    id: p.id,
    name: p.name,
    sex: p.sex,
    no: p.no,
    level: p.level,
    spouse: p.spouse,
    rank: p.rank || null,
    children: [],
  };
}

type PendingCreate = {
  requestId: number;
  name: string;
  sex: string;
  level: number | null;
  rank: string | null;
  parentId: number | null;
  asParentOf: number | null;
};

function pendingToNode(p: PendingCreate): LineageNode {
  return {
    id: -p.requestId,
    name: p.name || "（未命名）",
    sex: p.sex === "女" ? "女" : "男",
    no: null,
    level: p.level,
    spouse: null,
    rank: p.rank || "待审",
    children: [],
    pending: true,
    requestId: p.requestId,
  };
}

function walkInjectChild(
  node: LineageNode,
  parentId: number,
  child: LineageNode,
): boolean {
  if (node.id === parentId) {
    node.children = [...node.children, child];
    return true;
  }
  for (const c of node.children) {
    if (walkInjectChild(c, parentId, child)) return true;
  }
  return false;
}

function walkInjectAsParent(
  node: LineageNode,
  childId: number,
  parent: LineageNode,
): boolean {
  for (let i = 0; i < node.children.length; i++) {
    if (node.children[i].id === childId) {
      parent.children = [node.children[i], ...parent.children];
      node.children[i] = parent;
      return true;
    }
    if (walkInjectAsParent(node.children[i], childId, parent)) return true;
  }
  return false;
}

function mapPendingCreateRow(r: RowDataPacket): PendingCreate {
  const payload =
    typeof r.payload === "string"
      ? (JSON.parse(r.payload) as PeoplePayload)
      : (r.payload as PeoplePayload);
  const parentId =
    payload.parentId != null && Number(payload.parentId) !== 0
      ? Number(payload.parentId)
      : null;
  const asParentOf =
    payload.asParentOf != null && Number(payload.asParentOf) !== 0
      ? Number(payload.asParentOf)
      : null;
  return {
    requestId: Number(r.id),
    name: String(payload.name || ""),
    sex: payload.sex === "女" ? "女" : "男",
    level: payload.level ?? null,
    rank: payload.rank || null,
    parentId,
    asParentOf,
  };
}

async function loadPendingCreates(
  relatedIds: number[],
): Promise<PendingCreate[]> {
  if (!relatedIds.length) return [];
  const found = new Map<number, PendingCreate>();
  let anchors = [...relatedIds];

  for (let round = 0; round < 6 && anchors.length; round++) {
    const placeholders = anchors.map((_, i) => `:a${round}_${i}`).join(",");
    const params: Record<string, unknown> = {};
    anchors.forEach((v, i) => {
      params[`a${round}_${i}`] = v;
    });
    const exclude = [...found.keys()];
    const excludeSql = exclude.length
      ? `AND id NOT IN (${exclude.map((_, i) => `:ex${round}_${i}`).join(",")})`
      : "";
    exclude.forEach((v, i) => {
      params[`ex${round}_${i}`] = v;
    });

    const rows = await query<RowDataPacket[]>(
      `SELECT id, payload
       FROM app_change_requests
       WHERE operation = 'create'
         AND object_type = 'daikao'
         AND status IN ('draft', 'pending_1', 'pending_2', 'pending_final')
         AND (
           CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.parentId')) AS SIGNED) IN (${placeholders})
           OR CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.asParentOf')) AS SIGNED) IN (${placeholders})
         )
         ${excludeSql}
       ORDER BY id ASC`,
      params,
    );
    const nextAnchors: number[] = [];
    for (const r of rows) {
      const pc = mapPendingCreateRow(r);
      if (found.has(pc.requestId)) continue;
      found.set(pc.requestId, pc);
      nextAnchors.push(-pc.requestId);
    }
    anchors = nextAnchors;
  }

  return [...found.values()];
}

function collectLineageIds(node: LineageNode, ids: Set<number>) {
  if (node.id > 0) ids.add(node.id);
  for (const c of node.children) collectLineageIds(c, ids);
}

async function getDaikaoAncestors(id: number, maxUp: number): Promise<PeopleRow[]> {
  const out: PeopleRow[] = [];
  let cursor = id;
  const seen = new Set<number>();
  for (let i = 0; i < maxUp; i++) {
    const row = await getDaikaoById(cursor);
    if (!row?.parentId || seen.has(row.parentId)) break;
    seen.add(row.parentId);
    const parent = await getDaikaoById(row.parentId);
    if (!parent) break;
    out.push(daikaoRowToPeopleRow(parent));
    cursor = parent.id;
  }
  return out.reverse();
}

async function buildDaikaoTree(
  root: PeopleRow,
  maxLevel: number,
  relatedIds: Set<number>,
): Promise<LineageNode> {
  const rootNode = toLineageNode(root);
  const byId = new Map<number, LineageNode>([[root.id, rootNode]]);
  let frontier = [root.id];
  relatedIds.add(root.id);

  while (frontier.length) {
    const placeholders = frontier.map((_, i) => `:p${i}`).join(",");
    const params: Record<string, unknown> = {};
    frontier.forEach((v, i) => {
      params[`p${i}`] = v;
    });
    const rows = await query<RowDataPacket[]>(
      `SELECT d.id, d.parent_id, d.name, d.sex, d.spectrum_no, d.generation,
              d.group_raw, d.spouse, d.rank_label, s.sort_no
       FROM tb_daikao_people d
       LEFT JOIN app_daikao_sibling_order s ON s.people_id = d.id
       WHERE d.parent_id IN (${placeholders})
       ORDER BY IFNULL(s.sort_no, 9999) ASC, d.id ASC`,
      params,
    );
    const next: number[] = [];
    for (const r of rows) {
      const id = Number(r.id);
      const parentId = Number(r.parent_id);
      const level = r.generation != null ? Number(r.generation) : null;
      if (level != null && maxLevel >= 0 && level > maxLevel) continue;
      const node: LineageNode = {
        id,
        name: String(r.name || ""),
        sex: String(r.sex || "男"),
        no: r.spectrum_no != null ? String(r.spectrum_no) : null,
        level,
        spouse: r.spouse != null ? String(r.spouse) : null,
        rank: r.rank_label != null ? String(r.rank_label) : null,
        children: [],
      };
      const parent = byId.get(parentId);
      if (!parent) continue;
      parent.children.push(node);
      byId.set(id, node);
      relatedIds.add(id);
      next.push(id);
    }
    frontier = next;
  }

  return rootNode;
}

export async function getDaikaoLineageTree(
  id: number,
  opts?: { up?: number; down?: number },
) {
  await ensureDaikaoSchema();
  const up = Math.min(10, Math.max(0, opts?.up ?? 1));
  const down = Math.min(10, Math.max(0, opts?.down ?? 1));

  const daikao = await getDaikaoById(id);
  if (!daikao) return null;
  const focus = daikaoRowToPeopleRow(daikao);
  const ancestors = up > 0 ? await getDaikaoAncestors(id, up) : [];
  const rootPerson = ancestors[0] || focus;
  const focusLevel = Number(focus.level ?? 0);
  const maxLevel = focusLevel + down;

  const relatedIds = new Set<number>([
    focus.id,
    rootPerson.id,
    ...ancestors.map((a) => a.id),
  ]);

  const tree = await buildDaikaoTree(rootPerson, maxLevel, relatedIds);
  collectLineageIds(tree, relatedIds);

  let reviewingIds: number[] = [];
  let pendingSiblings: LineageNode[] = [];
  let pendingParents: { asParentOf: number; node: LineageNode }[] = [];
  try {
    const ids = [...relatedIds];
    if (ids.length) {
      const placeholders = ids.map((_, i) => `:id${i}`).join(",");
      const params: Record<string, unknown> = {};
      ids.forEach((v, i) => {
        params[`id${i}`] = v;
      });
      const reviewing = await query<RowDataPacket[]>(
        `SELECT DISTINCT object_id AS id
         FROM app_change_requests
         WHERE object_type = 'daikao'
           AND object_id IN (${placeholders})
           AND status IN ('draft', 'pending_1', 'pending_2', 'pending_final')
           AND operation IN ('update', 'delete', 'reorder')`,
        params,
      );
      reviewingIds = reviewing.map((r) => Number(r.id)).filter(Boolean);

      const pendingCreates = await loadPendingCreates(ids);
      const asParents = pendingCreates.filter((pc) => pc.asParentOf);
      const asChildren = pendingCreates.filter((pc) => !pc.asParentOf);

      for (const pc of asChildren) {
        const node = pendingToNode(pc);
        if (pc.parentId != null && walkInjectChild(tree, pc.parentId, node)) {
          continue;
        }
        if (
          pc.parentId != null &&
          focus.parentId != null &&
          pc.parentId === focus.parentId
        ) {
          pendingSiblings.push(node);
        }
      }

      for (const pc of asParents) {
        const node = pendingToNode(pc);
        const target = pc.asParentOf!;
        if (target > 0) {
          pendingParents.push({ asParentOf: target, node });
          continue;
        }
        if (walkInjectAsParent(tree, target, node)) continue;
        const sibIdx = pendingSiblings.findIndex((s) => s.id === target);
        if (sibIdx >= 0) {
          node.children = [pendingSiblings[sibIdx], ...node.children];
          pendingSiblings[sibIdx] = node;
          continue;
        }
        pendingParents.push({ asParentOf: target, node });
      }
    }
  } catch {
    reviewingIds = [];
    pendingSiblings = [];
    pendingParents = [];
  }

  return {
    focus,
    ancestors,
    tree,
    up,
    down,
    reviewingIds,
    pendingSiblings,
    pendingParents,
  };
}

export async function getDaikaoYiziLine(
  id: number,
  opts?: { up?: number; down?: number },
) {
  await ensureDaikaoSchema();
  const up = Math.min(100, Math.max(0, opts?.up ?? 1));
  const down = Math.min(30, Math.max(0, opts?.down ?? 1));
  const daikao = await getDaikaoById(id);
  if (!daikao) return null;
  const focus = daikaoRowToPeopleRow(daikao);
  const ancestors = await getDaikaoAncestors(id, up);

  const descendants: PeopleRow[] = [];
  let cursorId = id;
  for (let i = 0; i < down; i++) {
    const kids = await getDaikaoChildren(cursorId);
    const next = kids[0];
    if (!next) break;
    descendants.push(daikaoRowToPeopleRow(next));
    cursorId = next.id;
  }

  return {
    focus,
    line: [...ancestors, focus, ...descendants],
    up,
    down,
    ancestorCount: ancestors.length,
    descendantCount: descendants.length,
  };
}
