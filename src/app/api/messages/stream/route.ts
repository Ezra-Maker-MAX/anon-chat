import { db } from "@/lib/db";
import { messages, accounts } from "@/lib/schema";
import { getSession } from "@/lib/auth";
import { roomAccess } from "@/lib/access";
import { cleanupBurned } from "@/lib/cleanup";
import { and, eq, gt } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 50;

/**
 * SSE 实时消息流（Vercel 原生支持的实时方案）。
 * 客户端先 GET /api/messages 拉取历史，再连接本流并带 ?lastSeq=。
 * Vercel 函数最长约 50s 会自动断开，EventSource 自动重连。
 */
export async function GET(req: Request) {
  await ensureSeed();
  await cleanupBurned();

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("room") || "plaza";
  let cursor = Number(searchParams.get("lastSeq") || "0");

  const s = await getSession();
  const access = await roomAccess(roomId, s?.id ?? null);
  if (access === "none") {
    return new Response("forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const pull = async () => {
        try {
          await cleanupBurned();
          const where = cursor
            ? and(eq(messages.roomId, roomId), gt(messages.seq, cursor))
            : eq(messages.roomId, roomId);
          const list = await db
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
            .leftJoin(accounts, eq(messages.accountId, accounts.id))
            .where(where)
            .orderBy(messages.seq)
            .all();
          for (const m of list) {
            send(m);
            cursor = m.seq;
          }
        } catch {
          /* 忽略单次查询错误，下次重试 */
        }
      };

      const loop = setInterval(pull, 1500);
      const ping = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);
      const kill = setTimeout(() => {
        clearInterval(loop);
        clearInterval(ping);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* noop */
          }
        }
      }, 50000);

      req.signal?.addEventListener("abort", () => {
        clearInterval(loop);
        clearInterval(ping);
        clearTimeout(kill);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* noop */
          }
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
