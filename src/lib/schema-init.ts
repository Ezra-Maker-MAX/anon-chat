import { db } from "./db";
import { eq } from "drizzle-orm";
import { rooms } from "./schema";

/**
 * 自举建表：用 CREATE TABLE IF NOT EXISTS 保证本地（file:local.db）与
 * Turso 在首次访问时都能拿到完整表结构，无需手动跑迁移即可开发/上线。
 * 仍是幂等的，重复执行安全。
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    created_by TEXT,
    used_by TEXT,
    used_at INTEGER,
    created_at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    note TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL,
    invite_code TEXT,
    credential TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER,
    banned INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    topic TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 1,
    encrypted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, account_id)
  )`,
  `CREATE TABLE IF NOT EXISTS room_invites (
    code TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    room_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'text',
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    burns_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_room_seq ON messages (room_id, seq)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_burns_at ON messages (burns_at)`,
  // 迁移：为旧库补 encrypted 列（ALTER TABLE ADD COLUMN 是幂等的——列已存在时会报错，用 try/catch 忽略）
];

let initPromise: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    for (const stmt of STATEMENTS) {
      await db.$client.execute(stmt);
    }
    // 迁移：为旧库补 encrypted 列（列已存在时 SQLite 报错，安全忽略）
    try {
      await db.$client.execute(
        "ALTER TABLE rooms ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0"
      );
    } catch {
      /* 列已存在，忽略 */
    }
    // 默认公开房间 "广场"
    const existing = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.id, "plaza"))
      .get();
    if (!existing) {
      await db.insert(rooms).values({
        id: "plaza",
        name: "广场",
        topic: "所有人都能聊的匿名空间",
        createdBy: "system",
        isPublic: true,
      });
    }
  })();
  return initPromise;
}
