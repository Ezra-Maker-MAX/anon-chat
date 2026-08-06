import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { roomMembers } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { and, eq } from "drizzle-orm";

/** 退出私密房（仅移除成员关系，房间本身保留）。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  await db
    .delete(roomMembers)
    .where(and(eq(roomMembers.roomId, id), eq(roomMembers.accountId, s.id)))
    .run();

  return NextResponse.json({ ok: true });
}
