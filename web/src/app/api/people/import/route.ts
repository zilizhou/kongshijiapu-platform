import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPeopleById, searchPeople } from "@/lib/people";
import { parseImportFile, type ImportRowResult } from "@/lib/people-import";
import { createRequest } from "@/lib/workflow";

const MAX_ROWS = 200;
const MAX_BYTES = 2 * 1024 * 1024;

async function resolveParentId(
  parentId: number | null | undefined,
  parentName: string | undefined,
): Promise<number | null> {
  if (parentId != null && parentId > 0) {
    const p = await getPeopleById(parentId);
    if (!p) throw new Error(`当前父ID ${parentId} 不存在`);
    return parentId;
  }
  const name = (parentName || "").trim();
  if (!name) return null;
  const found = await searchPeople({ name, page: 1, pageSize: 5 });
  const exact = found.items.filter((x) => x.name === name);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) {
    throw new Error(`当前父「${name}」匹配到多人，请改填当前父ID`);
  }
  if (found.items.length === 1) return found.items[0].id;
  throw new Error(`未找到当前父「${name}」，请填写当前父ID`);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "editor" && user.role !== "admin") {
      return NextResponse.json({ error: "仅录入员或管理员可批量导入" }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get("file");
    // 默认暂存到「我的编修」，仅显式传 submit=1 时才提交审核
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

    for (const item of parsed.rows) {
      try {
        const parentId = await resolveParentId(
          item.payload.parentId,
          item.parentName,
        );
        const payload = { ...item.payload, parentId };
        const created = await createRequest({
          user,
          objectType: "people",
          operation: "create",
          objectId: null,
          payload,
          submit,
        });
        results.push({
          row: item.row,
          name: payload.name,
          ok: true,
          requestId: created?.id,
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
    const failCount = results.length - okCount;

    return NextResponse.json({
      total: results.length,
      okCount,
      failCount,
      submit,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "导入失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
