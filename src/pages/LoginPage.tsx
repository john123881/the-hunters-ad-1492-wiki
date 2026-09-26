import { FormEvent, useEffect, useState } from 'react';
import { KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { ApiErrorResponse, AuthSession, AuthSessionResponse } from '../../shared/types';

export function LoginPage({ session, onLogin }: { session: AuthSession | null; onLogin: (value: AuthSession) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [campaignId, setCampaignId] = useState('');
  const [password, setPassword] = useState('');
  const [playerNumber, setPlayerNumber] = useState('1');
  const [playerAlias, setPlayerAlias] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { document.title = '登入戰役｜THE HUNTERS A.D. 1492 WIKI'; }, []);
  if (session) return <Navigate to="/campaigns" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/campaign/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ campaignId, password, playerNumber: Number(playerNumber), playerAlias }),
      });
      const result = await response.json() as AuthSessionResponse | ApiErrorResponse;
      if (!response.ok || !('data' in result) || !result.data) throw new Error('error' in result ? result.error.message : '目前無法登入戰役。');
      onLogin(result.data);
      navigate((location.state as { from?: string } | null)?.from ?? '/campaigns', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '目前無法登入戰役。');
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="auth-page" aria-labelledby="login-title">
    <div className="auth-intro">
      <p className="eyebrow">CAMPAIGN ACCESS · PLAYER SESSION</p>
      <h1 id="login-title">進入你的戰役</h1>
      <p>輸入隊伍共用的戰役資料，選擇自己的玩家席位。瀏覽器會保留七天登入狀態。</p>
      <div className="auth-security-note"><ShieldCheck aria-hidden="true" /><span>認證憑證存放於 HttpOnly Cookie，頁面程式無法讀取。</span></div>
    </div>
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-form-mark" aria-hidden="true"><KeyRound /></div>
      <label>戰役 ID<input autoComplete="username" value={campaignId} onChange={event => setCampaignId(event.target.value)} placeholder="hunters-party-1" required minLength={3} maxLength={40} /></label>
      <label>戰役密碼<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} /></label>
      <div className="auth-form-row">
        <label>玩家席位<select value={playerNumber} onChange={event => setPlayerNumber(event.target.value)}>{[1, 2, 3, 4].map(number => <option key={number} value={number}>玩家 {number}</option>)}</select></label>
        <label>玩家暱稱<input autoComplete="nickname" value={playerAlias} onChange={event => setPlayerAlias(event.target.value)} placeholder="獵人暱稱" required maxLength={30} /></label>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-submit" disabled={submitting} type="submit"><LogIn size={16} />{submitting ? '驗證中…' : '進入戰役'}</button>
    </form>
  </section>;
}
