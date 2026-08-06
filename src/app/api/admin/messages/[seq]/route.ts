import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { messages } from "@/lib/schema";
import { isAdmin } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { eq } from "drizzle-orm";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ seq: string }> }
) {
  await ensureSeed();
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }
  const seq = Number((await params).seq);
  if (!Number.isFinite(seq)) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  await db.delete(messages).where(eq(messages.seq, seq)).run();
  return NextResponse.json({ ok: true });
}
