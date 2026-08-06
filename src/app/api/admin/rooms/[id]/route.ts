import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, messages, roomMembers, roomInvites } from "@/lib/schema";
import { isAdmin } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { eq } from "drizzle-orm";

/** 删除房间：级联清理成员、邀请码与消息。 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }
  const { id } = await params;

  await db.delete(roomMembers).where(eq(roomMembers.roomId, id)).run();
  await db.delete(roomInvites).where(eq(roomInvites.roomId, id)).run();
  await db.delete(messages).where(eq(messages.roomId, id)).run();
  await db.delete(rooms).where(eq(rooms.id, id)).run();

  return NextResponse.json({ ok: true });
}
