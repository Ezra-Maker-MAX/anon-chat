import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, messages, roomMembers } from "@/lib/schema";
import { isAdmin } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { sql, eq, desc } from "drizzle-orm";

export async function GET() {
  await ensureSeed();
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      topic: rooms.topic,
      isPublic: rooms.isPublic,
      createdBy: rooms.createdBy,
      createdAt: rooms.createdAt,
      msgCount: sql<number>`count(distinct ${messages.seq})`,
      memberCount: sql<number>`count(distinct ${roomMembers.accountId})`,
    })
    .from(rooms)
    .leftJoin(messages, eq(messages.roomId, rooms.id))
    .leftJoin(roomMembers, eq(roomMembers.roomId, rooms.id))
    .groupBy(rooms.id)
    .orderBy(desc(rooms.createdAt));

  return NextResponse.json({ rooms: rows });
}
