import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Loader2, LogOut, PackageOpen, Pencil, Shield, Sparkles, UserRound, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { VersionConflictPanel } from '../components/VersionConflictPanel';
import { EventRecordsSection } from '../components/EventRecordsSection';
import { Toast } from '../components/common/Toast';
import { useUnsavedChangesWarning } from '../lib/useOptimisticSave';
import type { ApiErrorResponse, AuthSession, CampaignMapResponse, CampaignWagon, CampaignWagonResponse, ItemsResponse, WagonEquipmentInstance, WagonResource, WagonTimeToken } from '../../shared/types';

const WAGON_BOARD_IMAGE_URL = '/images/campaign/wagon-board-concept-v3.webp';
const WAGON_VISUAL_URLS = [WAGON_BOARD_IMAGE_URL] as const;

async function preloadImage(url: string) {
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('圖片載入失敗：' + url));
  });
  image.src = url;
  if (!image.complete || image.naturalWidth === 0) await loaded;
  if (typeof image.decode === 'function') await image.decode();
}

const DAY_ROWS = [Array.from({ length: 10 }, (_, index) => index + 1), Array.from({ length: 10 }, (_, index) => index + 11), Array.from({ length: 10 }, (_, index) => index + 21)];
const WORKSHOP_GEOMETRY: Record<string, { centers: [number, number][] }> = {
  armorers_tools: { centers: [[155, 643], [155, 591], [156, 537]] },
  alchemists_lab: { centers: [[400, 458], [400, 408], [400, 358]] },
  bowyers_table: { centers: [[604, 394], [604, 342], [604, 291]] },
  workshop: { centers: [[813, 413], [813, 362], [813, 310]] },
  blacksmiths_tools: { centers: [[1132, 553], [1132, 504], [1132, 455]] },
};

type WagonMutationRequest={path:string;payload:Record<string,unknown>;successMessage:string};
function changedWagonFields(before:CampaignWagon,latest:CampaignWagon){
  const fields:string[]=[];
  if(before.elapsedDays!==latest.elapsedDays)fields.push('累計時間');
  if(before.sharedGold!==latest.sharedGold)fields.push('團隊共用金錢');
  if(before.notes!==latest.notes)fields.push('馬車備註');
  if(before.campaignName!==latest.campaignName)fields.push('戰役名稱');
  if(JSON.stringify(before.upgrades)!==JSON.stringify(latest.upgrades))fields.push('工坊等級');
  if(JSON.stringify(before.resources)!==JSON.stringify(latest.resources))fields.push('素材庫存');
  if(JSON.stringify(before.timeTokens)!==JSON.stringify(latest.timeTokens))fields.push('Time Token');
  if(JSON.stringify(before.equipment)!==JSON.stringify(latest.equipment))fields.push('裝備庫存');
  return fields.length?fields:['馬車版本'];
}

function diamondPoints(cx: number, cy: number, halfX: number, halfY: number) {
  return cx + ',' + (cy - halfY) + ' ' + (cx + halfX) + ',' + cy + ' ' + cx + ',' + (cy + halfY) + ' ' + (cx - halfX) + ',' + cy;
}

async function readError(response: Response) {
  try { return ((await response.json()) as ApiErrorResponse).error.message; }
  catch { return '操作失敗，請稍後再試。'; }
}

export function CampaignPage({ session, loading, onLogout }: {
  session: AuthSession | null; loading: boolean; onLogout: () => Promise<void>;
}) {
  const [wagon, setWagon] = useState<CampaignWagon | null>(null);
  const [wagonLoading, setWagonLoading] = useState(false);
  const [wagonVisualStatus, setWagonVisualStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [wagonImagesLoaded, setWagonImagesLoaded] = useState(0);
  const [wagonVisualAttempt, setWagonVisualAttempt] = useState(0);
  const [failure, setFailure] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [pendingDay, setPendingDay] = useState<number | null>(null);
  const [savingDay, setSavingDay] = useState(false);
  const [toast, setToast] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [tokenFormOpen, setTokenFormOpen] = useState(false);
  const [storyCardCode, setStoryCardCode] = useState('');
  const [tokenCode, setTokenCode] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [unlockAtDay, setUnlockAtDay] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [savingUpgradeCode, setSavingUpgradeCode] = useState('');
  const savingUpgradeRef = useRef(false);
  const [activeFocusTab, setActiveFocusTab] = useState<'workshops' | 'timetrack'>('workshops');
  const [versionConflict,setVersionConflict]=useState<{request:WagonMutationRequest;fields:string[];expectedVersion:number;currentVersion:number}|null>(null);
  const [retryingConflict,setRetryingConflict]=useState(false);

  useEffect(() => { document.title = '馬車面板｜THE HUNTERS A.D. 1492 WIKI'; }, []);

  useEffect(() => {
    let active = true;
    setWagonVisualStatus('loading');
    setWagonImagesLoaded(0);
    Promise.all(WAGON_VISUAL_URLS.map(async url => {
      await preloadImage(url);
      if (active) setWagonImagesLoaded(count => count + 1);
    }))
      .then(() => { if (active) setWagonVisualStatus('ready'); })
      .catch(() => { if (active) setWagonVisualStatus('error'); });
    return () => { active = false; };
  }, [wagonVisualAttempt]);


  async function loadWagon() {
    if (!session) return;
    setWagonLoading(true);
    setFailure('');
    try {
      const response = await fetch('/api/campaign/wagon', { credentials: 'same-origin' });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json() as CampaignWagonResponse;
      setWagon(result.data);
      setCampaignName(result.data.campaignName);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : '無法讀取馬車資料。');
    } finally {
      setWagonLoading(false);
    }
  }

  const [roadEventNotes, setRoadEventNotes] = useState('');
  const [townEventNotes, setTownEventNotes] = useState('');
  const [mapVersion, setMapVersion] = useState<number | undefined>(undefined);
  const [mapNotesStatus, setMapNotesStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  async function loadMapEventNotes() {
    if (!session) return;
    setMapNotesStatus('loading');
    try {
      const response = await fetch('/api/campaign/map', { credentials: 'same-origin' });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json() as CampaignMapResponse;
      setRoadEventNotes(result.data.roadEventNotes ?? '');
      setTownEventNotes(result.data.townEventNotes ?? '');
      setMapVersion(result.data.version);
      setMapNotesStatus('ready');
    } catch {
      setMapNotesStatus('error');
    }
  }

  useEffect(() => { void loadWagon(); void loadMapEventNotes(); }, [session?.campaignId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const hasPlusThirty = wagon ? wagon.elapsedDays > 30 : false;
  const currentSlotNumber = wagon ? ((wagon.elapsedDays - 1) % 30) + 1 : 1;

  const tokensBySlot = useMemo(() => {
    const groups = new Map<number, WagonTimeToken[]>();
    for (const token of wagon?.timeTokens ?? []) {
      const isTokenPlusThirty = token.unlockAtDay > 30;
      if (isTokenPlusThirty === hasPlusThirty) {
        const slot = ((token.unlockAtDay - 1) % 30) + 1;
        groups.set(slot, [...(groups.get(slot) ?? []), token]);
      }
    }
    return groups;
  }, [wagon?.timeTokens, hasPlusThirty]);

  if (loading) return <section className="campaign-gate"><p className="eyebrow">VERIFYING SESSION</p><h1>正在確認戰役憑證…</h1></section>;
  if (!session) return <section className="campaign-gate">
    <Shield aria-hidden="true" />
    <p className="eyebrow">CAMPAIGN ACCESS REQUIRED</p>
    <h1>登入後進入戰役</h1>
    <p>使用戰役 ID、共用密碼與玩家席位登入。</p>
    <Link className="button" to="/login" state={{ from: '/campaigns' }}>登入戰役</Link>
  </section>;

  async function logout() {
    setLoggingOut(true);
    await onLogout();
    setLoggingOut(false);
  }

  function showWagonConflict(problem:ApiErrorResponse,request:WagonMutationRequest){
    if(!wagon||problem.error.conflict?.scope!=='WAGON'){setFailure(problem.error.message);return;}
    const latest=problem.error.conflict.latest as CampaignWagon;
    setVersionConflict({request,fields:changedWagonFields(wagon,latest),expectedVersion:wagon.version,currentVersion:latest.version});
    setWagon(latest);setFailure('');
  }
  async function retryWagonConflict(){
    if(!wagon||!versionConflict)return;
    setRetryingConflict(true);
    try{
      const response=await fetch(versionConflict.request.path,{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...versionConflict.request.payload,expectedVersion:wagon.version})});
      const payload=await response.json() as CampaignWagonResponse|ApiErrorResponse;
      if(!response.ok||'error' in payload){
        if('error' in payload&&payload.error.code==='WAGON_VERSION_CONFLICT'){showWagonConflict(payload,versionConflict.request);return;}
        throw new Error('error' in payload?payload.error.message:'無法重新套用修改。');
      }
      setWagon(payload.data);setVersionConflict(null);setPendingDay(null);setToast(versionConflict.request.successMessage);
    }catch(cause){setFailure(cause instanceof Error?cause.message:'無法重新套用修改。');}
    finally{setRetryingConflict(false);}
  }

  async function updateDay() {
    if (!wagon || pendingDay === null) return;
    setSavingDay(true);
    try {
      const response = await fetch('/api/campaign/wagon/day', {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elapsedDays: pendingDay, expectedVersion: wagon.version }),
      });
      if(!response.ok){
        const problem=await response.json() as ApiErrorResponse;
        if(problem.error.code==='WAGON_VERSION_CONFLICT'){showWagonConflict(problem,{path:'/api/campaign/wagon/day',payload:{elapsedDays:pendingDay},successMessage:'時間已更新為第 '+pendingDay+' 天'});return;}
        throw new Error(problem.error.message);
      }
      const result = await response.json() as CampaignWagonResponse;
      setWagon(result.data);
      setToast(`時間已更新為第 ${result.data.elapsedDays} 天`);
      setPendingDay(null);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : '無法更新時間。');
      setPendingDay(null);
    } finally { setSavingDay(false); }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/campaign/name', {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignName }),
    });
    if (!response.ok) { setFailure(await readError(response)); return; }
    setWagon(current => current ? { ...current, campaignName } : current);
    setEditingName(false);
    setToast('戰役名稱已更新');
  }

  async function setUpgrade(stationCode: string, level: number) {
    if (!wagon || savingUpgradeRef.current) return;
    savingUpgradeRef.current = true;
    setSavingUpgradeCode(stationCode);
    try {
      const response = await fetch(`/api/campaign/wagon/upgrades/${stationCode}`, {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, expectedVersion: wagon.version }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as ApiErrorResponse;
        if(problem.error.code==='WAGON_VERSION_CONFLICT')showWagonConflict(problem,{path:'/api/campaign/wagon/upgrades/'+stationCode,payload:{level},successMessage:'工坊等級已更新'});
        else setFailure(problem.error.message);
        return;
      }
      const result = await response.json() as CampaignWagonResponse;
      setWagon(result.data);
      setToast('工坊等級已更新');
    } finally {
      savingUpgradeRef.current = false;
      setSavingUpgradeCode('');
    }
  }

  async function addTimeToken(event: FormEvent) {
    event.preventDefault();
    setSavingToken(true);
    const response = await fetch('/api/campaign/wagon/time-tokens', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyCardCode, tokenCode, unlockAfterDays: Number(unlockAtDay) }),
    });
    if (!response.ok) {
      setFailure(await readError(response));
      setSavingToken(false);
      return;
    }
    const result = await response.json() as CampaignWagonResponse;
    setWagon(result.data);
    setStoryCardCode('');
    setUnlockAtDay('');
    setTokenFormOpen(false);
    setSavingToken(false);
    setToast('Time Token 已放上時間軌');
  }

  async function removeToken(tokenId: number) {
    const response = await fetch(`/api/campaign/wagon/time-tokens/${tokenId}`, {
      method: 'DELETE', credentials: 'same-origin',
    });
    if (!response.ok) { setFailure(await readError(response)); return; }
    const result = await response.json() as CampaignWagonResponse;
    setWagon(result.data);
    setToast('Time Token 已移除，劇情卡可以觸發');
  }

  if (wagonLoading && !wagon) return <section className="campaign-gate"><Clock3 aria-hidden="true" /><p className="eyebrow">OPENING THE WAGON</p><h1>正在整理馬車面板…</h1></section>;
  if (!wagon) return <section className="campaign-gate"><p className="eyebrow">WAGON UNAVAILABLE</p><h1>目前無法開啟馬車</h1><p>{failure}</p><button className="button" onClick={() => void loadWagon()}>重新讀取</button></section>;

  const dueTokens = wagon.timeTokens.filter(token => token.unlockAtDay <= wagon.elapsedDays);
  return <section className="campaign-page wagon-page" aria-labelledby="campaign-title">
    <header className="campaign-heading">
      <div>
        <p className="eyebrow">ACTIVE CAMPAIGN · PLAYER {session.playerNumber}</p>
        {editingName
          ? <form className="campaign-name-form" onSubmit={saveName}>
            <label className="sr-only" htmlFor="campaign-name">戰役名稱</label>
            <input id="campaign-name" value={campaignName} maxLength={60} onChange={event => setCampaignName(event.target.value)} autoFocus />
            <button className="button" type="submit">儲存</button>
            <button className="text-button" type="button" onClick={() => { setCampaignName(wagon.campaignName); setEditingName(false); }}>取消</button>
          </form>
          : <div className="campaign-title-row"><h1 id="campaign-title">{wagon.campaignName}</h1><button className="icon-button" onClick={() => setEditingName(true)} aria-label="修改戰役名稱"><Pencil size={15} /></button></div>}
        <p className="campaign-id">戰役 ID · {session.campaignId}</p>
      </div>
      <span className={session.isActive ? 'campaign-state active' : 'campaign-state'}>{session.isActive ? '進行中' : '已凍結'}</span>
    </header>

    {versionConflict&&<VersionConflictPanel title="馬車資料已被其他玩家更新" changedFields={versionConflict.fields} expectedVersion={versionConflict.expectedVersion} currentVersion={versionConflict.currentVersion} busy={retryingConflict} onReload={()=>{setVersionConflict(null);setPendingDay(null);setToast('已採用最新馬車資料。');}} onReapply={()=>void retryWagonConflict()}/>}

    <div className="campaign-session-card">
      <UserRound aria-hidden="true" />
      <div><small>目前玩家</small><strong>{session.playerAlias}</strong><span>玩家席位 {session.playerNumber}</span></div>
      <button className="button" onClick={logout} disabled={loggingOut}><LogOut size={15} />{loggingOut ? '登出中…' : '登出'}</button>
    </div>

    <article className="wagon-board">
      <header className="wagon-board-head">
        <div><p className="eyebrow">WAGON RECORD</p><h2>馬車全景總覽</h2></div>
        <div className="wagon-board-status">
          <SharedGold value={wagon.sharedGold} version={wagon.version} onChange={setWagon} onError={setFailure} onToast={setToast} onConflict={showWagonConflict} />
          <div className="elapsed-day">
            <small>累計時間</small>
            <strong>{wagon.elapsedDays}</strong>
            <span>天 {hasPlusThirty ? '(+30沙漏點亮)' : ''}</span>
          </div>
        </div>
      </header>

      <div className="wagon-canvas">
        {wagonVisualStatus === 'loading' && <div className="wagon-visual-state" role="status" aria-live="polite" aria-busy="true">
          <Loader2 className="spinning-icon" aria-hidden="true" />
          <strong>正在載入馬車面板…</strong>
          <small>{wagonImagesLoaded} / {WAGON_VISUAL_URLS.length}</small>
        </div>}
        {wagonVisualStatus === 'error' && <div className="wagon-visual-state error" role="alert">
          <strong>馬車面板圖片載入失敗</strong>
          <button className="button secondary" type="button" onClick={() => setWagonVisualAttempt(value => value + 1)}>重新載入</button>
        </div>}
        {wagonVisualStatus === 'ready' && <svg className="wagon-board-svg wagon-board-svg-ready" viewBox="0 0 1536 1024" role="group" aria-label="馬車面板：五種工坊升級軌與三列交錯時間軌">
          <image href={WAGON_BOARD_IMAGE_URL} x="0" y="0" width="1536" height="1024" />

          {/* 五種工坊等級：純狀態顯示，不接受點擊，累加點亮 */}
          <g className="svg-workshop-slots" aria-label="五種工坊當前等級（純顯示）" pointerEvents="none">
            {wagon.upgrades.flatMap(upgrade => {
              const geometry = WORKSHOP_GEOMETRY[upgrade.code];
              if (!geometry) return [];
              return geometry.centers.map(([cx, cy], index) => {
                const level = index + 1;
                const isLit = level <= upgrade.level;
                return <polygon
                  key={upgrade.code + level}
                  className={'svg-workshop-slot station-fill-' + upgrade.code + (isLit ? ' lit' : '')}
                  points={diamondPoints(cx, cy, 27, 27)}
                  aria-label={`${upgrade.name} 第 ${level} 級：${isLit ? '已點亮' : '未達成'}`}
                />;
              });
            })}
          </g>

          {/* 時間軌：支援點擊切換，30天後自動點亮+30沙漏格 */}
          <g className="svg-time-slots" aria-label="時間軌">
            {DAY_ROWS.flatMap((days, rowIndex) => days.map((slotNum, index) => {
              const cx = (rowIndex === 1 ? 421 : 371) + index * 102;
              const cy = 781 + rowIndex * 57;
              const targetDay = (hasPlusThirty ? 30 : 0) + slotNum;
              const tokens = tokensBySlot.get(slotNum) ?? [];
              const isCurrent = slotNum === currentSlotNumber;
              const isPast = slotNum < currentSlotNumber;
              return <g
                className="svg-hit-target"
                role="button"
                tabIndex={0}
                aria-label={'設定為第 ' + targetDay + ' 天' + (tokens.length ? '，有 Time Token: ' + tokens.map(t => t.tokenCode).join(',') : '')}
                onClick={() => setPendingDay(targetDay)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setPendingDay(targetDay);
                  }
                }}
                key={slotNum}
              >
                <polygon
                  className={'svg-time-slot' + (isCurrent ? ' current' : '') + (isPast ? ' past' : '')}
                  points={diamondPoints(cx, cy, 37, 34)}
                />
                {isCurrent && <circle className="svg-current-day" cx={cx} cy={cy} r="9" />}
                {tokens.map((token, tokenIndex) => {
                  const badgeY = cy - ((tokens.length - 1) * 12) + tokenIndex * 24;
                  return <g key={token.id}>
                    <circle className="svg-token-badge" cx={cx + 31} cy={badgeY} r="12" />
                    <text className="svg-token-text" x={cx + 31} y={badgeY + 4}>{token.tokenCode}</text>
                  </g>;
                })}
              </g>;
            }))}
          </g>

          {/* +30 沙漏格：天數 > 30 時點亮，點擊切換前後 30 天區間 */}
          <g
            className={'svg-hit-target svg-plus-thirty' + (hasPlusThirty ? ' active' : '')}
            role="button"
            tabIndex={0}
            aria-label={hasPlusThirty ? '目前處於 +30 天階段（第 31–60 天），點擊切換回 1–30 天' : '點擊切換至 +30 天階段（第 31–60 天）'}
            onClick={() => {
              if (hasPlusThirty) {
                setPendingDay(Math.max(1, wagon.elapsedDays - 30));
              } else {
                setPendingDay(Math.min(60, wagon.elapsedDays + 30));
              }
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (hasPlusThirty) {
                  setPendingDay(Math.max(1, wagon.elapsedDays - 30));
                } else {
                  setPendingDay(Math.min(60, wagon.elapsedDays + 30));
                }
              }
            }}
          >
            <polygon
              className={hasPlusThirty ? 'lit' : ''}
              points={diamondPoints(203, 858, 39, 39)}
            />
            {hasPlusThirty && <text className="svg-hourglass-icon" x="203" y="865">⏳</text>}
          </g>
        </svg>}
      </div>
      {/* 總覽下方：分區放大互動切換（工坊控制 / 時間軌專注區） */}
      <nav className="wagon-focus-nav" aria-label="分區放大檢視切換">
        <button
          className={'focus-tab-btn' + (activeFocusTab === 'workshops' ? ' active' : '')}
          onClick={() => setActiveFocusTab('workshops')}
        >
          <Wrench size={16} /> 工坊升級控制台
        </button>
        <button
          className={'focus-tab-btn' + (activeFocusTab === 'timetrack' ? ' active' : '')}
          onClick={() => setActiveFocusTab('timetrack')}
        >
          <Clock3 size={16} /> 時間軌專注操作區
        </button>
      </nav>

      {/* 分區放大 A：時間軌專注操作區 */}
      {activeFocusTab === 'timetrack' && (
        <section className="wagon-timetrack-focus-section" aria-labelledby="timetrack-focus-title">
          <div className="timetrack-focus-header">
            <div>
              <p className="eyebrow">TIME TRACK FOCUS</p>
              <h3 id="timetrack-focus-title">時間軌放大操作（第 1–60 天）</h3>
            </div>
            <div className="timetrack-quick-actions">
              <button
                className={'button' + (hasPlusThirty ? ' active-hourglass' : '')}
                onClick={() => {
                  if (hasPlusThirty) setPendingDay(Math.max(1, wagon.elapsedDays - 30));
                  else setPendingDay(Math.min(60, wagon.elapsedDays + 30));
                }}
              >
                {hasPlusThirty ? '⏳ 31–60 天中（切換為 1–30 天）' : '＋30 沙漏未點亮（點擊切為 31–60 天）'}
              </button>
            </div>
          </div>

          <div className="timetrack-slots-grid">
            {Array.from({ length: 30 }, (_, i) => i + 1).map(slotNum => {
              const targetDay = (hasPlusThirty ? 30 : 0) + slotNum;
              const tokens = tokensBySlot.get(slotNum) ?? [];
              const isCurrent = slotNum === currentSlotNumber;
              const isPast = slotNum < currentSlotNumber;
              return (
                <button
                  key={slotNum}
                  type="button"
                  className={'time-slot-cell' + (isCurrent ? ' current' : '') + (isPast ? ' past' : '')}
                  onClick={() => setPendingDay(targetDay)}
                  aria-label={`第 ${targetDay} 天${tokens.length ? '，Token: ' + tokens.map(t => t.tokenCode).join(',') : ''}`}
                >
                  <span className="slot-day-number">{targetDay}</span>
                  {tokens.length > 0 && (
                    <span className="slot-tokens-indicator">
                      {tokens.map(t => (
                        <span key={t.id} className="token-dot" title={`${t.tokenCode} (${t.storyCardCode})`}>
                          {t.tokenCode}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </article>

    {dueTokens.length > 0 && <section className="due-panel" aria-labelledby="due-title">
      <div><Sparkles aria-hidden="true" /><p className="eyebrow">STORY CARDS READY</p><h2 id="due-title">可移除的 Time Token</h2></div>
      <div className="due-token-list">
        {dueTokens.map(token => <article key={token.id}>
          <span className="token-seal">{token.tokenCode}</span>
          <div><strong>{token.storyCardCode}</strong><small>第 {token.unlockAtDay} 天到期</small></div>
          <button className="button" onClick={() => void removeToken(token.id)}>移除並解鎖</button>
        </article>)}
      </div>
    </section>}

    <section className="wagon-grid">
      <article className="wagon-panel workshop-panel">
        <header><div><p className="eyebrow">FIVE WORKSHOPS</p><h2><Wrench size={20} />五種工坊</h2></div><small>直接點選等級（0–3 級）</small></header>
        <div className="workshop-list">
          {wagon.upgrades.map(upgrade => <div className="workshop-row" key={upgrade.code}>
            <div>{upgrade.imageUrl && <img src={upgrade.imageUrl} alt="" loading="lazy" decoding="async" />}<span><strong>{upgrade.name}</strong><small>{upgrade.originalName}</small></span></div>
            <div className="level-selector" aria-label={`${upgrade.name}等級`}>
              {[0, 1, 2, 3].map(level => <button key={level} disabled={Boolean(savingUpgradeCode)} className={level === upgrade.level ? 'selected' : ''} onClick={() => void setUpgrade(upgrade.code, level)} aria-pressed={level === upgrade.level}>{level}</button>)}
            </div>
          </div>)}
        </div>
      </article>

      <article className="wagon-panel token-panel">
        <header><div><p className="eyebrow">TIME TOKENS</p><h2><Clock3 size={20} />劇情卡時間標記</h2></div><button className="button" onClick={() => setTokenFormOpen(value => !value)}>{tokenFormOpen ? '收起' : '放置 Token'}</button></header>
        {tokenFormOpen && <form className="token-form" onSubmit={addTimeToken}>
          <label>劇情卡編號
            <select value={storyCardCode} onChange={event => setStoryCardCode(event.target.value)} required>
              <option value="">選擇劇情卡</option>
              {wagon.availableStoryCardCodes.map(code => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <label>Token
            <select value={tokenCode} onChange={event => setTokenCode(event.target.value as typeof tokenCode)}>{['A', 'B', 'C', 'D'].map(code => <option key={code}>{code}</option>)}</select>
          </label>
          <label>幾天後解鎖<input type="number" min={1} max={60 - wagon.elapsedDays} value={unlockAtDay} onChange={event => setUnlockAtDay(event.target.value)} placeholder="例如 5" required />
            {unlockAtDay && <small>將於第 {wagon.elapsedDays + Number(unlockAtDay)} 天解鎖</small>}
          </label>
          <button className="button" disabled={savingToken || wagon.elapsedDays >= 60}>{savingToken ? '放置中…' : '確認放置'}</button>
        </form>}
        <div className="active-token-list">
          {wagon.timeTokens.length === 0 && <p className="muted">目前沒有有效的 Time Token。</p>}
          {wagon.timeTokens.map(token => {
            const remainingDays = Math.max(0, token.unlockAtDay - wagon.elapsedDays);
            return <div key={token.id}>
              <span className="token-seal">{token.tokenCode}</span>
              <strong>{token.storyCardCode}</strong>
              <span>第 {token.unlockAtDay} 天解鎖</span>
              <em>{remainingDays === 0 ? '現在可解鎖' : `剩餘 ${remainingDays} 天`}</em>
            </div>;
          })}
        </div>
      </article>

      <ResourceInventory resources={wagon.resources} version={wagon.version} onChange={setWagon} onError={setFailure} onToast={setToast} onConflict={showWagonConflict} />
      <EquipmentInventory equipment={wagon.equipment} onChange={setWagon} onError={setFailure} onToast={setToast} />
      <WagonNotes notes={wagon.notes} version={wagon.version} onChange={setWagon} onError={setFailure} onToast={setToast} onConflict={showWagonConflict} />
      {mapNotesStatus === 'ready' && typeof mapVersion === 'number'
        ? <EventRecordsSection
            initialRoadNotes={roadEventNotes}
            initialTownNotes={townEventNotes}
            expectedVersion={mapVersion}
            onSaved={updatedMap => {
              setRoadEventNotes(updatedMap.roadEventNotes);
              setTownEventNotes(updatedMap.townEventNotes);
              setMapVersion(updatedMap.version);
            }}
            onAdoptLatest={latestMap => {
              setRoadEventNotes(latestMap.roadEventNotes);
              setTownEventNotes(latestMap.townEventNotes);
              setMapVersion(latestMap.version);
            }}
            onToast={setToast}
            onError={setFailure}
            variant="wagon"
          />
        : <section className="wagon-panel event-records-wagon-panel event-records-load-state" aria-live="polite">
            {mapNotesStatus === 'loading'
              ? <><Loader2 className="spin" aria-hidden="true" /><p>正在載入事件紀錄…</p></>
              : <><p role="alert">目前無法載入事件紀錄，為避免覆寫其他玩家的資料，編輯功能暫時停用。</p><button className="button secondary" onClick={() => void loadMapEventNotes()} type="button">重新載入</button></>}
          </section>}
    </section>

    {pendingDay !== null && <div className="confirm-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPendingDay(null); }}>
      <section className="confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="confirm-day-title">
        <p className="eyebrow">CONFIRM TIME CHANGE</p>
        <h2 id="confirm-day-title">將時間改為第 {pendingDay} 天？</h2>
        <p>目前是第 {wagon.elapsedDays} 天。這只更新網頁紀錄，不會自動處理或重新鎖定劇情卡。</p>
        <div><button className="text-button" onClick={() => setPendingDay(null)}>取消</button><button className="button" disabled={savingDay} onClick={() => void updateDay()}>{savingDay ? '更新中…' : '確認更新'}</button></div>
      </section>
    </div>}
    {failure ? (
      <Toast message={failure} kind="error" onClose={() => setFailure('')} />
    ) : (
      <Toast message={toast} kind="status" />
    )}
  </section>;
}


function SharedGold({ value, version, onChange, onError, onToast, onConflict }: {
  value: number;
  version: number;
  onChange: (wagon: CampaignWagon) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onConflict: (problem:ApiErrorResponse,request:WagonMutationRequest) => void;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const versionRef = useRef(version);

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
  }, []);

  async function update(sharedGold: number) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const response = await fetch('/api/campaign/wagon/gold', {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sharedGold, expectedVersion: versionRef.current }),
    });
    if (!response.ok) {
      const problem = (await response.json()) as ApiErrorResponse;
      if(problem.error.code==='WAGON_VERSION_CONFLICT')onConflict(problem,{path:'/api/campaign/wagon/gold',payload:{sharedGold},successMessage:'團隊共用金錢已更新為 '+sharedGold});
      else {
        setDisplayValue(value);
        onError(problem.error.message);
      }
    } else {
      const result = await response.json() as CampaignWagonResponse;
      setDisplayValue(result.data.sharedGold);
      onChange(result.data);
      onToast('團隊共用金錢已更新為 ' + result.data.sharedGold);
    }
    busyRef.current = false;
    setBusy(false);
  }

  function adjust(delta: number) {
    if (busyRef.current) return;
    setDisplayValue(current => {
      const next = Math.max(0, Math.min(99999, current + delta));
      if (next === current) return current;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void update(next);
      }, 300);
      return next;
    });
  }

  return <div className="shared-gold">
    <small>團隊共用金錢{busy ? ' · 儲存中…' : ''}</small>
    <div>
      <button disabled={busy || displayValue === 0} onClick={() => adjust(-5)} aria-label="共用金錢減少 5">−5</button>
      <button disabled={busy || displayValue === 0} onClick={() => adjust(-1)} aria-label="共用金錢減少 1">−1</button>
      <strong aria-live="polite">{displayValue}</strong>
      <button disabled={busy || displayValue === 99999} onClick={() => adjust(1)} aria-label="共用金錢增加 1">+1</button>
      <button disabled={busy || displayValue === 99999} onClick={() => adjust(5)} aria-label="共用金錢增加 5">+5</button>
    </div>
  </div>;
}


function ResourceInventory({ resources, version, onChange, onError, onToast, onConflict }: {
  resources: WagonResource[];
  version: number;
  onChange: (wagon: CampaignWagon) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onConflict: (problem:ApiErrorResponse,request:WagonMutationRequest) => void;
}) {
  const [busyCode, setBusyCode] = useState('');
  const busyRef = useRef(false);
  async function setQuantity(resource: WagonResource, quantity: number) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyCode(resource.code);
    const nextQuantity = Math.max(0, Math.min(999, quantity));
    const response = await fetch('/api/campaign/wagon/resources/' + resource.code, {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: nextQuantity, expectedVersion: version }),
    });
    if (!response.ok) {
      const problem = (await response.json()) as ApiErrorResponse;
      if(problem.error.code==='WAGON_VERSION_CONFLICT')onConflict(problem,{path:'/api/campaign/wagon/resources/'+resource.code,payload:{quantity:nextQuantity},successMessage:resource.name+'已更新為 '+nextQuantity});
      else onError(problem.error.message);
    } else {
      const result = await response.json() as CampaignWagonResponse;
      onChange(result.data);
      onToast(resource.name + '已更新為 ' + nextQuantity);
    }
    busyRef.current = false;
    setBusyCode('');
  }
  return <article className="wagon-panel resource-inventory">
    <header><div><p className="eyebrow">CRAFTING RESOURCES</p><h2><PackageOpen size={20} />素材庫存</h2></div><small>素材以數量保存</small></header>
    <div className="resource-grid">
      {resources.map(resource => <div className={resource.quantity > 0 ? 'resource-counter owned' : 'resource-counter'} key={resource.code}>
        {resource.imageUrl ? <img src={resource.imageUrl} alt="" loading="lazy" decoding="async" /> : <span className="resource-fallback" />}
        <span><strong>{resource.name}</strong><small>{resource.code.replace(/^(material|plant|trophy)_/, '')}</small></span>
        <div>
          <button aria-label={resource.name + '減少 5'} disabled={Boolean(busyCode) || resource.quantity === 0} onClick={() => void setQuantity(resource, resource.quantity - 5)}>−5</button>
          <button aria-label={resource.name + '減少 1'} disabled={Boolean(busyCode) || resource.quantity === 0} onClick={() => void setQuantity(resource, resource.quantity - 1)}>−</button>
          <output aria-label={resource.name + '數量'}>{resource.quantity}</output>
          <button aria-label={resource.name + '增加 1'} disabled={Boolean(busyCode) || resource.quantity >= 999} onClick={() => void setQuantity(resource, resource.quantity + 1)}>＋</button>
          <button aria-label={resource.name + '增加 5'} disabled={Boolean(busyCode) || resource.quantity >= 999} onClick={() => void setQuantity(resource, resource.quantity + 5)}>＋5</button>
        </div>
      </div>)}
    </div>
  </article>;
}


function WagonNotes({ notes, version, onChange, onError, onToast, onConflict }: {
  notes: string;
  version: number;
  onChange: (wagon: CampaignWagon) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onConflict: (problem:ApiErrorResponse,request:WagonMutationRequest) => void;
}) {
  const [draft, setDraft] = useState(notes);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dirty = draft !== notes;

  useEffect(() => { if (!dirty) setDraft(notes); }, [notes, dirty]);

  useUnsavedChangesWarning(dirty);

  async function saveNotes() {
    if (!dirty || savingRef.current) return;
    if (!window.confirm('儲存目前的馬車備註？')) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await fetch('/api/campaign/wagon/notes', {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: draft, expectedVersion: version }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as ApiErrorResponse;
        if(problem.error.code==='WAGON_VERSION_CONFLICT')onConflict(problem,{path:'/api/campaign/wagon/notes',payload:{notes:draft},successMessage:'馬車備註已儲存'});
        else onError(problem.error.message);
        return;
      }
      const result = await response.json() as CampaignWagonResponse;
      onChange(result.data);
      setDraft(result.data.notes);
      onToast('馬車備註已儲存');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <article className="wagon-panel wagon-notes">
    <header>
      <div><p className="eyebrow">WAGON NOTES</p><h2><Pencil size={20} />馬車備註</h2></div>
      <small>{dirty ? '有尚未儲存的修改' : '已儲存'}</small>
    </header>
    <div className="wagon-notes-editor">
      <label htmlFor="wagon-notes">線索與其他團隊紀錄</label>
      <textarea
        id="wagon-notes"
        value={draft}
        maxLength={5000}
        rows={10}
        placeholder={'例如：\n・獲得線索 1、2、3\n・需要回頭調查舊教堂\n・下次遊戲提醒'}
        onChange={event => setDraft(event.target.value)}
      />
      <div>
        <span>{draft.length} / 5000</span>
        <button className="button" type="button" disabled={!dirty || saving} onClick={() => void saveNotes()}>
          {saving ? '儲存中…' : '儲存備註'}
        </button>
      </div>
    </div>
  </article>;
}

function EquipmentInventory({ equipment, onChange, onError, onToast }: {
  equipment: WagonEquipmentInstance[];
  onChange: (wagon: CampaignWagon) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemsResponse['data']>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  async function searchItems(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    const response = await fetch('/api/items?q=' + encodeURIComponent(query.trim()) + '&pageSize=12');
    if (!response.ok) onError(await readError(response));
    else {
      const result = await response.json() as ItemsResponse;
      setResults(result.data);
      setSelectedItemId(result.data[0] ? String(result.data[0].id) : '');
    }
    setSearching(false);
  }

  async function addEquipment() {
    if (!selectedItemId) return;
    const response = await fetch('/api/campaign/wagon/equipment', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: Number(selectedItemId) }),
    });
    if (!response.ok) onError(await readError(response));
    else {
      const result = await response.json() as CampaignWagonResponse;
      onChange(result.data);
      onToast('裝備已加入馬車；同名裝備會保留為獨立一件');
    }
  }

  async function updateDamage(item: WagonEquipmentInstance, damageMarkers: number) {
    setBusyId(item.id);
    const response = await fetch('/api/campaign/wagon/equipment/' + item.id, {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ damageMarkers: Math.max(0, damageMarkers), notes: item.notes }),
    });
    if (!response.ok) onError(await readError(response));
    else {
      const result = await response.json() as CampaignWagonResponse;
      onChange(result.data);
      onToast(item.name + '的損壞標記已更新');
    }
    setBusyId(null);
  }

  async function removeEquipment(item: WagonEquipmentInstance) {
    if (!window.confirm('移除「' + item.name + '・實體 #' + item.id + '」？')) return;
    setBusyId(item.id);
    const response = await fetch('/api/campaign/wagon/equipment/' + item.id, {
      method: 'DELETE', credentials: 'same-origin',
    });
    if (!response.ok) onError(await readError(response));
    else {
      const result = await response.json() as CampaignWagonResponse;
      onChange(result.data);
      onToast('已從馬車移除一件' + item.name);
    }
    setBusyId(null);
  }

  return <article className="wagon-panel equipment-inventory">
    <header><div><p className="eyebrow">EQUIPMENT INSTANCES</p><h2><PackageOpen size={20} />裝備庫存</h2></div><small>{equipment.length} 件實體裝備</small></header>
    <form className="equipment-search" onSubmit={searchItems}>
      <label><span>搜尋物品圖鑑</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="輸入名稱或編號" /></label>
      <button className="button" disabled={searching}>{searching ? '搜尋中…' : '搜尋'}</button>
      <label><span>搜尋結果</span><select value={selectedItemId} onChange={event => setSelectedItemId(event.target.value)} disabled={!results.length}>
        {!results.length && <option value="">尚未搜尋</option>}
        {results.map(item => <option value={item.id} key={item.id}>{item.cardNumber ? item.cardNumber + ' · ' : ''}{item.name}</option>)}
      </select></label>
      <button className="button" type="button" disabled={!selectedItemId} onClick={() => void addEquipment()}>加入一件</button>
    </form>
    <div className="equipment-list">
      {equipment.length === 0 && <p className="muted">馬車目前沒有裝備。搜尋圖鑑後可逐件加入。</p>}
      {equipment.map(item => <article key={item.id}>
        <div className="equipment-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" /> : <PackageOpen />}</div>
        <div className="equipment-name"><small>{item.cardNumber ?? item.code} · 實體 #{item.id}</small><strong>{item.name}</strong><span>{item.categoryName}</span></div>
        {item.damageable
          ? <button className={'damage-toggle ' + (item.damageMarkers === 1 ? 'damaged' : '')} disabled={busyId === item.id} aria-pressed={item.damageMarkers === 1} onClick={() => void updateDamage(item, item.damageMarkers === 1 ? 0 : 1)}>
            <small>鎧甲狀態</small><strong>{item.damageMarkers === 1 ? '損壞' : '完好'}</strong>
          </button>
          : <span className="no-damage"><small>損壞</small><strong>不適用</strong></span>}
        <button className="remove-equipment" disabled={busyId === item.id} onClick={() => void removeEquipment(item)}>移除</button>
      </article>)}
    </div>
  </article>;
}
