import { ensureSchema } from "./schema-init";

/**
 * 兼容旧调用：ensureSeed 现在等价于 ensureSchema（建表 + 默认广场）。
 * 所有 API 路由在访问数据库前调用它，保证表结构存在。
 */
export function ensureSeed(): Promise<void> {
  return ensureSchema();
}
