import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, roomMembers, roomInvites } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { asc, eq } from "drizzle-orm";
import crypto from "crypto";

export async function GET() {
  await ensureSeed();
  const s = await getSession();
  const all = await db
    .select()
    .from(rooms)
    .orderBy(asc(rooms.createdAt))
    .all();

  let list = all;
  if (s) {
    const mine = await db
      .select({ roomId: roomMembers.roomId })
      .from(roomMembers)
      .where(eq(roomMembers.accountId, s.id))
      .all();
    const memberIds = new Set(mine.map((r) => r.roomId));
    list = all.filter((r) => r.isPublic || memberIds.has(r.id));
  } else {
    list = all.filter((r) => r.isPublic);
  }

  return NextResponse.json({ rooms: list });
}

/**
 * 创建房间。isPrivate=true 时为私密房：创建者自动成为成员，并生成一张
 * 可多次使用（默认 20 次）的邀请码返回给创建者用于邀请他人。
 */
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { name, topic, isPrivate } = await req.json().catch(() => ({}));
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "房间名必填" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const isPrv = !!isPrivate;
  await db.insert(rooms).values({
    id,
    name: name.trim().slice(0, 40),
    topic: topic ? String(topic).slice(0, 200) : "",
    createdBy: s.id,
    isPublic: !isPrv,
  });

  let inviteCode: string | undefined;
  if (isPrv) {
    await db
      .insert(roomMembers)
      .values({ roomId: id, accountId: s.id })
      .onConflictDoNothing();
    inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();
    await db.insert(roomInvites).values({
      code: inviteCode,
      roomId: id,
      createdBy: s.id,
      maxUses: 20,
    });
  }

  return NextResponse.json({ id, name: name.trim(), inviteCode });
}
