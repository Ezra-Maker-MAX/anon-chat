import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, roomMembers, roomInvites } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { and, eq } from "drizzle-orm";

/**
 * 凭私密房邀请码加入：POST { code }。无需知道 roomId，由邀请码反查房间。
 */
export async function POST(req: NextRequest) {
  await ensureSeed();
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "邀请码必填" }, { status: 400 });
  }

  const inv = await db
    .select()
    .from(roomInvites)
    .where(eq(roomInvites.code, code.trim().toUpperCase()))
    .get();

  if (!inv) return NextResponse.json({ error: "邀请码无效" }, { status: 400 });
  if (inv.expiresAt && inv.expiresAt < new Date()) {
    return NextResponse.json({ error: "邀请码已过期" }, { status: 400 });
  }
  if (inv.usedCount >= inv.maxUses) {
    return NextResponse.json({ error: "邀请码已用尽" }, { status: 400 });
  }

  await db
    .insert(roomMembers)
    .values({ roomId: inv.roomId, accountId: s.id })
    .onConflictDoNothing();
  await db
    .update(roomInvites)
    .set({ usedCount: inv.usedCount + 1 })
    .where(eq(roomInvites.code, inv.code));

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, inv.roomId))
    .get();

  return NextResponse.json({ roomId: inv.roomId, name: room?.name ?? "私密房间" });
}
