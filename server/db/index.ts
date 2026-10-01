import { drizzle } from 'drizzle-orm/d1';
import type { BatchItem } from 'drizzle-orm/batch';
import * as schema from './schema/index';

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}


// [原因備註 - 徹底解決 Drizzle 原生 db.batch() 引發的 reading 'bind' 定時炸彈]:
// 1. 問題成因：在 Drizzle ORM 的 Cloudflare D1 adapter (SQLiteD1Session.batch) 內部實作中，
//    當批次中的 statement 帶有綁定參數時，Drizzle 會嘗試呼叫 preparedQuery.stmt.bind(...)。
//    然而由 db.run(sql`...`) 產生的 raw statement 並沒有 .stmt 屬性（為 undefined），
//    一旦 raw SQL 中包含任何變數（例如 ${campaignId}），就會引發崩潰：
//    TypeError: Cannot read properties of undefined (reading 'bind')。
// 2. 解決方案：本函式透過 Drizzle 內部介面 ._prepare().getQuery() 統一抽取 SQL 字串與 params 陣列，
//    直接轉換為 Cloudflare 原生 D1PreparedStatement (d1.prepare().bind())，
//    再委由 Cloudflare D1 native d1.batch() 執行。
//    不論是 Drizzle Query Builder (insert/update/delete) 還是 db.run(sql`...`) 都能 100% 安全執行。
export async function runD1Batch(
  d1: D1Database,
  queries: readonly BatchItem<'sqlite'>[],
): Promise<D1Result[]> {
  const statements = queries.map((query) => {
    const prepared = (query as unknown as { _prepare(): { getQuery(): { sql: string; params: unknown[] } } })._prepare();
    const built = prepared.getQuery();
    return d1.prepare(built.sql).bind(...built.params);
  });
  return d1.batch(statements);
}

export type AppDb = ReturnType<typeof getDb>;
