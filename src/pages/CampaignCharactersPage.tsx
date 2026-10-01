import { useEffect, useMemo, useState } from 'react';
import { BookOpen, FlaskConical, Image, Loader2, Minus, Plus, RefreshCw, Save, Shield, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { heroDefinitionBySlug, heroDefinitions } from '../../shared/heroesData';
import { heroBoardHotspots, type BoardPoint } from '../../shared/heroBoardHotspots';
import { VersionConflictPanel } from '../components/VersionConflictPanel';
import type { ApiErrorResponse, AuthSession, CampaignCharacter, CampaignCharactersResponse } from '../../shared/types';


const characterFieldLabels:Record<string,string>={
  heroSlug:'角色',customName:'角色名稱',moralePosition:'士氣位置',strengthLevel:'力量',
  knowledgeLevel:'知識',perceptionLevel:'洞察',agilityLevel:'敏捷',maxHealthLevel:'最大生命軌',
  currentHealth:'當前生命',xpTens:'經驗值十位',xpOnes:'經驗值個位',isPoisoned:'中毒狀態',notes:'角色備註',
};
function changedCharacterFields(before:CampaignCharacter|null,latest:CampaignCharacter){
  if(!before)return ['角色已由其他玩家建立'];
  const fields=Object.keys(characterFieldLabels).filter(key=>before[key as keyof CampaignCharacter]!==latest[key as keyof CampaignCharacter]);
  return fields.length?fields.map(key=>characterFieldLabels[key]):['角色版本'];
}

type Draft = Omit<CampaignCharacter, 'id' | 'playerNumber' | 'version'> & { version: number | null };
const emptyDraft = (heroSlug: string): Draft => ({
  heroSlug, customName: '', moralePosition: 0, strengthLevel: 0, knowledgeLevel: 0,
  perceptionLevel: 0, agilityLevel: 0, maxHealthLevel: 0, currentHealth: 1,
  xpTens: 0, xpOnes: 0, isPoisoned: false, notes: '', version: null,
});
const toDraft = (character: CampaignCharacter): Draft => ({ ...character, version: character.version });

function Stepper({ label, value, min, max, step = 1, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; disabled: boolean; onChange: (value: number) => void;
}) {
  return <div className="character-stepper">
    <span>{label}</span>
    <div><button type="button" disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label={label + '減少'}><Minus /></button>
      <strong>{value}</strong>
      <button type="button" disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label={label + '增加'}><Plus /></button></div>
  </div>;
}


function BoardMarker({ point, kind, label }: { point: BoardPoint; kind: 'square' | 'diamond'; label: string }) {
  return <span className={'character-board-marker ' + kind} style={{ left: point.x + '%', top: point.y + '%' }} aria-label={label}><span /></span>;
}

function BoardHighlights({ draft }: { draft: Draft }) {
  const layout = heroBoardHotspots[draft.heroSlug];
  if (!layout) return null;
  const markers: Array<{ point: BoardPoint | undefined; kind: 'square' | 'diamond'; label: string }> = [
    { point: layout.morale[draft.moralePosition + 2], kind: 'square', label: '士氣位置 ' + draft.moralePosition },
    { point: layout.strength[draft.strengthLevel], kind: 'diamond', label: '力量等級 ' + draft.strengthLevel },
    { point: layout.knowledge[draft.knowledgeLevel], kind: 'diamond', label: '知識等級 ' + draft.knowledgeLevel },
    { point: layout.perception[draft.perceptionLevel], kind: 'diamond', label: '洞察等級 ' + draft.perceptionLevel },
    { point: layout.agility[draft.agilityLevel], kind: 'diamond', label: '敏捷等級 ' + draft.agilityLevel },
    { point: layout.maxHealth[draft.maxHealthLevel], kind: 'diamond', label: '最大生命軌 ' + draft.maxHealthLevel },
    { point: draft.currentHealth > 0 ? layout.currentHealth[draft.currentHealth - 1] : undefined, kind: 'diamond', label: '當前生命 ' + draft.currentHealth },
  ];
  return <div className="character-board-highlights" aria-live="polite">
    {markers.map((marker, index) => marker.point && <BoardMarker key={index} {...marker} point={marker.point} />)}
  </div>;
}

export function CampaignCharactersPage({ session, loading }: { session: AuthSession | null; loading: boolean }) {
  const params = useParams();
  const requested = Number(params.playerNumber);
  const selectedNumber = Number.isInteger(requested) && requested >= 1 && requested <= 4 ? requested : session?.playerNumber ?? 1;
  const [characters, setCharacters] = useState<CampaignCharacter[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<'load' | 'save' | null>('load');
  const [message, setMessage] = useState('');
  const [modal, setModal] = useState<'story' | 'layout' | null>(null);
  const [choosingHero, setChoosingHero] = useState(false);
  const [boardImageLoaded, setBoardImageLoaded] = useState(false);
  const [versionConflict,setVersionConflict]=useState<{fields:string[];expectedVersion:number|null;currentVersion:number;latest:CampaignCharacter}|null>(null);

  useEffect(() => {
    if (!session) return;
    setBusy('load'); setMessage('');
    fetch('/api/campaign/characters', { credentials: 'same-origin' })
      .then(async response => {
        const payload = await response.json() as CampaignCharactersResponse | ApiErrorResponse;
        if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error.message : '角色資料載入失敗。');
        setCharacters(payload.data.characters);
      })
      .catch(error => setMessage(error instanceof Error ? error.message : '角色資料載入失敗。'))
      .finally(() => setBusy(null));
  }, [session]);

  const character = characters.find(entry => entry.playerNumber === selectedNumber) ?? null;
  useEffect(() => {
    if(versionConflict)return;
    setDraft(character ? toDraft(character) : null);
    setChoosingHero(false);
  }, [character?.id, character?.version, selectedNumber, versionConflict]);

  // 只有在英雄底圖更換時（例如切換角色或切換席位）才重設圖片載入狀態
  useEffect(() => {
    setBoardImageLoaded(false);
  }, [character?.heroSlug, selectedNumber]);
  const selectedPlayer = session?.players.find(player => player.playerNumber === selectedNumber);
  const isSelf = selectedNumber === session?.playerNumber;
  const canEdit = Boolean(selectedPlayer && session?.isActive);
  const hero = draft ? heroDefinitionBySlug[draft.heroSlug] : null;
  const usedHeroes = useMemo(() => new Set(characters.filter(item => item.playerNumber !== selectedNumber).map(item => item.heroSlug)), [characters, selectedNumber]);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => current ? { ...current, [key]: value } : current);

  async function save() {
    if (!draft || !session) return;
    setBusy('save'); setMessage('');
    try {
      const response = await fetch('/api/campaign/characters/' + selectedNumber, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, expectedVersion: draft.version }),
      });
      const payload = await response.json() as CampaignCharactersResponse | ApiErrorResponse;
      if(!response.ok&&'error' in payload&&payload.error.code==='CHARACTER_VERSION_CONFLICT'&&payload.error.conflict?.scope==='CHARACTER'){
        const latestCharacters=payload.error.conflict.latest as CampaignCharacter[];
        const latest=latestCharacters.find(entry=>entry.playerNumber===selectedNumber);
        if(latest){
          const base=characters.find(entry=>entry.playerNumber===selectedNumber)??null;
          setCharacters(latestCharacters);
          setDraft({...draft,version:latest.version});
          setVersionConflict({fields:changedCharacterFields(base,latest),expectedVersion:draft.version,currentVersion:latest.version,latest});
          setMessage('');
          return;
        }
      }
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error.message : '角色儲存失敗。');
      const savedCharacter = payload.data.characters.find(entry => entry.playerNumber === selectedNumber);
      if (savedCharacter) setDraft(toDraft(savedCharacter));
      setCharacters(payload.data.characters);
      setVersionConflict(null);
      setMessage('角色面板已儲存。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '角色儲存失敗。'); }
    finally { setBusy(null); }
  }

  if (loading) return <section className="campaign-gate"><p className="eyebrow">VERIFYING SESSION</p><h1>正在確認戰役憑證…</h1></section>;
  if (!session) return <section className="campaign-gate"><Shield aria-hidden="true" /><p className="eyebrow">CAMPAIGN ACCESS REQUIRED</p><h1>登入後查看角色</h1><Link className="button" to="/login" state={{ from: '/campaigns/characters' }}>登入戰役</Link></section>;

  return <section className="campaign-page campaign-characters-page" aria-labelledby="campaign-characters-title">
    <header className="campaign-module-heading">
      <div><p className="eyebrow">HUNTER RECORDS</p><h1 id="campaign-characters-title">角色面板</h1><p>保存獵人的面板位置；同戰役隊友可以協助修改。</p></div>
      <span><UserRound aria-hidden="true" />玩家 {session.playerNumber}</span>
    </header>
    <nav className="character-roster-tabs" aria-label="戰役角色">
      {[1,2,3,4].map(playerNumber => {
        const player = session.players.find(entry => entry.playerNumber === playerNumber);
        const entry = characters.find(item => item.playerNumber === playerNumber);
        return <Link className={playerNumber === selectedNumber ? 'active' : ''} to={'/campaigns/characters/' + playerNumber} key={playerNumber}>
          <span>{playerNumber}</span><strong>{player?.playerAlias ?? '從缺'}</strong><small>{entry ? heroDefinitionBySlug[entry.heroSlug]?.roleNameZhTw : playerNumber === session.playerNumber ? '你' : '未選角'}</small>
        </Link>;
      })}
    </nav>

    {versionConflict&&<VersionConflictPanel title="角色資料已被其他玩家更新" changedFields={versionConflict.fields} expectedVersion={versionConflict.expectedVersion} currentVersion={versionConflict.currentVersion} busy={busy==='save'} onReload={()=>{setDraft(toDraft(versionConflict.latest));setVersionConflict(null);setMessage('已載入最新角色資料。');}} onReapply={()=>void save()}/>}

    {message && <div className={message.includes('已儲存') ? 'character-notice success' : 'character-notice'} role="status">{message}</div>}
    {busy === 'load' ? <div className="character-loading">正在載入角色資料…</div>
      : !selectedPlayer ? <article className="character-preview-panel"><p className="eyebrow">EMPTY PLAYER SLOT</p><h2>玩家席位 {selectedNumber} 從缺</h2><p>此席位尚未加入戰役。</p></article>
      : (!draft || choosingHero) ? <article className="hero-picker">
        <div className="hero-picker-heading"><div><p className="eyebrow">{choosingHero ? 'CHANGE HUNTER' : 'CHOOSE HUNTER'}</p><h2>{choosingHero ? '更換 ' + selectedPlayer.playerAlias + ' 的角色' : '為 ' + selectedPlayer.playerAlias + ' 選擇獵人'}</h2><p>{choosingHero ? '選擇後會重設面板數值；按下儲存才會正式套用。' : '同戰役玩家皆可協助選角。'}</p></div>{choosingHero && <button className="button secondary" type="button" onClick={() => setChoosingHero(false)}>取消</button>}</div>
        <div className="hero-picker-grid">{heroDefinitions.map(option => {
          const used = usedHeroes.has(option.slug);
          const current = choosingHero && draft?.heroSlug === option.slug;
          return <button type="button" key={option.slug} disabled={used || current} onClick={() => {
            const next = emptyDraft(option.slug);
            setDraft({ ...next, version: draft?.version ?? null });
            setChoosingHero(false);
            setBoardImageLoaded(false);
            setMessage('已選擇新角色，尚未儲存。');
          }}>
            <img src={option.boardImageUrl} alt="" /><span><strong>{option.displayNameZhTw}</strong><small>{option.roleNameZhTw}{used ? ' · 已被選擇' : current ? ' · 目前角色' : ''}</small></span>
          </button>;
        })}</div>
      </article>
      : hero && <div className="character-workspace">
        <div className="character-board-stage">
          <img
            key={hero.boardImageUrl}
            ref={element => {
              if (element && element.complete && element.naturalWidth > 0 && !boardImageLoaded) {
                setBoardImageLoaded(true);
              }
            }}
            src={hero.boardImageUrl}
            alt={hero.displayNameZhTw + '角色面板'}
            onLoad={() => setBoardImageLoaded(true)}
            onError={() => setBoardImageLoaded(true)}
          />
          {!boardImageLoaded && (
            <div className="character-board-loading-overlay" aria-live="polite">
              <Loader2 className="spinning-icon" aria-hidden="true" />
              <span>載入角色面板中…</span>
            </div>
          )}
          {boardImageLoaded && <BoardHighlights draft={draft} />}
          {boardImageLoaded && (
            <div
              className="character-board-caption"
              style={{
                left: `${heroBoardHotspots[hero.slug]?.caption?.left ?? 20}%`,
                right: `${heroBoardHotspots[hero.slug]?.caption?.right ?? 8}%`,
                top: `${heroBoardHotspots[hero.slug]?.caption?.top ?? 3.5}%`,
              }}
            >
              <span>{hero.roleNameZhTw}</span>
              <h2>{draft.customName || hero.displayNameZhTw}</h2>
            </div>
          )}
        </div>
        <aside className="character-control-panel">
          <header><div><p className="eyebrow">{isSelf ? 'YOUR HUNTER' : 'TEAMMATE · CO-EDIT'}</p><h2>{selectedPlayer.playerAlias}</h2></div><span>版本 {draft.version ?? '新建'}</span></header>
          <div className="character-reference-actions">
            <button type="button" className="button secondary" onClick={() => setModal('story')}><BookOpen />角色故事</button>
            <button type="button" className="button secondary" onClick={() => setModal('layout')}><Image />初始面板</button>
            <button type="button" className="button secondary" disabled={!canEdit} onClick={() => setChoosingHero(true)}><RefreshCw />更換角色</button>
          </div>
          <label className="field"><span>角色名稱</span><input disabled={!canEdit} maxLength={40} value={draft.customName} placeholder={hero.displayNameZhTw} onChange={event => update('customName', event.target.value)} /></label>
          <section className="character-track-grid" aria-label="角色面板位置">
            <Stepper label="士氣位置" value={draft.moralePosition} min={-2} max={4} disabled={!canEdit} onChange={value => update('moralePosition', value)} />
            <Stepper label="經驗值 (XP)" value={draft.xpTens + draft.xpOnes} min={0} max={99} disabled={!canEdit} onChange={value => {
              update('xpTens', Math.floor(value / 10) * 10);
              update('xpOnes', value % 10);
            }} />
            <Stepper label="力量" value={draft.strengthLevel} min={0} max={4} disabled={!canEdit} onChange={value => update('strengthLevel', value)} />
            <Stepper label="知識" value={draft.knowledgeLevel} min={0} max={4} disabled={!canEdit} onChange={value => update('knowledgeLevel', value)} />
            <Stepper label="洞察" value={draft.perceptionLevel} min={0} max={4} disabled={!canEdit} onChange={value => update('perceptionLevel', value)} />
            <Stepper label="敏捷" value={draft.agilityLevel} min={0} max={4} disabled={!canEdit} onChange={value => update('agilityLevel', value)} />
            <Stepper label="最大生命軌" value={draft.maxHealthLevel} min={0} max={5} disabled={!canEdit} onChange={value => update('maxHealthLevel', value)} />
            <Stepper label="當前生命" value={draft.currentHealth} min={0} max={12} disabled={!canEdit} onChange={value => update('currentHealth', value)} />
          </section>
          <label className="character-poison"><input type="checkbox" disabled={!canEdit} checked={draft.isPoisoned} onChange={event => update('isPoisoned', event.target.checked)} /><FlaskConical />中毒狀態</label>
          <label className="field"><span>角色備註</span><textarea disabled={!canEdit} maxLength={2000} value={draft.notes} onChange={event => update('notes', event.target.value)} /></label>
          {canEdit && <div className="character-save-bar"><button className="button" type="button" disabled={busy === 'save'} onClick={save}><Save />{busy === 'save' ? '儲存中…' : '儲存角色面板'}</button></div>}
        </aside>
      </div>}

    {modal && hero && <div className="character-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setModal(null)}>
      <section className="character-modal" role="dialog" aria-modal="true" aria-labelledby="character-modal-title">
        <header><div><p className="eyebrow">{modal === 'story' ? 'CHARACTER STORY' : 'INITIAL LAYOUT'}</p><h2 id="character-modal-title">{hero.displayNameZhTw}</h2></div><button type="button" onClick={() => setModal(null)} aria-label="關閉">×</button></header>
        {modal === 'story' ? <p className="character-story">{hero.storyZhTw}</p> : <img src={hero.initialLayoutImageUrl} alt={hero.displayNameZhTw + '初始面板配置'} />}
      </section>
    </div>}
  </section>;
}
