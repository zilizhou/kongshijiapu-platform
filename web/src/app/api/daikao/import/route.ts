import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { parseImportFile } from "@/lib/people-import";
import {
  applyParsedImportRows,
  applyResolvedImportItems,
} from "@/lib/people-import-apply";

const MAX_ROWS = 200;
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (user.role !== "editor" && user.role !== "admin") {
      return NextResponse.json(
        { error: "仅录入员或管理员可批量导入" },
        { status: 403 },
      );
    }

    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await req.json();
      const submit = Boolean(body.submit);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) {
        return NextResponse.json({ error: "没有待确认的行" }, { status: 400 });
      }
      if (items.length > MAX_ROWS) {
        return NextResponse.json(
          { error: `单次最多 ${MAX_ROWS} 行` },
          { status: 400 },
        );
      }
      const data = await applyResolvedImportItems({
        user,
        scope: "daikao",
        submit,
        items,
      });
      return NextResponse.json(data);
    }

    const form = await req.formData();
    const file = form.get("file");
    const submit = String(form.get("submit") || "0") === "1";
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "请上传 Excel（.xlsx）文件" },
        { status: 400 },
      );
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
        {
          error: `单次最多导入 ${MAX_ROWS} 行，当前 ${parsed.rows.length} 行`,
        },
        { status: 400 },
      );
    }
    const data = await applyParsedImportRows({
      user,
      scope: "daikao",
      submit,
      rows: parsed.rows,
      parseErrors: parsed.errors,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "导入失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
