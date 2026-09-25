import { Hono } from 'hono';
import { getItem, getCatalog, listItems } from './catalog';
import { InvalidQuery, parseQuery } from './query';

type Bindings = { DB: D1Database; ASSETS: Fetcher };
const app = new Hono<{ Bindings: Bindings }>();
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  await next();
});
app.get('/api/health', async c => {
  await c.env.DB.prepare('SELECT COUNT(*) FROM items').first();
  return c.json({ status: 'ok', database: 'ok' });
});
app.get('/api/catalog', async c => c.json(await getCatalog(c.env.DB)));
app.get('/api/items', async c => c.json(await listItems(c.env.DB, parseQuery(c.req.query()))));
app.get('/api/items/:slug', async c => {
  const item = await getItem(c.env.DB, c.req.param('slug'));
  if (!item) return c.json({ error: { code: 'ITEM_NOT_FOUND', message: '找不到這件物品，可能尚未收錄或尚未發布。' } }, 404);
  return c.json({ data: item });
});
app.notFound(c => c.json({ error: { code: 'NOT_FOUND', message: '找不到此 API 路徑。' } }, 404));
app.onError((error, c) => {
  if (error instanceof InvalidQuery) return c.json({ error: { code: 'INVALID_QUERY', message: error.message } }, 400);
  console.error('API request failed', error);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: '目前無法讀取物品圖鑑，請稍後再試。' } }, 500);
});
export default app;
