import { FormEvent, useEffect, useState } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { AdminSession, AdminSessionResponse, ApiErrorResponse } from '../../shared/types';

export function AdminLoginPage() {
  const navigate=useNavigate();
  const [session,setSession]=useState<AdminSession|null|undefined>(undefined);
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  useEffect(()=>{document.title='管理者登入｜THE HUNTERS';fetch('/api/admin/auth/session',{credentials:'same-origin'}).then(r=>r.json() as Promise<AdminSessionResponse>).then(r=>setSession(r.data)).catch(()=>setSession(null));},[]);
  if(session)return <Navigate to="/admin" replace/>;
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setSubmitting(true);setError('');
    try{
      const response=await fetch('/api/admin/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({username,password})});
      const result=await response.json() as AdminSessionResponse|ApiErrorResponse;
      if(!response.ok||!('data' in result)||!result.data)throw new Error('error' in result?result.error.message:'目前無法登入管理頁。');
      navigate('/admin',{replace:true});
    }catch(reason){setError(reason instanceof Error?reason.message:'目前無法登入管理頁。');}
    finally{setSubmitting(false);}
  }
  return <section className="admin-auth-page">
    <div className="admin-auth-copy"><p className="eyebrow">ARCHIVE CONTROL · RESTRICTED</p><h1>管理者入口</h1><p>管理帳號與玩家戰役完全分離。第一階段僅提供戰役健康狀態與使用情況總覽。</p><div><ShieldCheck/><span>八小時 Session、HttpOnly Cookie、登入節流</span></div></div>
    <form className="admin-auth-form" onSubmit={submit}><span className="admin-lock"><LockKeyhole/></span>
      <label>管理者帳號<input autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)} required minLength={3} maxLength={40}/></label>
      <label>密碼<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required minLength={12} maxLength={128}/></label>
      {error&&<p className="auth-error" role="alert">{error}</p>}
      <button className="auth-submit" disabled={submitting||session===undefined} type="submit"><KeyRound/>{submitting?'驗證中…':'進入管理台'}</button>
    </form>
  </section>;
}
