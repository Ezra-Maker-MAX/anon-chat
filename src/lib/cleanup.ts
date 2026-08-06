import { db } from "./db";
import { messages } from "./schema";
import { and, isNotNull, lte } from "drizzle-orm";

/**
 * 删除所有已到期的阅后即焚消息。幂等、轻量，在每次读/写消息前调用即可，
 * 无需额外定时任务（Vercel 无长驻进程）。
 */
export async function cleanupBurned(): Promise<void> {
  try {
    await db
      .delete(messages)
      .where(and(isNotNull(messages.burnsAt), lte(messages.burnsAt, new Date())))
      .run();
  } catch {
    /* ignorable */
  }
}
