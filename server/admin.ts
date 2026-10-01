import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AdminSession } from '../shared/types';
import { buildCampaignBackup, restoreCampaignBackup } from './campaignBackup';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;
const COOKIE='hunter_admin_session';
const SESSION_SECONDS=8*60*60;
const enc=new TextEncoder();

function b64(bytes:Uint8Array){let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function unb64(value:string){const normalized=value.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(value.length/4)*4,'=');return Uint8Array.from(atob(normalized),char=>char.charCodeAt(0));}
async function digest(value:string){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));}
async function verifyPassword(password:string,stored:string){
  const [algorithm,roundsText,saltText,expectedText]=stored.split('$'),rounds=Number(roundsText);
  if(algorithm!=='pbkdf2_sha256'||!Number.isInteger(rounds)||rounds<100000||!saltText||!expectedText)return false;
  const expected=unb64(expectedText),key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(saltText),iterations:rounds},key,expected.length*8));
  let difference=actual.length^expected.length;for(let i=0;i<Math.min(actual.length,expected.length);i+=1)difference|=actual[i]^expected[i];
  return difference===0;
}
function fail(c:Ctx,status:400|401|404|409|423,code:string,message:string){return c.json({error:{code,message}},status);}
function clientKey(c:Ctx){return c.req.header('CF-Connecting-IP')??c.req.header('x-forwarded-for')?.split(',')[0]?.trim()??'local';}

async function readAdminSession(c:Ctx):Promise<{hash:string;data:AdminSession}|null>{
  const token=getCookie(c,COOKIE);if(!token)return null;
  const hash=await digest(token),now=Math.floor(Date.now()/1000);
  const row=await c.env.DB.prepare(`
    SELECT s.admin_user_id, s.expires_at, u.username, u.display_name
    FROM admin_sessions s JOIN admin_users u ON u.id=s.admin_user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.is_active=1
  `).bind(hash,now).first<{admin_user_id:number;expires_at:number;username:string;display_name:string}>();
  if(!row)return null;
  return {hash,data:{id:row.admin_user_id,username:row.username,displayName:row.display_name,expiresAt:new Date(row.expires_at*1000).toISOString()}};
}
export async function requireAdmin(c:Ctx){const session=await readAdminSession(c);if(!session)throw new HTTPException(401,{message:'請先登入管理者帳號。'});return session;}

export async function getAdminSession(c:Ctx){
  const session=await readAdminSession(c);
  if(!session){deleteCookie(c,COOKIE,{path:'/'});return c.json({data:null});}
  await c.env.DB.prepare("UPDATE admin_sessions SET last_seen_at=datetime('now') WHERE token_hash=?").bind(session.hash).run();
  return c.json({data:session.data});
}
export async function loginAdmin(c:Ctx){
  let input:Record<string,unknown>;try{input=await c.req.json();}catch{return fail(c,400,'INVALID_JSON','請提供有效的登入資料。');}
  const username=typeof input.username==='string'?input.username.trim().toLowerCase():'';
  const password=typeof input.password==='string'?input.password:'';
  if(!/^[a-z0-9._-]{3,40}$/.test(username)||password.length<12||password.length>128)return fail(c,400,'INVALID_ADMIN_LOGIN','帳號或密碼格式不正確。');
  const now=Math.floor(Date.now()/1000),key=clientKey(c);
  const attempt=await c.env.DB.prepare('SELECT locked_until FROM admin_login_attempts WHERE username=? AND client_key=?').bind(username,key).first<{locked_until:number|null}>();
  if(attempt?.locked_until&&attempt.locked_until>now)return fail(c,423,'ADMIN_LOGIN_LOCKED','登入嘗試過多，請稍後再試。');
  const admin=await c.env.DB.prepare('SELECT id,username,display_name,password_hash,is_active FROM admin_users WHERE username=?').bind(username).first<{id:number;username:string;display_name:string;password_hash:string;is_active:number}>();
  if(!admin||admin.is_active!==1||!(await verifyPassword(password,admin.password_hash))){
    await c.env.DB.prepare(`
      INSERT INTO admin_login_attempts(username,client_key,failure_count,window_started_at,locked_until) VALUES(?,?,1,?,NULL)
      ON CONFLICT(username,client_key) DO UPDATE SET
        failure_count=CASE WHEN ?-window_started_at>900 THEN 1 ELSE failure_count+1 END,
        window_started_at=CASE WHEN ?-window_started_at>900 THEN ? ELSE window_started_at END,
        locked_until=CASE WHEN ?-window_started_at<=900 AND failure_count+1>=6 THEN ?+900 ELSE NULL END
    `).bind(username,key,now,now,now,now,now,now).run();
    return fail(c,401,'INVALID_ADMIN_CREDENTIALS','管理者帳號或密碼不正確。');
  }
  const token=b64(crypto.getRandomValues(new Uint8Array(32))),tokenHash=await digest(token),expiresAt=now+SESSION_SECONDS;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO admin_sessions(token_hash,admin_user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,admin.id,expiresAt),
    c.env.DB.prepare('DELETE FROM admin_login_attempts WHERE username=? AND client_key=?').bind(username,key),
    c.env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(now),
    c.env.DB.prepare("UPDATE admin_users SET last_login_at=datetime('now') WHERE id=?").bind(admin.id),
    c.env.DB.prepare("INSERT INTO admin_activity_logs(admin_user_id,action_type,entity_type,entity_id) VALUES(?,'LOGIN','ADMIN',?)").bind(admin.id,String(admin.id)),
  ]);
  setCookie(c,COOKIE,token,{httpOnly:true,secure:new URL(c.req.url).protocol==='https:',sameSite:'Strict',path:'/',maxAge:SESSION_SECONDS});
  return c.json({data:{id:admin.id,username:admin.username,displayName:admin.display_name,expiresAt:new Date(expiresAt*1000).toISOString()} satisfies AdminSession});
}
export async function logoutAdmin(c:Ctx){
  const token=getCookie(c,COOKIE);if(token)await c.env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digest(token)).run();
  deleteCookie(c,COOKIE,{path:'/'});return c.json({data:{loggedOut:true}});
}
export async function getAdminCampaigns(c:Ctx){
  await requireAdmin(c);
  const now=Math.floor(Date.now()/1000);
  const rows=await c.env.DB.prepare(`
    SELECT c.id,c.campaign_name,c.is_active,c.max_players,c.created_at,c.updated_at,
      (SELECT COUNT(*) FROM campaign_players p WHERE p.campaign_id=c.id) AS player_count,
      (SELECT COUNT(*) FROM campaign_characters ch WHERE ch.campaign_id=c.id) AS character_count,
      (SELECT COUNT(*) FROM auth_sessions s WHERE s.campaign_id=c.id AND s.expires_at>?) AS active_session_count,
      COALESCE(w.version,0) AS wagon_version,COALESCE(m.version,0) AS map_version
    FROM campaigns c
    LEFT JOIN campaign_wagons w ON w.campaign_id=c.id
    LEFT JOIN campaign_maps m ON m.campaign_id=c.id
    WHERE c.deleted_at IS NULL ORDER BY c.updated_at DESC,c.id
  `).bind(now).all<{id:string;campaign_name:string;is_active:number;max_players:number;created_at:string;updated_at:string;player_count:number;character_count:number;active_session_count:number;wagon_version:number;map_version:number}>();
  const playerRows=await c.env.DB.prepare(`SELECT p.campaign_id,p.player_number,p.player_alias,ch.hero_slug,ch.custom_name FROM campaign_players p LEFT JOIN campaign_characters ch ON ch.campaign_id=p.campaign_id AND ch.player_number=p.player_number ORDER BY p.campaign_id,p.player_number`).all<{campaign_id:string;player_number:number;player_alias:string;hero_slug:string|null;custom_name:string|null}>();
  const campaigns=rows.results.map(row=>({id:row.id,name:row.campaign_name,isActive:row.is_active===1,maxPlayers:row.max_players,playerCount:row.player_count,characterCount:row.character_count,activeSessionCount:row.active_session_count,wagonVersion:row.wagon_version,mapVersion:row.map_version,createdAt:row.created_at,updatedAt:row.updated_at,players:playerRows.results.filter(player=>player.campaign_id===row.id).map(player=>({playerNumber:player.player_number,playerAlias:player.player_alias,heroSlug:player.hero_slug,customName:player.custom_name}))}));
  return c.json({data:{summary:{campaignCount:campaigns.length,activeCampaignCount:campaigns.filter(item=>item.isActive).length,playerCount:campaigns.reduce((sum,item)=>sum+item.playerCount,0),characterCount:campaigns.reduce((sum,item)=>sum+item.characterCount,0),activeSessionCount:campaigns.reduce((sum,item)=>sum+item.activeSessionCount,0)},campaigns}});
}

async function hashPassword(password:string){
  const rounds=310000,salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const hash=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:rounds},key,256));
  return `pbkdf2_sha256$${rounds}$${b64(salt)}$${b64(hash)}`;
}
async function parseBody(c:Ctx){try{return await c.req.json<Record<string,unknown>>();}catch{return null;}}

export async function createAdminCampaign(c:Ctx){
  const admin=await requireAdmin(c),input=await parseBody(c);
  if(!input)return fail(c,400,'INVALID_JSON','請提供有效的戰役資料。');
  const id=typeof input.id==='string'?input.id.trim().toLowerCase():'';
  const name=typeof input.name==='string'?input.name.trim():'';
  const password=typeof input.password==='string'?input.password:'';
  const maxPlayers=Number(input.maxPlayers);
  if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(id))return fail(c,400,'INVALID_CAMPAIGN_ID','戰役 ID 需為 3 至 40 字元的小寫英文、數字或連字號。');
  if(name.length<1||name.length>60)return fail(c,400,'INVALID_CAMPAIGN_NAME','戰役名稱需為 1 至 60 個字元。');
  if(password.length<8||password.length>128)return fail(c,400,'INVALID_CAMPAIGN_PASSWORD','戰役密碼至少需要 8 個字元。');
  if(!Number.isInteger(maxPlayers)||maxPlayers<1||maxPlayers>4)return fail(c,400,'INVALID_MAX_PLAYERS','玩家上限需為 1 至 4。');
  const exists=await c.env.DB.prepare('SELECT 1 FROM campaigns WHERE id=?').bind(id).first();
  if(exists)return fail(c,409,'CAMPAIGN_ID_EXISTS','這個戰役 ID 已經存在。');
  const passwordHash=await hashPassword(password);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO campaigns(id,campaign_name,password_hash,max_players) VALUES(?,?,?,?)').bind(id,name,passwordHash,maxPlayers),
    c.env.DB.prepare('INSERT INTO campaign_wagons(campaign_id) VALUES(?)').bind(id),
    c.env.DB.prepare('INSERT INTO campaign_maps(campaign_id) VALUES(?)').bind(id),
    c.env.DB.prepare(`INSERT INTO admin_activity_logs(admin_user_id,action_type,entity_type,entity_id,after_json) VALUES(?,'CREATE_CAMPAIGN','CAMPAIGN',?,?)`).bind(admin.data.id,id,JSON.stringify({name,maxPlayers})),
  ]);
  return getAdminCampaigns(c);
}

export async function updateAdminCampaignStatus(c:Ctx){
  const admin=await requireAdmin(c),id=c.req.param('campaignId'),input=await parseBody(c);
  if(!input||typeof input.isActive!=='boolean')return fail(c,400,'INVALID_CAMPAIGN_STATUS','請提供有效的戰役狀態。');
  const before=await c.env.DB.prepare('SELECT campaign_name,is_active FROM campaigns WHERE id=? AND deleted_at IS NULL').bind(id).first<{campaign_name:string;is_active:number}>();
  if(!before)return fail(c,404,'CAMPAIGN_NOT_FOUND','找不到這個戰役。');
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE campaigns SET is_active=?,updated_at=datetime('now') WHERE id=?").bind(input.isActive?1:0,id),
    c.env.DB.prepare(`INSERT INTO admin_activity_logs(admin_user_id,action_type,entity_type,entity_id,before_json,after_json) VALUES(?,'SET_CAMPAIGN_STATUS','CAMPAIGN',?,?,?)`).bind(admin.data.id,id,JSON.stringify({isActive:before.is_active===1}),JSON.stringify({isActive:input.isActive})),
  ]);
  return getAdminCampaigns(c);
}

export async function revokeAdminCampaignSessions(c:Ctx){
  const admin=await requireAdmin(c),id=c.req.param('campaignId');
  const campaign=await c.env.DB.prepare('SELECT campaign_name FROM campaigns WHERE id=? AND deleted_at IS NULL').bind(id).first<{campaign_name:string}>();
  if(!campaign)return fail(c,404,'CAMPAIGN_NOT_FOUND','找不到這個戰役。');
  const count=await c.env.DB.prepare('SELECT COUNT(*) AS count FROM auth_sessions WHERE campaign_id=?').bind(id).first<{count:number}>();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM auth_sessions WHERE campaign_id=?').bind(id),
    c.env.DB.prepare(`INSERT INTO admin_activity_logs(admin_user_id,action_type,entity_type,entity_id,before_json,after_json) VALUES(?,'REVOKE_CAMPAIGN_SESSIONS','CAMPAIGN',?,?,?)`).bind(admin.data.id,id,JSON.stringify({sessionCount:count?.count??0}),JSON.stringify({sessionCount:0})),
  ]);
  return getAdminCampaigns(c);
}

export async function resetAdminCampaignPassword(c:Ctx){
  const admin=await requireAdmin(c),id=c.req.param('campaignId'),input=await parseBody(c);
  const password=typeof input?.password==='string'?input.password:'';
  const revokeSessions=input?.revokeSessions!==false;
  if(password.length<8||password.length>128)return fail(c,400,'INVALID_CAMPAIGN_PASSWORD','戰役密碼需為 8 至 128 個字元。');
  const campaign=await c.env.DB.prepare('SELECT campaign_name FROM campaigns WHERE id=? AND deleted_at IS NULL').bind(id).first<{campaign_name:string}>();
  if(!campaign)return fail(c,404,'CAMPAIGN_NOT_FOUND','找不到這個戰役。');
  const count=await c.env.DB.prepare('SELECT COUNT(*) AS count FROM auth_sessions WHERE campaign_id=?').bind(id).first<{count:number}>();
  const passwordHash=await hashPassword(password),revokedCount=revokeSessions?(count?.count??0):0;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE campaigns SET password_hash=?,updated_at=datetime('now') WHERE id=?").bind(passwordHash,id),
    c.env.DB.prepare('DELETE FROM auth_sessions WHERE campaign_id=? AND ?=1').bind(id,revokeSessions?1:0),
    c.env.DB.prepare(`INSERT INTO admin_activity_logs(admin_user_id,action_type,entity_type,entity_id,before_json,after_json) VALUES(?,'RESET_CAMPAIGN_PASSWORD','CAMPAIGN',?,?,?)`).bind(admin.data.id,id,JSON.stringify({password:'REDACTED'}),JSON.stringify({password:'REDACTED',revokedSessionCount:revokedCount})),
  ]);
  return c.json({data:{campaignId:id,revokedSessionCount:revokedCount}});
}

export async function getAdminActivityLogs(c:Ctx){
  await requireAdmin(c);
  const requested=Number(c.req.query('limit')??50),limit=Number.isInteger(requested)?Math.min(Math.max(requested,1),100):50;
  const categoryInput=(c.req.query('category')??'CAMPAIGN').toUpperCase();
  const category=['CAMPAIGN','WAGON','MAP','CHARACTER'].includes(categoryInput)?categoryInput:'CAMPAIGN';
  const campaignId=c.req.query('campaignId')?.trim()||null;
  if(campaignId){
    const campaign=await c.env.DB.prepare('SELECT 1 FROM campaigns WHERE id=? AND deleted_at IS NULL').bind(campaignId).first();
    if(!campaign)return fail(c,404,'CAMPAIGN_NOT_FOUND','找不到這個戰役。');
  }
  type Row={id:number;action_type:string;entity_type:string;entity_id:string|null;before_json:string|null;after_json:string|null;created_at:string;campaign_id:string|null;campaign_name:string|null;actor_label:string;actor_detail:string};
  let rows:D1Result<Row>;
  if(category==='CAMPAIGN'){
    rows=await c.env.DB.prepare(`
      SELECT l.id,l.action_type,l.entity_type,l.entity_id,l.before_json,l.after_json,l.created_at,
        CASE WHEN l.entity_type='CAMPAIGN' THEN l.entity_id ELSE NULL END AS campaign_id,
        CASE WHEN l.entity_type='CAMPAIGN' THEN COALESCE(c.campaign_name,l.entity_id) ELSE NULL END AS campaign_name,
        u.display_name AS actor_label,u.username AS actor_detail
      FROM admin_activity_logs l JOIN admin_users u ON u.id=l.admin_user_id
      LEFT JOIN campaigns c ON c.id=l.entity_id
      WHERE (? IS NULL OR (l.entity_type='CAMPAIGN' AND l.entity_id=?))
      ORDER BY l.id DESC LIMIT ?
    `).bind(campaignId,campaignId,limit).all<Row>();
  }else if(category==='WAGON'){
    rows=await c.env.DB.prepare(`
      SELECT l.id,l.action_type,l.entity_type,l.entity_id,l.before_json,l.after_json,l.created_at,l.campaign_id,
        c.campaign_name,p.player_alias AS actor_label,'玩家 '||l.player_number AS actor_detail
      FROM wagon_activity_logs l JOIN campaigns c ON c.id=l.campaign_id
      LEFT JOIN campaign_players p ON p.campaign_id=l.campaign_id AND p.player_number=l.player_number
      WHERE (? IS NULL OR l.campaign_id=?)
      ORDER BY l.id DESC LIMIT ?
    `).bind(campaignId,campaignId,limit).all<Row>();
  }else if(category==='MAP'){
    rows=await c.env.DB.prepare(`
      SELECT l.id,l.action_type,l.entity_type,l.entity_id,l.before_json,l.after_json,l.created_at,l.campaign_id,
        c.campaign_name,p.player_alias AS actor_label,'玩家 '||l.player_number AS actor_detail
      FROM map_activity_logs l JOIN campaigns c ON c.id=l.campaign_id
      LEFT JOIN campaign_players p ON p.campaign_id=l.campaign_id AND p.player_number=l.player_number
      WHERE (? IS NULL OR l.campaign_id=?)
      ORDER BY l.id DESC LIMIT ?
    `).bind(campaignId,campaignId,limit).all<Row>();
  }else{
    rows=await c.env.DB.prepare(`
      SELECT l.id,l.action_type,l.entity_type,l.entity_id,l.before_json,l.after_json,l.created_at,l.campaign_id,
        c.campaign_name,p.player_alias AS actor_label,'玩家 '||l.actor_player_number||' → 席位 '||l.target_player_number AS actor_detail
      FROM character_activity_logs l JOIN campaigns c ON c.id=l.campaign_id
      LEFT JOIN campaign_players p ON p.campaign_id=l.campaign_id AND p.player_number=l.actor_player_number
      WHERE (? IS NULL OR l.campaign_id=?)
      ORDER BY l.id DESC LIMIT ?
    `).bind(campaignId,campaignId,limit).all<Row>();
  }
  const parse=(value:string|null)=>{if(!value)return null;try{return JSON.parse(value) as Record<string,unknown>;}catch{return {raw:value};}};
  return c.json({data:{category,campaignId,logs:rows.results.map(row=>({id:row.id,category,actionType:row.action_type,entityType:row.entity_type,entityId:row.entity_id,campaignId:row.campaign_id,campaignName:row.campaign_name,actorLabel:row.actor_label??'未知',actorDetail:row.actor_detail,before:parse(row.before_json),after:parse(row.after_json),createdAt:row.created_at}))}});
}


export async function deleteAdminActivityLogs(c:Ctx){
  await requireAdmin(c);
  const input=await parseBody(c);
  const category=typeof input?.category==='string'?input.category.toUpperCase():'';
  const tables:Record<string,string>={
    CAMPAIGN:'admin_activity_logs',
    WAGON:'wagon_activity_logs',
    MAP:'map_activity_logs',
    CHARACTER:'character_activity_logs',
  };
  const table=tables[category];
  const rawIds=Array.isArray(input?.ids)?input.ids:[];
  const ids=[...new Set(rawIds.map(Number).filter(id=>Number.isInteger(id)&&id>0))];
  if(!table)return fail(c,400,'INVALID_ACTIVITY_CATEGORY','請提供有效的紀錄分類。');
  if(ids.length<1||ids.length>100)return fail(c,400,'INVALID_ACTIVITY_IDS','請選擇 1 至 100 筆操作紀錄。');
  const placeholders=ids.map(()=>'?').join(',');
  const result=await c.env.DB.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).bind(...ids).run();
  return c.json({data:{category,deletedCount:result.meta.changes??0,deletedIds:ids}});
}


export async function exportAdminCampaignBackup(c:Ctx){
  await requireAdmin(c);
  const campaignId=c.req.param('campaignId')??'';
  const backup=await buildCampaignBackup(c.env.DB,campaignId);
  if(!backup)return fail(c,404,'CAMPAIGN_NOT_FOUND','找不到這個戰役。');
  const stamp=new Date().toISOString().slice(0,10);
  c.header('Content-Type','application/json; charset=utf-8');
  c.header('Content-Disposition',`attachment; filename="${campaignId}-backup-${stamp}.json"`);
  return c.body(JSON.stringify(backup,null,2));
}

export async function importAdminCampaignBackup(c:Ctx){
  const admin=await requireAdmin(c);
  let input:unknown;
  try{input=await c.req.json();}catch{return fail(c,400,'INVALID_BACKUP_JSON','備份檔不是有效的 JSON。');}
  const routeCampaignId=c.req.param('campaignId')??'';
  const fileCampaignId=typeof input==='object'&&input!==null&&'campaignId' in input&&typeof input.campaignId==='string'?input.campaignId:'';
  const campaignId=routeCampaignId||fileCampaignId;
  if(!campaignId)return fail(c,400,'INVALID_CAMPAIGN_BACKUP','備份檔缺少戰役 ID。');
  try{
    const data=await restoreCampaignBackup(c.env.DB,campaignId,input,admin.data);
    return c.json({data});
  }catch(reason){
    const message=reason instanceof Error?reason.message:'無法還原戰役備份。';
    if(message.includes('備份'))return fail(c,400,'INVALID_CAMPAIGN_BACKUP',message);
    throw reason;
  }
}
