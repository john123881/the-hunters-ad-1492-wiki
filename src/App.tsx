import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { CatalogPage } from './pages/CatalogPage';
import { DetailPage } from './pages/DetailPage';
import { AboutPage } from './pages/AboutPage';

export function App() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);
  return <>
    <a className="skip-link" href="#main-content">跳至主要內容</a>
    <header className="site-header"><div className="header-inner">
      <Link to="/" className="brand" aria-label="The Hunters A.D. 1492 Wiki 首頁"><span className="brand-type">THE HUNTERS<small>A.D. 1492 WIKI</small></span></Link>
      <nav className="main-nav" aria-label="主要導覽"><NavLink to="/" end>物品圖鑑</NavLink><NavLink to="/about">資料說明</NavLink></nav>
      <span className="header-edition">繁體中文 <span> / </span> VOL. 01</span>
    </div></header>
    <main id="main-content" tabIndex={-1} className="page-shell"><Routes>
      <Route path="/" element={<CatalogPage />} /><Route path="/items/:slug" element={<DetailPage />} /><Route path="/about" element={<AboutPage />} />
      <Route path="*" element={<div className="empty-state"><p className="eyebrow">404 · LOST IN THE MIST</p><h1>你走進了迷霧</h1><p>此頁不存在，讓我們回到熟悉的路上。</p><Link className="button" to="/">返回檔案館</Link></div>} />
    </Routes></main>
    <footer className="site-footer"><div className="footer-inner"><div className="footer-brand"><span>THE HUNTERS <small>A.D. 1492 WIKI</small></span></div><p>UNOFFICIAL ITEM COMPENDIUM</p><Link to="/about">資料與版本說明 <ArrowUpRight size={13} /></Link></div></footer>
  </>;
}
