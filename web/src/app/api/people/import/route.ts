import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPeopleById, searchPeople } from "@/lib/people";
import {
  parseImportFile,
  type ImportRowResult,
  type ParentCandidate,
  type PendingParentPick,
} from "@/lib/people-import";
import type { PeoplePayload, SessionUser } from "@/lib/types";
import { createRequest } from "@/lib/workflow";
import { searchTextVariants } from "@/lib/zh";

const MAX_ROWS = 200;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CANDIDATES = 50;

type ResolveOk = { ok: true; parentId: number | null };
type ResolveAmbiguous = {
  ok: false;
  ambiguous: true;
  parentName: string;
  candidates: ParentCandidate[];
  candidateTotal: number;
};
type ResolveFail = { ok: false; ambiguous: false; error: string };

function toCandidate(p: {
  id: number;
  name: string;
  sex: string;
  level: number | null;
  groupName: string | null;
  parentName: string | null;
  address: string | null;
  no: string | null;
}): ParentCandidate {
  return {
    id: p.id,
    name: p.name,
    sex: p.sex,
    level: p.level,
    groupName: p.groupName,
    parentName: p.parentName,
    address: p.address,
    no: p.no,
  };
}

async function resolveParentId(
  parentId: number | null | undefined,
  parentName: string | undefined,
): Promise<ResolveOk | ResolveAmbiguous | ResolveFail> {
  if (parentId != null && parentId > 0) {
    const p = await getPeopleById(parentId);
    if (!p) return { ok: false, ambiguous: false, error: `所选父亲（ID ${parentId}）不存在` };
    return { ok: true, parentId };
  }
  const name = (parentName || "").trim();
  if (!name) return { ok: true, parentId: null };

  const found = await searchPeople({ name, page: 1, pageSize: MAX_CANDIDATES });
  const variants = new Set(searchTextVariants(name));
  const exact = found.items.filter((x) => variants.has(x.name));

  if (exact.length === 1) return { ok: true, parentId: exact[0].id };
  if (exact.length > 1) {
    return {
      ok: false,
      ambiguous: true,
      parentName: name,
      candidates: exact.map(toCandidate),
      // 若精确同名已占满一页，总数可能更多
      candidateTotal:
        exact.length >= MAX_CANDIDATES
          ? Math.max(exact.length, found.total)
          : exact.length,
    };
  }
  if (found.items.length === 1) return { ok: true, parentId: found.items[0].id };
  if (found.items.length > 1) {
    // 模糊命中多人但无精确同名：仍列出供选择
    return {
      ok: false,
      ambiguous: true,
      parentName: name,
      candidates: found.items.map(toCandidate),
      candidateTotal: found.total,
    };
  }
  return {
    ok: false,
    ambiguous: false,
    error: `未找到当前父「${name}」，请核对姓名或先录入父亲`,
  };
}

async function createOne(
  user: SessionUser,
  payload: PeoplePayload,
  submit: boolean,
): Promise<{ requestId?: number }> {
  const created = await createRequest({
    user,
    objectType: "people",
    operation: "create",
    objectId: null,
    payload,
    submit,
  });
  return { requestId: created?.id };
}

/** 继续导入：已选定父亲的待处理行 */
async function handleResolved(
  req: NextRequest,
  user: SessionUser,
) {
  const body = await req.json();
  const submit = Boolean(body.submit);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return NextResponse.json({ error: "没有待确认的行" }, { status: 400 });
  }
  if (items.length > MAX_ROWS) {
    return NextResponse.json({ error: `单次最多 ${MAX_ROWS} 行` }, { status: 400 });
  }

  const results: ImportRowResult[] = [];
  for (const item of items) {
    const row = Number(item.row);
    const payload = item.payload as PeoplePayload | undefined;
    const parentId = Number(item.parentId);
    if (!payload?.name) {
      results.push({ row, name: "", ok: false, error: "缺少成员数据" });
      continue;
    }
    if (!Number.isFinite(parentId) || parentId <= 0) {
      results.push({
        row,
        name: payload.name,
        ok: false,
        error: "请选择父亲",
      });
      continue;
    }
    try {
      const resolved = await resolveParentId(parentId, undefined);
      if (!resolved.ok) {
        results.push({
          row,
          name: payload.name,
          ok: false,
          error: resolved.ambiguous
            ? "所选父亲仍无法唯一确定"
            : resolved.error,
        });
        continue;
      }
      const created = await createOne(
        user,
        { ...payload, parentId: resolved.parentId },
        submit,
      );
      results.push({
        row,
        name: payload.name,
        ok: true,
        requestId: created.requestId,
      });
    } catch (e) {
      results.push({
        row,
        name: payload.name,
        ok: false,
        error: e instanceof Error ? e.message : "导入失败",
      });
    }
  }

  results.sort((a, b) => a.row - b.row);
  return NextResponse.json({
    total: results.length,
    okCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
    pendingCount: 0,
    pending: [],
    submit,
    results,
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "editor" && user.role !== "admin") {
      return NextResponse.json({ error: "仅录入员或管理员可批量导入" }, { status: 403 });
    }

    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return handleResolved(req, user);
    }

    const form = await req.formData();
    const file = form.get("file");
    const submit = String(form.get("submit") || "0") === "1";

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请上传 Excel（.xlsx）文件" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "文件不能超过 2MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseImportFile(buffer, file.name || "import.xlsx");
    if (parsed.errors.length && !parsed.rows.length) {
      return NextResponse.json(
        { error: "解析失败", parseErrors: parsed.errors },
        { status: 400 },
      );
    }
    if (parsed.rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `单次最多导入 ${MAX_ROWS} 行，当前 ${parsed.rows.length} 行` },
        { status: 400 },
      );
    }

    const results: ImportRowResult[] = parsed.errors.map((e) => ({
      row: e.row,
      name: "",
      ok: false,
      error: e.error,
    }));
    const pending: PendingParentPick[] = [];

    for (const item of parsed.rows) {
      try {
        const resolved = await resolveParentId(
          item.payload.parentId,
          item.parentName,
        );
        if (!resolved.ok) {
          if (resolved.ambiguous) {
            pending.push({
              row: item.row,
              name: item.payload.name,
              parentName: resolved.parentName,
              payload: item.payload,
              candidates: resolved.candidates,
              candidateTotal: resolved.candidateTotal,
            });
            results.push({
              row: item.row,
              name: item.payload.name,
              ok: false,
              pendingParent: true,
              error: `父亲「${resolved.parentName}」重名，请选择`,
            });
          } else {
            results.push({
              row: item.row,
              name: item.payload.name,
              ok: false,
              error: resolved.error,
            });
          }
          continue;
        }

        const payload = { ...item.payload, parentId: resolved.parentId };
        const created = await createOne(user, payload, submit);
        results.push({
          row: item.row,
          name: payload.name,
          ok: true,
          requestId: created.requestId,
        });
      } catch (e) {
        results.push({
          row: item.row,
          name: item.payload.name,
          ok: false,
          error: e instanceof Error ? e.message : "导入失败",
        });
      }
    }

    results.sort((a, b) => a.row - b.row);
    const okCount = results.filter((r) => r.ok).length;
    const pendingCount = pending.length;
    const failCount = results.filter((r) => !r.ok && !r.pendingParent).length;

    return NextResponse.json({
      total: results.length,
      okCount,
      failCount,
      pendingCount,
      pending,
      submit,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "导入失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
