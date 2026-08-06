import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { setSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

/**
 * 登录：匿名"多账号"模型 —— 用本地保存的 credential 换取会话。
 * 被封禁的账号无法登录。
 */
export async function POST(req: NextRequest) {
  const { credential } = await req.json().catch(() => ({}));
  if (!credential || typeof credential !== "string") {
    return NextResponse.json({ error: "缺少凭证" }, { status: 400 });
  }

  const acc = await db
    .select()
    .from(accounts)
    .where(eq(accounts.credential, credential))
    .get();

  if (!acc) {
    return NextResponse.json({ error: "凭证无效" }, { status: 401 });
  }
  if (acc.banned) {
    return NextResponse.json({ error: "该账号已被封禁" }, { status: 403 });
  }

  await setSession({ sub: acc.id, handle: acc.handle });
  return NextResponse.json({ id: acc.id, handle: acc.handle });
}
