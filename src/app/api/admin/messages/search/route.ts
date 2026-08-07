import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { messages, accounts, rooms } from "@/lib/schema";
import { isAdmin } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { eq, desc, like, and, or, sql } from "drizzle-orm";

/**
 * 管理员消息检索：支持按关键词、昵称、房间名过滤。
 * ?q=关键词   — 模糊匹配消息内容
 * ?handle=昵称 — 模糊匹配发送者昵称
 * ?room=房间名 — 模糊匹配房间名
 * ?kind=类型   — 精确匹配消息类型 (text/image/voice/video)
 * 三个模糊条件可组合使用（AND 关系）。
 */
export async function GET(req: NextRequest) {
  await ensureSeed();
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const handle = searchParams.get("handle")?.trim() || "";
  const room = searchParams.get("room")?.trim() || "";
  const kind = searchParams.get("kind")?.trim() || "";

  const conditions = [];
  if (q) conditions.push(like(messages.body, `%${q}%`));
  if (handle) conditions.push(like(accounts.handle, `%${handle}%`));
  if (room) conditions.push(like(rooms.name, `%${room}%`));
  if (kind) conditions.push(eq(messages.kind, kind));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const query = db
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
      roomEncrypted: rooms.encrypted,
    })
    .from(messages)
    .leftJoin(accounts, eq(messages.accountId, accounts.id))
    .leftJoin(rooms, eq(messages.roomId, rooms.id));

  const rows = where
    ? await query.where(where).orderBy(desc(messages.seq)).limit(200)
    : await query.orderBy(desc(messages.seq)).limit(200);

  return NextResponse.json({
    messages: rows,
    count: rows.length,
    filters: { q, handle, room, kind },
  });
}
