import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowUpRight, LogIn } from 'lucide-react';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { DetailPage } from './pages/DetailPage';
import { AboutPage } from './pages/AboutPage';
import { ComingSoonPage } from './pages/ComingSoonPage';

export function App() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);

  return <>
    <a className="skip-link" href="#main-content">跳至主要內容</a>
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand" aria-label="The Hunters A.D. 1492 Wiki 首頁">
          <span className="brand-type">THE HUNTERS<small>A.D. 1492 WIKI</small></span>
        </Link>
        <nav className="main-nav" aria-label="主要導覽">
          <NavLink to="/items">物品圖鑑</NavLink>
          <NavLink to="/crafting">物件合成表</NavLink>
          <NavLink to="/campaigns">戰役紀錄</NavLink>
        </nav>
        <NavLink to="/login" className="login-link"><LogIn size={15} />登入</NavLink>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="page-shell">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/items" element={<CatalogPage />} />
        <Route path="/items/:slug" element={<DetailPage />} />
        <Route path="/crafting" element={<ComingSoonPage title="物件合成表" eyebrow="CRAFTING · IN DEVELOPMENT" description="合成配方與素材查詢功能正在規劃中。" />} />
        <Route path="/campaigns" element={<ComingSoonPage title="戰役紀錄" eyebrow="CAMPAIGN LOG · IN DEVELOPMENT" description="戰役進度與紀錄功能尚未開放。" requiresLogin />} />
        <Route path="/login" element={<ComingSoonPage title="登入" eyebrow="ACCOUNT ACCESS · IN DEVELOPMENT" description="登入功能尚未開放。" />} />
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