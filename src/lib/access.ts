import { db } from "./db";
import { rooms, roomMembers } from "./schema";
import { and, eq } from "drizzle-orm";

export type RoomAccess = "public" | "member" | "none";

/**
 * 房间准入判定：
 * - 公开房：任何人可读写
 * - 私密房：仅成员可读写；未登录或非成员返回 "none"
 */
export async function roomAccess(
  roomId: string,
  accountId: string | null
): Promise<RoomAccess> {
  const room = await db
    .select({ isPublic: rooms.isPublic })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .get();
  if (!room) return "none";
  if (room.isPublic) return "public";
  if (!accountId) return "none";
  const mem = await db
    .select()
    .from(roomMembers)
    .where(
      and(eq(roomMembers.roomId, roomId), eq(roomMembers.accountId, accountId))
    )
    .get();
  return mem ? "member" : "none";
}
