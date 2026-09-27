import { Shield, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { AuthSession } from '../../shared/types';

export function CampaignCharactersPage({ session, loading }: { session: AuthSession | null; loading: boolean }) {
  const params = useParams();
  if (loading) return <section className="campaign-gate"><p className="eyebrow">VERIFYING SESSION</p><h1>正在確認戰役憑證…</h1></section>;
  if (!session) return <section className="campaign-gate"><Shield aria-hidden="true" /><p className="eyebrow">CAMPAIGN ACCESS REQUIRED</p><h1>登入後查看角色</h1><Link className="button" to="/login" state={{ from: '/campaigns/characters' }}>登入戰役</Link></section>;

  const requested = Number(params.playerNumber);
  const selectedNumber = Number.isInteger(requested) && requested >= 1 && requested <= 4 ? requested : session.playerNumber;
  const selected = session.players.find(player => player.playerNumber === selectedNumber);
  const isSelf = selectedNumber === session.playerNumber;

  return <section className="campaign-page campaign-characters-page" aria-labelledby="campaign-characters-title">
    <header className="campaign-module-heading">
      <div><p className="eyebrow">HUNTER RECORDS</p><h1 id="campaign-characters-title">角色</h1><p>查看自己與隊友的角色紀錄；只有自己的角色可以修改。</p></div>
      <span><UserRound aria-hidden="true" />玩家 {session.playerNumber}</span>
    </header>
    <nav className="character-roster-tabs" aria-label="戰役角色">
      {[1, 2, 3, 4].map(playerNumber => {
        const player = session.players.find(entry => entry.playerNumber === playerNumber);
        return <Link className={playerNumber === selectedNumber ? 'active' : ''} to={'/campaigns/characters/' + playerNumber} key={playerNumber}>
          <span>{playerNumber}</span><strong>{player?.playerAlias ?? '從缺'}</strong>{playerNumber === session.playerNumber && <small>你</small>}
        </Link>;
      })}
    </nav>
    <article className="character-preview-panel">
      {selected ? <>
        <p className="eyebrow">{isSelf ? 'YOUR HUNTER' : 'TEAMMATE · READ ONLY'}</p>
        <h2>{selected.playerAlias}</h2>
        <p>{isSelf ? '角色面板會在這裡開放編輯。' : '可以查看這位隊友的角色資訊，但不能修改。'}</p>
      </> : <>
        <p className="eyebrow">EMPTY PLAYER SLOT</p>
        <h2>玩家席位 {selectedNumber} 從缺</h2>
        <p>此席位目前尚未建立角色。</p>
      </>}
    </article>
  </section>;
}

