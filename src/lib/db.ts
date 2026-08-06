import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// 构建期可能尚未配置 Turso：用本地文件兜底，避免导入即报错。
const url = process.env.TURSO_URL ?? "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url, authToken });

export const db = drizzle(client, { schema });
