import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { buildImportTemplateXlsx } from "@/lib/people-import";

export async function GET() {
  try {
    const user = await requireSession();
    if (user.role !== "editor" && user.role !== "admin") {
      return NextResponse.json({ error: "仅录入员或管理员可下载模板" }, { status: 403 });
    }
    const buf = await buildImportTemplateXlsx();
    const filename = `家谱成员导入模板.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "下载失败";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
