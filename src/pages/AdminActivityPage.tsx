import { useEffect, useMemo, useState } from 'react';
import { LogOut, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AdminActivityDeleteResponse, AdminActivityLog, AdminActivityResponse, AdminCampaignSummary, AdminCampaignsResponse, AdminSession, AdminSessionResponse, ApiErrorResponse } from '../../shared/types';
import { formatActivityDiff } from '../../shared/activityDiff';
import { AdminTabs } from '../components/AdminTabs';

const categories=[['CAMPAIGN','戰役'],['WAGON','馬車'],['MAP','地圖'],['CHARACTER','角色']] as const;
const actionLabels:Record<string,string>={
  LOGIN:'管理者登入',CREATE_CAMPAIGN:'建立戰役',SET_CAMPAIGN_STATUS:'變更戰役狀態',
  REVOKE_CAMPAIGN_SESSIONS:'撤銷玩家登入',RESET_CAMPAIGN_PASSWORD:'重設戰役密碼',IMPORT_CAMPAIGN_BACKUP:'還原戰役備份',
  SET_ELAPSED_DAYS:'更新累計天數',RENAME_CAMPAIGN:'重新命名戰役',SET_SHARED_GOLD:'更新共用金幣',
  SET_WAGON_NOTES:'更新馬車備註',SET_UPGRADE_LEVEL:'更新工坊',SET_RESOURCE_QUANTITY:'更新資源',
  ADD_EQUIPMENT:'新增裝備',UPDATE_EQUIPMENT:'更新裝備',REMOVE_EQUIPMENT:'移除裝備',
  CREATE_TIME_TOKEN:'放置時間指示物',REMOVE_TIME_TOKEN:'移除時間指示物',
  UPDATE_TILE:'更新地圖卡',UPDATE_POSITION:'更新獵人位置',UPSERT_CARD:'放置或更新卡片',
  REMOVE_CARD:'移除卡片',UPDATE_LOCATION:'更新地點卡',UPDATE_EVENT_NOTES:'更新事件紀錄',
  BATCH_UPDATE_MAP_TILES:'批次更新地圖卡',BATCH_UPDATE_LOCATION_CARDS:'批次更新地點卡',
  UPDATE_CARD_PROGRESS:'更新卡片進度',CREATE_CHARACTER:'建立角色',UPDATE_CHARACTER:'更新角色',
};

const activityFieldAliases: Record<string, Record<string, string>> = {
  SET_HUNTER_LOCATION: {
    locationType: 'currentLocationType',
    locationCode: 'currentLocationCode',
  },
  MOVE_OR_UPDATE_CARD: {
    type: 'cardType',
  },
};

export function AdminActivityPage(){
  const navigate=useNavigate();
  const [params,setParams]=useSearchParams();
  const category=(categories.some(([value])=>value===params.get('category'))?params.get('category'):'CAMPAIGN') as 'CAMPAIGN'|'WAGON'|'MAP'|'CHARACTER';
  const campaignId=params.get('campaignId')??'';
  const search=params.get('q')??'';
  const [session,setSession]=useState<AdminSession|null>(null);
  const [campaigns,setCampaigns]=useState<AdminCampaignSummary[]>([]);
  const [logs,setLogs]=useState<AdminActivityLog[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selectedIds,setSelectedIds]=useState<number[]>([]);
  const [deleting,setDeleting]=useState(false);
  async function load(){
    setLoading(true);setError('');
    try{
      const sessionResponse=await fetch('/api/admin/auth/session',{credentials:'same-origin'});
      const sessionPayload=await sessionResponse.json() as AdminSessionResponse;
      if(!sessionResponse.ok||!sessionPayload.data){navigate('/admin/login',{replace:true});return;}
      setSession(sessionPayload.data);
      const [campaignResponse,response]=await Promise.all([
        fetch('/api/admin/campaigns',{credentials:'same-origin'}),
        fetch('/api/admin/activity?category='+category+'&limit=100'+(campaignId?'&campaignId='+encodeURIComponent(campaignId):''),{credentials:'same-origin'}),
      ]);
      const campaignPayload=await campaignResponse.json() as AdminCampaignsResponse|ApiErrorResponse;
      if(!campaignResponse.ok||'error' in campaignPayload)throw new Error('error' in campaignPayload?campaignPayload.error.message:'無法載入戰役清單。');
      setCampaigns(campaignPayload.data.campaigns);
      const payload=await response.json() as AdminActivityResponse|ApiErrorResponse;
      if(!response.ok||'error' in payload)throw new Error('error' in payload?payload.error.message:'無法載入操作紀錄。');
      setLogs(payload.data.logs);
      setSelectedIds([]);
    }catch(reason){setError(reason instanceof Error?reason.message:'無法載入操作紀錄。');}
    finally{setLoading(false);}
  }
  useEffect(()=>{document.title='操作紀錄｜THE HUNTERS';void load();},[category,campaignId]);
  const filteredLogs=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase('zh-TW');
    if(!query)return logs;
    return logs.filter(log=>[
      log.actorLabel,log.actorDetail,log.campaignName,log.campaignId,
      actionLabels[log.actionType]??log.actionType,log.entityType,log.entityId,
      JSON.stringify(log.before),JSON.stringify(log.after),
    ].some(value=>String(value??'').toLocaleLowerCase('zh-TW').includes(query)));
  },[logs,search]);
  function updateFilters(next:{category?:string;campaignId?:string;q?:string}){
    const nextCategory=next.category??category,nextCampaign=next.campaignId??campaignId,nextSearch=next.q??search;
    const value:Record<string,string>={category:nextCategory};
    if(nextCampaign)value.campaignId=nextCampaign;
    if(nextSearch)value.q=nextSearch;
    setParams(value,{replace:true});
  }
  function toggleLog(id:number){
    setSelectedIds(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
  }
  async function deleteSelected(){
    if(!selectedIds.length)return;
    const selectedLogs=logs.filter(log=>selectedIds.includes(log.id));
    const campaignNames=[...new Set(selectedLogs.map(log=>log.campaignName??'系統'))].join('、');
    if(!window.confirm(`確定刪除已選取的 ${selectedIds.length} 筆紀錄？\n分類：${categories.find(([value])=>value===category)?.[1]}\n戰役：${campaignNames}\n\n刪除後無法復原，但不會刪除任何戰役資料。`))return;
    setDeleting(true);setError('');
    try{
      const response=await fetch('/api/admin/activity',{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({category,ids:selectedIds})});
      const payload=await response.json() as AdminActivityDeleteResponse|ApiErrorResponse;
      if(!response.ok||'error' in payload)throw new Error('error' in payload?payload.error.message:'無法刪除操作紀錄。');
      const deleted=new Set(payload.data.deletedIds);
      setLogs(current=>current.filter(log=>!deleted.has(log.id)));
      setSelectedIds([]);
    }catch(reason){setError(reason instanceof Error?reason.message:'無法刪除操作紀錄。');}
    finally{setDeleting(false);}
  }
  async function logout(){await fetch('/api/admin/auth/logout',{method:'POST',credentials:'same-origin'});navigate('/admin/login',{replace:true});}
  return <section className="admin-page">
    <header className="admin-heading"><div><p className="eyebrow">ARCHIVE CONTROL</p><h1>管理操作紀錄</h1><p>依戰役系統分類查看管理者及玩家所執行的資料變更。</p></div><div className="admin-identity"><span><ShieldCheck/> {session?.displayName??'管理者'}</span><button type="button" onClick={logout}><LogOut/>登出</button></div></header>
    <AdminTabs/>
    <div className="admin-log-toolbar"><div className="admin-log-filters"><label><span>戰役</span><select value={campaignId} onChange={event=>updateFilters({campaignId:event.target.value})}><option value="">全部戰役</option>{campaigns.map(campaign=><option key={campaign.id} value={campaign.id}>{campaign.name}（{campaign.id}）</option>)}</select></label><div className="admin-log-categories">{categories.map(([value,label])=><button className={category===value?'active':''} type="button" key={value} onClick={()=>updateFilters({category:value})}>{label}</button>)}</div></div><button className="button secondary" type="button" disabled={loading} onClick={load}><RefreshCw/>{loading?'更新中…':'重新整理'}</button></div>
    {error&&<div className="character-notice" role="alert">{error}</div>}
    <section className="admin-activity-list"><header><div><p className="eyebrow">{category} ACTIVITY</p><h2>{categories.find(([value])=>value===category)?.[1]}紀錄</h2></div><label className="admin-log-search"><Search/><span className="sr-only">搜尋操作紀錄</span><input type="search" value={search} placeholder="搜尋操作者、操作、目標…" onChange={event=>updateFilters({q:event.target.value})}/></label><div className="admin-activity-actions"><span>{search?'找到 '+filteredLogs.length+' 筆':'目前 '+logs.length+' 筆'}</span><button type="button" disabled={!selectedIds.length||deleting} onClick={deleteSelected}><Trash2/>{deleting?'刪除中…':`刪除已選（${selectedIds.length}）`}</button></div></header>
      {loading?<div className="character-loading">正在讀取操作紀錄…</div>:<div className="admin-table-wrap"><table><thead><tr><th className="admin-log-check"><input type="checkbox" aria-label="選取目前所有紀錄" checked={filteredLogs.length>0&&filteredLogs.every(log=>selectedIds.includes(log.id))} onChange={event=>setSelectedIds(event.target.checked?[...new Set([...selectedIds,...filteredLogs.map(log=>log.id)])]:selectedIds.filter(id=>!filteredLogs.some(log=>log.id===id)))}/></th><th>時間</th><th>操作者</th><th>戰役</th><th>操作</th><th>目標</th><th>變更資料</th></tr></thead><tbody>
        {filteredLogs.map(log => {
          const diffs = formatActivityDiff(
            log.before,
            log.after,
            {},
            activityFieldAliases[log.actionType],
          );
          return (
            <tr key={log.category + '-' + log.id}>
              <td className="admin-log-check">
                <input
                  type="checkbox"
                  aria-label={'選取 ' + (actionLabels[log.actionType] ?? log.actionType)}
                  checked={selectedIds.includes(log.id)}
                  onChange={() => toggleLog(log.id)}
                />
              </td>
              <td><time>{new Date(log.createdAt + 'Z').toLocaleString('zh-TW')}</time></td>
              <td><strong>{log.actorLabel}</strong><code>{log.actorDetail}</code></td>
              <td><strong>{log.campaignName ?? '系統'}</strong>{log.campaignId && <code>{log.campaignId}</code>}</td>
              <td>{actionLabels[log.actionType] ?? log.actionType}</td>
              <td>{log.entityId ?? log.entityType}</td>
              <td>
                {log.actionType === 'RESET_CAMPAIGN_PASSWORD' ? (
                  <span>密碼內容不記錄</span>
                ) : diffs.length > 0 ? (
                  <div className="admin-log-diff">
                    <ul className="admin-diff-list">
                      {diffs.map(d => (
                        <li key={d.field}>
                          <strong>{d.label}</strong>：
                          <span className="diff-before">{d.displayBefore}</span>
                          <span className="diff-arrow"> → </span>
                          <span className="diff-after">{d.displayAfter}</span>
                        </li>
                      ))}
                    </ul>
                    <details>
                      <summary>原始 JSON</summary>
                      <pre>{JSON.stringify({ before: log.before, after: log.after }, null, 2)}</pre>
                    </details>
                  </div>
                ) : (
                  <details>
                    <summary>查看 JSON</summary>
                    <pre>{JSON.stringify({ before: log.before, after: log.after }, null, 2)}</pre>
                  </details>
                )}
              </td>
            </tr>
          );
        })}
        {!filteredLogs.length&&<tr><td className="admin-log-empty" colSpan={7}>{search?'找不到符合搜尋條件的操作紀錄。':campaignId?'此戰役在目前分類中沒有操作紀錄。':'此分類目前沒有操作紀錄。'}</td></tr>}
      </tbody></table></div>}
    </section>
  </section>;
}
