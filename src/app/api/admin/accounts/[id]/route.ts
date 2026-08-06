import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { isAdmin } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { eq } from "drizzle-orm";

/**
 * 封禁账号：软封禁（banned=1），登录将被拒绝。
 * 支持 ?unban=1 解除封禁。
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }
  const { id } = await params;
  const unban = new URL(req.url).searchParams.get("unban") === "1";
  await db
    .update(accounts)
    .set({ banned: !unban })
    .where(eq(accounts.id, id))
    .run();
  return NextResponse.json({ ok: true, banned: !unban });
}
