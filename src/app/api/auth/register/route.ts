import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, inviteCodes } from "@/lib/schema";
import { setSession } from "@/lib/auth";
import { randomHandle } from "@/lib/handle";
import { eq } from "drizzle-orm";
import crypto from "crypto";

/**
 * 注册：必须提供有效且未使用的邀请码。
 * 成功后创建匿名账号并直接签发会话 Cookie。
 */
export async function POST(req: NextRequest) {
  const { code, handle } = await req.json().catch(() => ({}));
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "邀请码必填" }, { status: 400 });
  }

  const inv = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, code.trim().toUpperCase()))
    .get();

  if (!inv || !inv.active || inv.usedBy) {
    return NextResponse.json(
      { error: "邀请码无效或已被使用" },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const credential = crypto.randomBytes(24).toString("hex");
  const finalHandle =
    handle && typeof handle === "string" && handle.trim()
      ? handle.trim().slice(0, 24)
      : randomHandle();

  await db.insert(accounts).values({
    id,
    handle: finalHandle,
    inviteCode: inv.code,
    credential,
  });

  await db
    .update(inviteCodes)
    .set({ usedBy: id, usedAt: new Date() })
    .where(eq(inviteCodes.code, inv.code));

  await setSession({ sub: id, handle: finalHandle });

  return NextResponse.json({ id, handle: finalHandle, credential });
}
