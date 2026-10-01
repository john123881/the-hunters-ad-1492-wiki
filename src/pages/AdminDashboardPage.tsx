import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Activity, Archive, CirclePause, Download, KeyRound, LogOut, Plus, RefreshCw, ShieldCheck, Upload, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { heroDefinitionBySlug } from '../../shared/heroesData';
import { AdminTabs } from '../components/AdminTabs';
import type { AdminBackupImportResponse, AdminCampaignsResponse, AdminPasswordResetResponse, AdminSession, AdminSessionResponse, ApiErrorResponse } from '../../shared/types';

export function AdminDashboardPage(){
  const navigate=useNavigate();
  const [session,setSession]=useState<AdminSession|null>(null);
  const [data,setData]=useState<AdminCampaignsResponse['data']|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [showCreate,setShowCreate]=useState(false);
  const [form,setForm]=useState({id:'',name:'',password:'',maxPlayers:4});
  const [passwordTarget,setPasswordTarget]=useState<{id:string;name:string}|null>(null);
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [revokeOnReset,setRevokeOnReset]=useState(true);

  async function load(){
    setLoading(true);setError('');
    try{
      const sessionResponse=await fetch('/api/admin/auth/session',{credentials:'same-origin'});
      const sessionPayload=await sessionResponse.json() as AdminSessionResponse;
      if(!sessionResponse.ok||!sessionPayload.data){navigate('/admin/login',{replace:true});return;}
      setSession(sessionPayload.data);
      const response=await fetch('/api/admin/campaigns',{credentials:'same-origin'});
      const payload=await response.json() as AdminCampaignsResponse|ApiErrorResponse;
      if(!response.ok||'error' in payload)throw new Error('error' in payload?payload.error.message:'無法載入管理資料。');
      setData(payload.data);
    }catch(reason){setError(reason instanceof Error?reason.message:'無法載入管理資料。');}
    finally{setLoading(false);}
  }
  useEffect(()=>{document.title='管理總覽｜THE HUNTERS';void load();},[]);

  async function mutate(path:string,method:string,body:unknown,message:string,key:string){
    setBusy(key);setError('');setNotice('');
    try{
      const response=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      const payload=await response.json() as AdminCampaignsResponse|ApiErrorResponse;
      if(!response.ok||'error' in payload)throw new Error('error' in payload?payload.error.message:'管理操作失敗。');
      setData(payload.data);setNotice(message);return true;
    }catch(reason){setError(reason instanceof Error?reason.message:'管理操作失敗。');return false;}
    finally{setBusy('');}
  }
  async function createCampaign(event:FormEvent){
    event.preventDefault();
    const ok=await mutate('/api/admin/campaigns','POST',form,'戰役已建立。','create');
    if(ok){setForm({id:'',name:'',password:'',maxPlayers:4});setShowCreate(false);}
  }

  async function resetPassword(event:FormEvent){
    event.preventDefault();if(!passwordTarget)return;
    if(newPassword!==confirmPassword){setError('兩次輸入的密碼不一致。');return;}
    setBusy('password');setError('');setNotice('');
    try{
      const response=await fetch('/api/admin/campaigns/'+passwordTarget.id+'/password',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:newPassword,revokeSessions:revokeOnReset})});
      const payload=await response.json() as AdminPasswordResetResponse|ApiErrorResponse;
      if(!response.ok||'error' in payload)throw new Error('error' in payload?payload.error.message:'密碼重設失敗。');
      setPasswordTarget(null);setNewPassword('');setConfirmPassword('');setNotice('戰役密碼已重設'+(payload.data.revokedSessionCount?'，並撤銷 '+payload.data.revokedSessionCount+' 筆登入憑證。':'。'));await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'密碼重設失敗。');}
    finally{setBusy('');}
  }

  async function exportBackup(campaignId:string){
    setBusy('export-'+campaignId);setError('');setNotice('');
    try{
      const response=await fetch('/api/admin/campaigns/'+campaignId+'/backup',{credentials:'same-origin'});
      if(!response.ok){
        const payload=await response.json() as ApiErrorResponse;
        throw new Error(payload.error.message);
      }
      const blob=await response.blob(),url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.download=campaignId+'-backup-'+new Date().toISOString().slice(0,10)+'.json';
      link.click();URL.revokeObjectURL(url);
      setNotice('戰役備份已下載。請將 JSON 檔保存在安全位置。');
    }catch(reason){setError(reason instanceof Error?reason.message:'無法匯出戰役備份。');}
    finally{setBusy('');}
  }

  async function importBackup(campaign:{id:string;name:string}|null,event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';
    if(!file||busy)return;
    setError('');setNotice('');
    try{
      const backup=JSON.parse(await file.text()) as {format?:unknown;schemaVersion?:unknown;campaignId?:unknown;exportedAt?:unknown};
      if(backup.format!=='the-hunters-campaign-backup'||backup.schemaVersion!==1)throw new Error('這不是支援的戰役備份檔。');
      if(typeof backup.campaignId!=='string'||!backup.campaignId)throw new Error('備份檔缺少戰役 ID。');
      if(campaign&&backup.campaignId!==campaign.id)throw new Error('備份檔屬於 '+backup.campaignId+'，不能覆蓋 '+campaign.id+'。');
      const targetName=campaign?.name??backup.campaignId;
      const exportedAt=typeof backup.exportedAt==='string'?new Date(backup.exportedAt).toLocaleString('zh-TW'):'未知';
      if(!window.confirm('確定以此備份'+(campaign?'覆蓋':'建立或還原')+'「'+targetName+'」？\n備份時間：'+exportedAt+'\n\n目前的馬車、地圖、角色與操作紀錄將被備份內容取代，所有玩家也會被登出。此操作無法復原。'))return;
      setBusy('import-'+backup.campaignId);
      const importPath=campaign?'/api/admin/campaigns/'+campaign.id+'/backup':'/api/admin/campaign-backup';
      const response=await fetch(importPath,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(backup)});
      const payload=await response.json() as AdminBackupImportResponse|ApiErrorResponse;
      if(!response.ok||'error' in payload)throw new Error('error' in payload?payload.error.message:'無法還原戰役備份。');
      setNotice('戰役備份已還原，所有既有玩家登入憑證已失效。');
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'無法讀取戰役備份。');}
    finally{setBusy('');}
  }

  async function logout(){await fetch('/api/admin/auth/logout',{method:'POST',credentials:'same-origin'});navigate('/admin/login',{replace:true});}

  return <section className="admin-page">
    <header className="admin-heading"><div><p className="eyebrow">ARCHIVE CONTROL</p><h1>戰役管理總覽</h1><p>查看所有戰役與玩家狀態，並執行必要的帳號管理操作。</p></div><div className="admin-identity"><span><ShieldCheck/> {session?.displayName??'管理者'}</span><button type="button" onClick={logout}><LogOut/>登出</button></div></header>
    <AdminTabs/>
    <div className="admin-toolbar"><button className="button" type="button" onClick={()=>setShowCreate(value=>!value)}><Plus/>{showCreate?'收起建立表單':'建立戰役'}</button><label className={"button secondary admin-backup-upload "+(busy?"disabled":"")}><Upload/>匯入／還原備份<input type="file" accept="application/json,.json" disabled={Boolean(busy)} onChange={event=>void importBackup(null,event)}/></label><button className="button secondary" type="button" disabled={loading} onClick={load}><RefreshCw/>{loading?'更新中…':'重新整理'}</button></div>
    {showCreate&&<form className="admin-create-form" onSubmit={createCampaign}>
      <header><div><p className="eyebrow">NEW CAMPAIGN</p><h2>建立新戰役</h2></div><p>建立後，玩家即可使用戰役 ID、共用密碼與席位登入。</p></header>
      <label>戰役 ID<input value={form.id} onChange={event=>setForm({...form,id:event.target.value.toLowerCase()})} placeholder="hunters-party-2" required pattern="[a-z0-9][a-z0-9-]{2,39}"/></label>
      <label>戰役名稱<input value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="週末獵人團" required maxLength={60}/></label>
      <label>共用密碼<input type="password" value={form.password} onChange={event=>setForm({...form,password:event.target.value})} required minLength={8} maxLength={128}/></label>
      <label>玩家上限<select value={form.maxPlayers} onChange={event=>setForm({...form,maxPlayers:Number(event.target.value)})}>{[1,2,3,4].map(value=><option value={value} key={value}>{value} 人</option>)}</select></label>
      <button className="button" disabled={busy==='create'} type="submit">{busy==='create'?'建立中…':'確認建立'}</button>
    </form>}
    {error&&<div className="character-notice" role="alert">{error}</div>}
    {notice&&<div className="character-notice success" role="status">{notice}</div>}
    {loading&&!data?<div className="character-loading">正在讀取管理資料…</div>:data&&<>
      <section className="admin-metrics" aria-label="管理統計">
        <article><Archive/><span>戰役</span><strong>{data.summary.campaignCount}</strong><small>{data.summary.activeCampaignCount} 個啟用中</small></article>
        <article><UsersRound/><span>已加入玩家</span><strong>{data.summary.playerCount}</strong><small>{data.summary.characterCount} 位已建立角色</small></article>
        <article><Activity/><span>有效登入憑證</span><strong>{data.summary.activeSessionCount}</strong><small>尚未登出或過期</small></article>
        <article><CirclePause/><span>凍結戰役</span><strong>{data.summary.campaignCount-data.summary.activeCampaignCount}</strong><small>暫停玩家寫入</small></article>
      </section>
      <section className="admin-campaign-list"><header><div><p className="eyebrow">CAMPAIGNS</p><h2>戰役清單</h2></div><span>{data.campaigns.length} 筆</span></header>
        <div className="admin-table-wrap"><table><thead><tr><th>戰役</th><th>狀態</th><th>玩家／角色</th><th>登入憑證</th><th>最後更新</th><th>管理</th></tr></thead><tbody>
          {data.campaigns.map(campaign=><tr key={campaign.id}>
            <td><strong>{campaign.name}</strong><code>{campaign.id}</code></td>
            <td><span className={'admin-status '+(campaign.isActive?'active':'paused')}>{campaign.isActive?'啟用':'凍結'}</span></td>
            <td><details className="admin-player-details"><summary>{campaign.playerCount}／{campaign.maxPlayers} 位玩家 · {campaign.characterCount} 位角色</summary><ol>{campaign.players.map(player=><li key={player.playerNumber}><span>{player.playerNumber}</span><strong>{player.playerAlias}</strong><small>{player.heroSlug?heroDefinitionBySlug[player.heroSlug]?.displayNameZhTw??player.heroSlug:'尚未選角'}{player.customName?' · '+player.customName:''}</small></li>)}{!campaign.players.length&&<li className="empty">尚無玩家加入</li>}</ol></details></td>
            <td>{campaign.activeSessionCount}<small>尚未過期</small></td>
            <td><time>{new Date(campaign.updatedAt+'Z').toLocaleString('zh-TW')}</time></td>
            <td><div className="admin-row-actions"><button type="button" disabled={Boolean(busy)} onClick={()=>{if(window.confirm(campaign.isActive?'凍結後玩家將無法儲存，確定繼續？':'確定重新啟用這個戰役？'))void mutate('/api/admin/campaigns/'+campaign.id+'/status','PATCH',{isActive:!campaign.isActive},campaign.isActive?'戰役已凍結。':'戰役已啟用。','status-'+campaign.id);}}>{busy==='status-'+campaign.id?'處理中…':campaign.isActive?'凍結':'啟用'}</button><button type="button" disabled={Boolean(busy)} onClick={()=>{setPasswordTarget({id:campaign.id,name:campaign.name});setNewPassword('');setConfirmPassword('');setRevokeOnReset(true);}}><KeyRound/>重設密碼</button><button type="button" disabled={Boolean(busy)} onClick={()=>void exportBackup(campaign.id)}><Download/>{busy==='export-'+campaign.id?'匯出中…':'匯出備份'}</button><button type="button" disabled={Boolean(busy)||campaign.activeSessionCount===0} onClick={()=>{if(window.confirm('這會讓此戰役所有玩家立即登出，確定繼續？'))void mutate('/api/admin/campaigns/'+campaign.id+'/sessions','DELETE',undefined,'所有玩家登入憑證已撤銷。','sessions-'+campaign.id);}}>{busy==='sessions-'+campaign.id?'撤銷中…':'登出全部玩家'}</button></div></td>
          </tr>)}
          {!data.campaigns.length&&<tr><td colSpan={6}>目前沒有戰役資料。</td></tr>}
        </tbody></table></div>
      </section>

    </>}

    {passwordTarget&&<div className="character-modal-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&setPasswordTarget(null)}><form className="admin-password-dialog" onSubmit={resetPassword}>
      <header><div><p className="eyebrow">RESET CAMPAIGN PASSWORD</p><h2>重設戰役密碼</h2><p>{passwordTarget.name} · {passwordTarget.id}</p></div><button type="button" onClick={()=>setPasswordTarget(null)} aria-label="關閉">×</button></header>
      <label>新密碼<input type="password" autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} required minLength={8} maxLength={128}/></label>
      <label>確認新密碼<input type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} required minLength={8} maxLength={128} aria-invalid={Boolean(confirmPassword&&newPassword!==confirmPassword)} aria-describedby="password-match-message"/></label>
      <div id="password-match-message" className={'admin-password-match '+(confirmPassword&&newPassword!==confirmPassword?'error':confirmPassword?'success':'')} aria-live="polite">{confirmPassword&&(newPassword!==confirmPassword?'兩次輸入的密碼不一致。':'兩次密碼一致。')}</div>
      <label className="admin-reset-option"><input type="checkbox" checked={revokeOnReset} onChange={event=>setRevokeOnReset(event.target.checked)}/><span>同時撤銷所有玩家登入憑證（建議）</span></label>
      <p>密碼本身不會出現在管理操作紀錄。</p>
      <button className="button" type="submit" disabled={busy==='password'||newPassword.length<8||newPassword!==confirmPassword}>{busy==='password'?'重設中…':'確認重設密碼'}</button>
    </form></div>}
  </section>;
}
