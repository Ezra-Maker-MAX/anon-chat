import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, roomMembers, roomInvites } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";

/** 私密房成员可生成新的邀请码（默认 20 次使用）。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const mem = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, id), eq(roomMembers.accountId, s.id)))
    .get();
  if (!mem) return NextResponse.json({ error: "无权操作该房间" }, { status: 403 });

  const room = await db
    .select({ isPublic: rooms.isPublic })
    .from(rooms)
    .where(eq(rooms.id, id))
    .get();
  if (!room) return NextResponse.json({ error: "房间不存在" }, { status: 404 });
  if (room.isPublic)
    return NextResponse.json({ error: "公开房无需邀请码" }, { status: 400 });

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  await db.insert(roomInvites).values({
    code,
    roomId: id,
    createdBy: s.id,
    maxUses: 20,
  });

  return NextResponse.json({ code });
}
