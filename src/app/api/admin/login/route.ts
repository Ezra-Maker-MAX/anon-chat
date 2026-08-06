import { NextRequest, NextResponse } from "next/server";
import { setAdminSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { adminCode } = await req.json().catch(() => ({}));
  if (!process.env.ADMIN_CODE || adminCode !== process.env.ADMIN_CODE) {
    return NextResponse.json({ error: "管理员码错误" }, { status: 403 });
  }
  await setAdminSession();
  return NextResponse.json({ ok: true });
}
