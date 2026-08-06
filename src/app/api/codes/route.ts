import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inviteCodes } from "@/lib/schema";
import { isAdmin } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { desc } from "drizzle-orm";
import crypto from "crypto";

/** 运营侧生成注册邀请码（需管理员权限）。 */
export async function POST(req: NextRequest) {
  await ensureSeed();
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "管理员码错误" }, { status: 403 });
  }
  const { count = 5, note = "" } = await req.json().catch(() => ({}));
  const n = Math.min(Math.max(parseInt(String(count), 10) || 5, 1), 50);

  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = crypto.randomBytes(5).toString("hex").toUpperCase();
    await db.insert(inviteCodes).values({
      code: c,
      createdBy: "admin",
      note: typeof note === "string" ? note : "",
    });
    codes.push(c);
  }
  return NextResponse.json({ codes });
}

/** 查看邀请码列表（需管理员权限）。 */
export async function GET(req: NextRequest) {
  await ensureSeed();
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "管理员码错误" }, { status: 403 });
  }
  const list = await db
    .select()
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt))
    .limit(200);
  return NextResponse.json({ codes: list });
}
