import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowUpRight, LogIn, LogOut, UserRound } from 'lucide-react';
import type { AuthSession, AuthSessionResponse } from '../shared/types';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { DetailPage } from './pages/DetailPage';
import { AboutPage } from './pages/AboutPage';
import { LoginPage } from './pages/LoginPage';
import { CampaignPage } from './pages/CampaignPage';
import { CampaignMapPage } from './pages/CampaignMapPage';
import { CampaignCharactersPage } from './pages/CampaignCharactersPage';
import { CampaignTabs } from './components/CampaignTabs';

export function App() {
  const location = useLocation();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(response => response.ok ? response.json() as Promise<AuthSessionResponse> : Promise.reject())
      .then(result => setSession(result.data))
      .catch(() => setSession(null))
      .finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); }
    finally { setSession(null); }
  }

  return <>
    <a className="skip-link" href="#main-content">跳至主要內容</a>
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand" aria-label="The Hunters A.D. 1492 Wiki 首頁">
          <span className="brand-type">THE HUNTERS<small>A.D. 1492 WIKI</small></span>
        </Link>
        <nav className="main-nav" aria-label="主要導覽">
          <NavLink to="/items">物品圖鑑</NavLink>
          <NavLink to="/campaigns">戰役紀錄</NavLink>
        </nav>
        {session
          ? <details className="player-menu" onToggle={event => {
              if (!event.currentTarget.open) return;
              void fetch('/api/auth/session', { credentials: 'same-origin' })
                .then(response => response.ok ? response.json() as Promise<AuthSessionResponse> : Promise.reject())
                .then(result => setSession(result.data))
                .catch(() => undefined);
            }}>
              <summary className="login-link"><UserRound size={15} />{session.playerAlias} · {session.playerNumber}</summary>
              <div className="player-roster" aria-label="戰役隊友名單">
                <p>戰役隊友</p>
                <ol>
                  {[1, 2, 3, 4].map(playerNumber => {
                    const player = session.players.find(entry => entry.playerNumber === playerNumber);
                    return <li className={playerNumber === session.playerNumber ? 'current' : ''} key={playerNumber}>
                      <span>{playerNumber}</span>
                      <strong>{player?.playerAlias ?? '從缺'}</strong>
                      {playerNumber === session.playerNumber && <small>你</small>}
                    </li>;
                  })}
                </ol>
                <div className="player-roster-actions">
                  <Link to="/campaigns/wagon">進入戰役面板</Link>
                  <button type="button" onClick={async () => { await logout(); window.location.assign('/login'); }}><LogOut size={13} />登出</button>
                </div>
              </div>
            </details>
          : <NavLink to="/login" className="login-link"><LogIn size={15} />登入</NavLink>}
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="page-shell">
      {session && location.pathname.startsWith('/campaigns') && <CampaignTabs />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/items" element={<CatalogPage />} />
        <Route path="/items/:slug" element={<DetailPage />} />
        <Route path="/crafting" element={<Navigate to="/items" replace />} />
        <Route path="/campaigns" element={<Navigate to="/campaigns/wagon" replace />} />
        <Route path="/campaigns/wagon" element={<CampaignPage session={session} loading={sessionLoading} onLogout={logout} />} />
        <Route path="/campaigns/map" element={<CampaignMapPage session={session} loading={sessionLoading} />} />
        <Route path="/campaigns/characters" element={<CampaignCharactersPage session={session} loading={sessionLoading} />} />
        <Route path="/campaigns/characters/:playerNumber" element={<CampaignCharactersPage session={session} loading={sessionLoading} />} />
        <Route path="/login" element={<LoginPage session={session} onLogin={setSession} />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<div className="empty-state"><p className="eyebrow">404 · LOST IN THE MIST</p><h1>你走進了迷霧</h1><p>此頁不存在，讓我們回到熟悉的路上。</p><Link className="button" to="/">返回首頁</Link></div>} />
      </Routes>
    </main>
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand"><span>THE HUNTERS <small>A.D. 1492 WIKI</small></span></div>
        <p>UNOFFICIAL COMMUNITY ARCHIVE</p>
        <Link to="/about">資料與版本說明 <ArrowUpRight size={13} /></Link>
      </div>
    </footer>
  </>;
}

