import { getDaikaoById, searchDaikao } from "./daikao";
import { getPeopleById, searchPeople } from "./people";
import type {
  ImportRowResult,
  ParentCandidate,
  PendingParentPick,
} from "./people-import";
import type { PeopleScope } from "./people-scope";
import { objectTypeOf } from "./people-scope";
import type { PeoplePayload, SessionUser } from "./types";
import { createRequest } from "./workflow";
import { searchTextVariants } from "./zh";

const MAX_CANDIDATES = 5000;

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

async function lookupById(scope: PeopleScope, id: number) {
  if (scope === "daikao") {
    const d = await getDaikaoById(id);
    if (!d) return null;
    return {
      id: d.id,
      name: d.name,
      sex: d.sex,
      level: d.generation,
      groupName: d.groupRaw,
      parentName: d.parentName,
      address: d.address,
      no: d.spectrumNo,
    };
  }
  const p = await getPeopleById(id);
  if (!p) return null;
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

async function searchExact(scope: PeopleScope, name: string) {
  if (scope === "daikao") {
    const found = await searchDaikao({
      name,
      exactName: true,
      page: 1,
      pageSize: MAX_CANDIDATES,
    });
    return {
      items: found.items.map((d) => ({
        id: d.id,
        name: d.name,
        sex: d.sex,
        level: d.generation,
        groupName: d.groupRaw,
        parentName: d.parentName,
        address: d.address,
        no: d.spectrumNo,
      })),
      total: found.total,
    };
  }
  const found = await searchPeople({
    name,
    exactName: true,
    page: 1,
    pageSize: MAX_CANDIDATES,
  });
  return {
    items: found.items.map((p) => ({
      id: p.id,
      name: p.name,
      sex: p.sex,
      level: p.level,
      groupName: p.groupName,
      parentName: p.parentName,
      address: p.address,
      no: p.no,
    })),
    total: found.total,
  };
}

export async function resolveImportParent(
  scope: PeopleScope,
  parentId: number | null | undefined,
  parentName: string | undefined,
): Promise<ResolveOk | ResolveAmbiguous | ResolveFail> {
  if (parentId != null && parentId > 0) {
    const p = await lookupById(scope, parentId);
    if (!p) {
      return {
        ok: false,
        ambiguous: false,
        error: `所选父亲（ID ${parentId}）不存在`,
      };
    }
    return { ok: true, parentId };
  }
  const name = (parentName || "").trim();
  if (!name) return { ok: true, parentId: null };

  const found = await searchExact(scope, name);
  const variants = new Set(searchTextVariants(name));
  const exact = found.items.filter((x) => variants.has(x.name));

  if (exact.length === 1) return { ok: true, parentId: exact[0].id };
  if (exact.length > 1) {
    return {
      ok: false,
      ambiguous: true,
      parentName: name,
      candidates: exact.map(toCandidate),
      candidateTotal:
        exact.length >= MAX_CANDIDATES
          ? Math.max(exact.length, found.total)
          : exact.length,
    };
  }
  if (found.items.length === 1) return { ok: true, parentId: found.items[0].id };
  if (found.items.length > 1) {
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

export async function createImportPerson(
  user: SessionUser,
  scope: PeopleScope,
  payload: PeoplePayload,
  submit: boolean,
): Promise<{ requestId?: number }> {
  const created = await createRequest({
    user,
    objectType: objectTypeOf(scope),
    operation: "create",
    objectId: null,
    payload,
    submit,
  });
  return { requestId: created?.id };
}

export async function applyResolvedImportItems(opts: {
  user: SessionUser;
  scope: PeopleScope;
  submit: boolean;
  items: { row: number; payload?: PeoplePayload; parentId?: number }[];
}) {
  const results: ImportRowResult[] = [];
  for (const item of opts.items) {
    const row = Number(item.row);
    const payload = item.payload;
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
      const resolved = await resolveImportParent(opts.scope, parentId, undefined);
      if (!resolved.ok) {
        results.push({
          row,
          name: payload.name,
          ok: false,
          error: resolved.ambiguous ? "所选父亲仍无法唯一确定" : resolved.error,
        });
        continue;
      }
      const created = await createImportPerson(
        opts.user,
        opts.scope,
        { ...payload, parentId: resolved.parentId },
        opts.submit,
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
  return {
    total: results.length,
    okCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
    pendingCount: 0,
    pending: [] as PendingParentPick[],
    submit: opts.submit,
    results,
  };
}

export async function applyParsedImportRows(opts: {
  user: SessionUser;
  scope: PeopleScope;
  submit: boolean;
  rows: { row: number; payload: PeoplePayload; parentName?: string }[];
  parseErrors: { row: number; error: string }[];
}) {
  const results: ImportRowResult[] = opts.parseErrors.map((e) => ({
    row: e.row,
    name: "",
    ok: false,
    error: e.error,
  }));
  const pending: PendingParentPick[] = [];

  for (const item of opts.rows) {
    try {
      const resolved = await resolveImportParent(
        opts.scope,
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
      const created = await createImportPerson(
        opts.user,
        opts.scope,
        payload,
        opts.submit,
      );
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
  return {
    total: results.length,
    okCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok && !r.pendingParent).length,
    pendingCount: pending.length,
    pending,
    submit: opts.submit,
    results,
  };
}
