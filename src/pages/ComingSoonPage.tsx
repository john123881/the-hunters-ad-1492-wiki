import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Construction, LockKeyhole } from 'lucide-react';

type ComingSoonPageProps = {
  title: string;
  eyebrow: string;
  description: string;
  requiresLogin?: boolean;
};

export function ComingSoonPage({ title, eyebrow, description, requiresLogin = false }: ComingSoonPageProps) {
  useEffect(() => { document.title = `${title}｜THE HUNTERS A.D. 1492 WIKI`; }, [title]);

  return <section className="coming-soon" aria-labelledby="coming-soon-title">
    <div className="coming-soon-mark" aria-hidden="true">
      {requiresLogin ? <LockKeyhole /> : <Construction />}
    </div>
    <p className="eyebrow">{eyebrow}</p>
    <h1 id="coming-soon-title">{title}</h1>
    <p>{description}</p>
    {requiresLogin && <p className="coming-soon-note">未來登入後才能使用戰役紀錄功能。</p>}
    <Link className="button" to="/">返回首頁</Link>
  </section>;
}