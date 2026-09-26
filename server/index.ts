import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { getItem, getCatalog, listItems } from './catalog';
import { InvalidQuery, parseQuery } from './query';
import { getSession, loginCampaign, logout } from './auth';
import { addWagonEquipment, createTimeToken, getWagon, removeTimeToken, removeWagonEquipment, updateCampaignName, updateWagonDay, updateSharedGold, updateWagonEquipment, updateWagonResource, updateWagonUpgrade } from './wagon';

type Bindings = { DB: D1Database; ASSETS: Fetcher };
const app = new Hono<{ Bindings: Bindings }>();
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  await next();
});
app.use('/api/auth/*', csrf());
app.use('/api/campaign/*', csrf());
app.post('/api/auth/campaign/login', loginCampaign);
app.get('/api/auth/session', getSession);
app.post('/api/auth/logout', logout);
app.get('/api/campaign/wagon', getWagon);
app.patch('/api/campaign/name', updateCampaignName);
app.patch('/api/campaign/wagon/day', updateWagonDay);
app.patch('/api/campaign/wagon/gold', updateSharedGold);
app.patch('/api/campaign/wagon/upgrades/:stationCode', updateWagonUpgrade);
app.post('/api/campaign/wagon/time-tokens', createTimeToken);
app.delete('/api/campaign/wagon/time-tokens/:tokenId', removeTimeToken);
app.patch('/api/campaign/wagon/resources/:resourceCode', updateWagonResource);
app.post('/api/campaign/wagon/equipment', addWagonEquipment);
app.patch('/api/campaign/wagon/equipment/:equipmentId', updateWagonEquipment);
app.delete('/api/campaign/wagon/equipment/:equipmentId', removeWagonEquipment);
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
  if (error instanceof HTTPException) {
    return c.json({ error: { code: error.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR', message: error.status === 403 ? '請求來源驗證失敗。' : error.message } }, error.status);
  }
  console.error('API request failed', error);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: '目前無法讀取資料，請稍後再試。' } }, 500);
});
export default app;
