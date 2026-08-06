import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";

/**
 * 邀请码：注册的唯一入口。每个码只能用一次（usedBy 标记后失效）。
 */
export const inviteCodes = sqliteTable("invite_codes", {
  code: text("code").primaryKey(),
  createdBy: text("created_by"),
  usedBy: text("used_by"),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .defaultNow(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  note: text("note"),
});

/**
 * 匿名账号：不收集邮箱/手机号。注册时生成随机 handle 与 credential。
 * credential 仅存于用户本地（localStorage），用于"多账号"在同一设备切换登录。
 * banned：被管理后台封禁后无法再登录。
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  handle: text("handle").notNull(),
  inviteCode: text("invite_code"),
  credential: text("credential").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .defaultNow(),
  lastSeen: integer("last_seen", { mode: "timestamp" }),
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
});

/**
 * 聊天空间（房间）。
 * isPublic=true 为公开房（所有人可见可聊）；false 为私密房，仅受邀成员可见。
 * 默认公开房间 "广场"。
 */
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  topic: text("topic"),
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .defaultNow(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
});

/** 私密房成员关系（复合主键）。 */
export const roomMembers = sqliteTable(
  "room_members",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    joinedAt: integer("joined_at", { mode: "timestamp" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roomId, t.accountId] }),
  })
);

/**
 * 私密房邀请码：凭码加入对应私密房。支持多次使用（maxUses）与过期时间。
 * 这是私密房唯一的"准入"方式（与产品"邀请码"内核一致，且不产生可分享链接）。
 */
export const roomInvites = sqliteTable("room_invites", {
  code: text("code").primaryKey(),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id),
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .defaultNow(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  maxUses: integer("max_uses", { mode: "number" }).notNull().default(1),
  usedCount: integer("used_count", { mode: "number" }).notNull().default(0),
});

/**
 * 消息。seq 为自增主键，用于 SSE/分页游标（UUID 无法按时间排序）。
 * kind: text | image | voice | video。body 存纯文本或系统生成的 Blob URL。
 * burnsAt：阅后即焚到期时间；非空表示这是一条焚毁消息，到期即从库删除。
 *
 * 所有聊天记录（文本 + 媒体元数据）都落库，满足"记录存在数据库中"的要求。
 */
export const messages = sqliteTable(
  "messages",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    id: text("id").notNull().unique(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    kind: text("kind").notNull().default("text"),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .defaultNow(),
    burnsAt: integer("burns_at", { mode: "timestamp" }),
  },
  (t) => ({
    roomIdx: index("idx_messages_room_seq").on(t.roomId, t.seq),
    burnIdx: index("idx_messages_burns_at").on(t.burnsAt),
  })
);

export type Account = typeof accounts.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type RoomMember = typeof roomMembers.$inferSelect;
export type RoomInvite = typeof roomInvites.$inferSelect;
