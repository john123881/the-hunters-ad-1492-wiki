import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { sql } from 'drizzle-orm';
import { getItem, getCatalog, listItems } from './catalog';
import { InvalidQuery, parseQuery } from './query';
import { createAdminCampaign, deleteAdminActivityLogs, exportAdminCampaignBackup, importAdminCampaignBackup, getAdminCampaigns, getAdminSession, loginAdmin, logoutAdmin, getAdminActivityLogs, resetAdminCampaignPassword, revokeAdminCampaignSessions, updateAdminCampaignStatus } from './admin';
import { getSession, loginCampaign, logout, requireCampaignSession } from './auth';
import { getCampaignMap, removeMapCard, updateLocationCard, updateMapEventNotes, updateMapPosition, updateMapTile, upsertMapCard, updateCampaignCardProgress } from './map';
import { getCampaignCharacters, saveCampaignCharacter } from './characters';
import { getCompatibleCharacterCatalogCandidates, getCompatibleCharacterEquipmentCandidates, getCharacterLoadout, openCharacterSlot, restoreCharacterSlotCover, restoreInitialCharacterBoard } from './characterLoadout';
import { createAndEquipCatalogItem, createAndInstallCatalogAttachment, equipCharacterItem, getAttachmentCandidates, getAttachmentCatalogCandidates, installCharacterAttachment, moveCharacterItem, removeAllCharacterItems, removeCharacterItem, removeRetainedAttachment, removeInstalledAttachment, reorderHandItems, replaceCharacterItem, returnCharacterItemToWagon, returnInstalledAttachmentToWagon, returnRetainedAttachmentToWagon, switchCharacterHero, updateCharacterItemDamage } from './characterLoadoutMutations';
import { addWagonEquipment, createTimeToken, getWagon, removeTimeToken, removeWagonEquipment, updateCampaignName, updateWagonDay, updateSharedGold, updateWagonEquipment, updateWagonResource, updateWagonUpgrade, updateWagonNotes } from './wagon';
import { getDb } from './db';
import { items } from './db/schema/index';

type Bindings = { DB: D1Database; ASSETS: Fetcher };
const app = new Hono<{ Bindings: Bindings }>();
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  await next();
});
app.use('/api/auth/*', csrf());
app.use('/api/admin/*', csrf());
app.use('/api/campaign/*', csrf());
app.use('/api/campaign/*', async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  const session = await requireCampaignSession(c);
  if (!session.isActive) {
    return c.json({ error: { code: 'CAMPAIGN_INACTIVE', message: '此戰役目前已凍結，不能修改資料。' } }, 409);
  }
  await next();
});
app.post('/api/admin/auth/login', loginAdmin);
app.get('/api/admin/auth/session', getAdminSession);
app.post('/api/admin/auth/logout', logoutAdmin);
app.get('/api/admin/campaigns', getAdminCampaigns);
app.post('/api/admin/campaigns', createAdminCampaign);
app.patch('/api/admin/campaigns/:campaignId/status', updateAdminCampaignStatus);
app.delete('/api/admin/campaigns/:campaignId/sessions', revokeAdminCampaignSessions);
app.patch('/api/admin/campaigns/:campaignId/password', resetAdminCampaignPassword);
app.get('/api/admin/campaigns/:campaignId/backup', exportAdminCampaignBackup);
app.put('/api/admin/campaigns/:campaignId/backup', importAdminCampaignBackup);
app.put('/api/admin/campaign-backup', importAdminCampaignBackup);
app.get('/api/admin/activity', getAdminActivityLogs);
app.delete('/api/admin/activity', deleteAdminActivityLogs);
app.post('/api/auth/campaign/login', loginCampaign);
app.get('/api/auth/session', getSession);
app.post('/api/auth/logout', logout);
app.get('/api/campaign/characters', getCampaignCharacters);
app.put('/api/campaign/characters/:playerNumber', saveCampaignCharacter);
app.get('/api/campaign/characters/:playerNumber/loadout', getCharacterLoadout);
app.get('/api/campaign/characters/:playerNumber/equipment-candidates', getCompatibleCharacterEquipmentCandidates);
app.get('/api/campaign/characters/:playerNumber/equipment-catalog-candidates', getCompatibleCharacterCatalogCandidates);
app.post('/api/campaign/characters/:playerNumber/slots/:slotKey/open', openCharacterSlot);
app.delete('/api/campaign/characters/:playerNumber/slots/:slotKey/open', restoreCharacterSlotCover);
app.post('/api/campaign/characters/:playerNumber/slots/:slotKey/cover', restoreCharacterSlotCover);
app.post('/api/campaign/characters/:playerNumber/loadout/restore-initial', restoreInitialCharacterBoard);
app.put('/api/campaign/characters/:playerNumber/equipment/:instanceId', equipCharacterItem);
app.post('/api/campaign/characters/:playerNumber/equipment-from-catalog', createAndEquipCatalogItem);
app.patch('/api/campaign/characters/:playerNumber/equipment/:instanceId/position', moveCharacterItem);
app.patch('/api/campaign/characters/:playerNumber/equipment/:instanceId/damage', updateCharacterItemDamage);
app.post('/api/campaign/characters/:playerNumber/equipment/:instanceId/unequip', returnCharacterItemToWagon);
app.post('/api/campaign/characters/:playerNumber/equipment/:instanceId/remove', removeCharacterItem);
app.post('/api/campaign/characters/:playerNumber/attachments/:instanceId/remove', removeRetainedAttachment);
app.post('/api/campaign/characters/:playerNumber/attachments/:instanceId/move-to-wagon', returnRetainedAttachmentToWagon);
app.post('/api/campaign/characters/:playerNumber/equipment/:instanceId/attachments/:attachmentId/remove', removeInstalledAttachment);
app.post('/api/campaign/characters/:playerNumber/equipment/:instanceId/attachments/:attachmentId/move-to-wagon', returnInstalledAttachmentToWagon);
app.post('/api/campaign/characters/:playerNumber/equipment/remove-all', removeAllCharacterItems);
app.get('/api/campaign/characters/:playerNumber/equipment/:instanceId/attachment-candidates', getAttachmentCandidates);
app.get('/api/campaign/characters/:playerNumber/equipment/:instanceId/attachment-catalog-candidates', getAttachmentCatalogCandidates);
app.post('/api/campaign/characters/:playerNumber/equipment/:instanceId/attachments', installCharacterAttachment);
app.post('/api/campaign/characters/:playerNumber/equipment/:instanceId/attachments-from-catalog', createAndInstallCatalogAttachment);
app.post('/api/campaign/characters/:playerNumber/equipment/:instanceId/replace', replaceCharacterItem);
app.put('/api/campaign/characters/:playerNumber/loadout/hand-order', reorderHandItems);
app.post('/api/campaign/characters/:playerNumber/switch-hero', switchCharacterHero);
app.get('/api/campaign/map', getCampaignMap);
app.patch('/api/campaign/map/tiles/:mapCode', updateMapTile);
app.patch('/api/campaign/map/position', updateMapPosition);
app.patch('/api/campaign/map/locations/:locationCode', updateLocationCard);
app.patch('/api/campaign/map/event-notes', updateMapEventNotes);
app.post('/api/campaign/map/cards', upsertMapCard);
app.patch('/api/campaign/map/card-progress/:cardCode', updateCampaignCardProgress);
app.delete('/api/campaign/map/cards/:placementId', removeMapCard);
app.get('/api/campaign/wagon', getWagon);
app.patch('/api/campaign/name', updateCampaignName);
app.patch('/api/campaign/wagon/day', updateWagonDay);
app.patch('/api/campaign/wagon/gold', updateSharedGold);
app.patch('/api/campaign/wagon/notes', updateWagonNotes);
app.patch('/api/campaign/wagon/upgrades/:stationCode', updateWagonUpgrade);
app.post('/api/campaign/wagon/time-tokens', createTimeToken);
app.delete('/api/campaign/wagon/time-tokens/:tokenId', removeTimeToken);
app.patch('/api/campaign/wagon/resources/:resourceCode', updateWagonResource);
app.post('/api/campaign/wagon/equipment', addWagonEquipment);
app.patch('/api/campaign/wagon/equipment/:equipmentId', updateWagonEquipment);
app.delete('/api/campaign/wagon/equipment/:equipmentId', removeWagonEquipment);
app.get('/api/health', async c => {
  const db = getDb(c.env.DB);
  await db.select({ count: sql`1` }).from(items).limit(1);
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
  if (String(error).includes('chk_char_log_actor')) {
    return c.json({
      error: {
        code: 'EQUIPMENT_VERSION_CONFLICT',
        message: '角色或馬車資料已被其他玩家更新，請重新載入最新資料後再試。',
      },
    }, 409);
  }
  if (error instanceof InvalidQuery) return c.json({ error: { code: 'INVALID_QUERY', message: error.message } }, 400);
  if (error instanceof HTTPException) {
    return c.json({ error: { code: error.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR', message: error.status === 403 ? '請求來源驗證失敗。' : error.message } }, error.status);
  }
  console.error('API request failed', error);
  const isDev = Boolean(import.meta.env?.DEV);
  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: '目前無法讀取資料，請稍後再試。',
      ...(isDev ? { details: error instanceof Error ? error.message : String(error) } : {}),
    },
  }, 500);
});
export default app;
