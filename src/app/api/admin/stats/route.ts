import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  accounts,
  rooms,
  messages,
  inviteCodes,
  roomInvites,
} from "@/lib/schema";
import { isAdmin } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { sql, eq, desc } from "drizzle-orm";

export async function GET() {
  await ensureSeed();
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const count = async (t: any) =>
    (await db.select({ c: sql<number>`count(*)` }).from(t).get())?.c ?? 0;

  const acc = await count(accounts);
  const banned = await db
    .select({ c: sql<number>`count(*)` })
    .from(accounts)
    .where(eq(accounts.banned, true))
    .get();
  const roomTotal = await count(rooms);
  const privateRooms = await db
    .select({ c: sql<number>`count(*)` })
    .from(rooms)
    .where(eq(rooms.isPublic, false))
    .get();
  const msgTotal = await count(messages);
  const burnedLeft = await db
    .select({ c: sql<number>`count(*)` })
    .from(messages)
    .where(sql`burns_at IS NOT NULL`)
    .get();
  const inviteTotal = await count(inviteCodes);
  const inviteUsed = await db
    .select({ c: sql<number>`count(*)` })
    .from(inviteCodes)
    .where(sql`used_by IS NOT NULL`)
    .get();
  const roomInviteTotal = await count(roomInvites);

  // 最近注册码（运营参考）
  const recentCodes = await db
    .select({ code: inviteCodes.code, usedBy: inviteCodes.usedBy })
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt))
    .limit(10);

  return NextResponse.json({
    accounts: acc,
    banned: banned?.c ?? 0,
    rooms: roomTotal,
    privateRooms: privateRooms?.c ?? 0,
    messages: msgTotal,
    burnMessages: burnedLeft?.c ?? 0,
    regInvites: inviteTotal,
    regInvitesUsed: inviteUsed?.c ?? 0,
    roomInvites: roomInviteTotal,
    recentCodes,
  });
}
