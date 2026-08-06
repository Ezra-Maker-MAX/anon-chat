import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { messages, accounts, rooms } from "@/lib/schema";
import { isAdmin } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  await ensureSeed();
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const rows = await db
    .select({
      seq: messages.seq,
      roomId: messages.roomId,
      accountId: messages.accountId,
      kind: messages.kind,
      body: messages.body,
      createdAt: messages.createdAt,
      burnsAt: messages.burnsAt,
      handle: accounts.handle,
      roomName: rooms.name,
    })
    .from(messages)
    .leftJoin(accounts, eq(messages.accountId, accounts.id))
    .leftJoin(rooms, eq(messages.roomId, rooms.id))
    .orderBy(desc(messages.seq))
    .limit(100);

  return NextResponse.json({ messages: rows });
}
