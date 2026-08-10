import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import {
  assertOcrConfigured,
  buildFormOcrPreview,
  recognizeFormImage,
  validateImageUpload,
} from "@/lib/form-ocr";

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (!["editor", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "仅录入员可使用表单识别" }, { status: 403 });
    }
    assertOcrConfigured();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传登记表图片" }, { status: 400 });
    }
    validateImageUpload({ size: file.size, type: file.type });

    const buffer = Buffer.from(await file.arrayBuffer());
    const recognized = await recognizeFormImage({
      buffer,
      mimeType: file.type || "image/jpeg",
      filename: file.name,
    });
    const items = await buildFormOcrPreview({
      sheet: recognized.sheet,
      people: recognized.people,
    });

    return NextResponse.json({
      sheet: recognized.sheet,
      model: recognized.model,
      peopleCount: recognized.people.length,
      items,
    });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "识别失败";
    return NextResponse.json({ error: msg }, { status: status || 500 });
  }
}
