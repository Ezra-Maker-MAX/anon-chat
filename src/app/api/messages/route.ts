import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { messages, accounts } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import { stripLinks } from "@/lib/sanitize";
import { roomAccess } from "@/lib/access";
import { cleanupBurned } from "@/lib/cleanup";
import { and, eq, gt } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import crypto from "crypto";

const KINDS = new Set(["text", "image", "voice", "video"]);
const BURN_TTL_CAP = 300; // 阅后即焚最长 5 分钟
const BURN_TTL_DEFAULT = 60;

function messageQuery() {
  return db
    .select({
      seq: messages.seq,
      id: messages.id,
      roomId: messages.roomId,
      accountId: messages.accountId,
      kind: messages.kind,
      body: messages.body,
      createdAt: messages.createdAt,
      burnsAt: messages.burnsAt,
      handle: accounts.handle,
    })
    .from(messages)
    .leftJoin(accounts, eq(messages.accountId, accounts.id));
}

export async function GET(req: NextRequest) {
  await ensureSeed();
  await cleanupBurned();

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("room") || "plaza";
  const since = Number(searchParams.get("since") || "0");

  const s = await getSession();
  const access = await roomAccess(roomId, s?.id ?? null);
  if (access === "none") {
    return NextResponse.json({ error: "无权访问该房间" }, { status: 403 });
  }

  const rows = since
    ? await messageQuery()
        .where(and(eq(messages.roomId, roomId), gt(messages.seq, since)))
        .orderBy(messages.seq)
        .all()
    : await messageQuery()
        .where(eq(messages.roomId, roomId))
        .orderBy(messages.seq)
        .limit(200)
        .all();

  return NextResponse.json({ messages: rows });
}

export async function POST(req: NextRequest) {
  await ensureSeed();
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { roomId = "plaza", kind = "text", body, burn, ttl } = await req
    .json()
    .catch(() => ({}));
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "不支持的消息类型" }, { status: 400 });
  }
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "内容不能为空" }, { status: 400 });
  }

  const access = await roomAccess(roomId, s.id);
  if (access === "none") {
    return NextResponse.json({ error: "无权向该房间发消息" }, { status: 403 });
  }

  // 文本消息必须净化：剥离一切超链接。媒体消息的 body 为系统生成的 Blob URL。
  let finalBody = body;
  if (kind === "text") {
    finalBody = stripLinks(body);
    if (!finalBody) {
      return NextResponse.json(
        { error: "内容不能只包含链接或为空" },
        { status: 400 }
      );
    }
    finalBody = finalBody.slice(0, 4000);
  } else {
    finalBody = body.slice(0, 2000);
  }

  // 阅后即焚：设定到期时间；服务端会在到期后删除该记录。
  let burnsAt: Date | null = null;
  if (burn) {
    const seconds = Math.min(
      Math.max(parseInt(String(ttl), 10) || BURN_TTL_DEFAULT, 5),
      BURN_TTL_CAP
    );
    burnsAt = new Date(Date.now() + seconds * 1000);
  }

  const id = crypto.randomUUID();
  await db.insert(messages).values({
    id,
    roomId,
    accountId: s.id,
    kind,
    body: finalBody,
    burnsAt,
  });
  await cleanupBurned();

  const [msg] = await messageQuery().where(eq(messages.id, id)).all();

  return NextResponse.json({ message: msg });
}
