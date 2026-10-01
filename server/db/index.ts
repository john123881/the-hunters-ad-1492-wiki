import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema/index';

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}


export { toD1PreparedStatement, runD1Batch } from './batch';

export type AppDb = ReturnType<typeof getDb>;
