import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { isAdmin } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { desc } from "drizzle-orm";

export async function GET() {
  await ensureSeed();
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: accounts.id,
      handle: accounts.handle,
      inviteCode: accounts.inviteCode,
      createdAt: accounts.createdAt,
      banned: accounts.banned,
    })
    .from(accounts)
    .orderBy(desc(accounts.createdAt))
    .limit(200);

  return NextResponse.json({ accounts: rows });
}
