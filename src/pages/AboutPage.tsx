import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowLeft, ArrowRight, BookOpen, Boxes, Database, Map, ShieldCheck, UsersRound } from 'lucide-react';
import { Emblem } from '../components/Emblem';

const features = [
  { icon: BookOpen, kicker: 'COMPENDIUM', title: '物品圖鑑', description: '依名稱、編號、分類、屬性與效果查找裝備，閱讀卡面轉錄、接口與合成資訊。' },
  { icon: UsersRound, kicker: 'HUNTER RECORDS', title: '角色與裝備面板', description: '記錄角色狀態，在共用裝備面板配置武器、防具、物品與附件。' },
  { icon: Boxes, kicker: 'WAGON', title: '馬車與共用庫存', description: '管理戰役天數、金錢、素材、工坊升級與每一件獨立裝備實體。' },
  { icon: Map, kicker: 'CAMPAIGN MAP', title: '戰役世界地圖', description: '追蹤地圖揭示、隊伍位置、卡片狀態、備註與劇情時間標記。' },
];

export function AboutPage() {
  useEffect(() => { document.title = '關於本站｜THE HUNTERS A.D. 1492 WIKI'; }, []);
  return <article className="about-page">
    <Link className="back-link" to="/items"><ArrowLeft size={16} />返回物品圖鑑</Link>
    <header className="about-hero">
      <div className="about-hero-mark" aria-hidden="true"><span className="about-orbit" /><Emblem className="about-emblem" /></div>
      <div className="about-hero-copy">
        <p className="eyebrow">THE HUNTERS A.D. 1492 WIKI</p>
        <h1>關於本站</h1>
        <p className="about-intro">為《The Hunters A.D. 1492》玩家整理的非官方繁體中文輔助工具，將散落在卡片、面板與規則中的資訊集中成可搜尋、可共同維護的戰役紀錄。</p>
        <div className="about-actions">
          <Link className="button" to="/items">瀏覽物品圖鑑<ArrowRight size={16} /></Link>
          <Link className="about-text-link" to="/campaigns">進入戰役紀錄<ArrowRight size={15} /></Link>
        </div>
      </div>
    </header>

    <section className="about-section" aria-labelledby="about-capabilities-title">
      <div className="about-section-heading">
        <div><p className="eyebrow">CURRENT FEATURES</p><h2 id="about-capabilities-title">目前可以做什麼</h2></div>
        <p>從查找卡片到多人共同記錄，讓桌面上的資訊保持清楚。</p>
      </div>
      <div className="about-feature-grid">
        {features.map(({ icon: Icon, kicker, title, description }) => <article className="about-feature-card" key={title}>
          <div className="about-feature-icon"><Icon aria-hidden="true" /></div><p>{kicker}</p><h3>{title}</h3><span>{description}</span>
        </article>)}
      </div>
    </section>

    <section className="about-section" aria-labelledby="about-principles-title">
      <div className="about-section-heading"><div><p className="eyebrow">DATA &amp; TRUST</p><h2 id="about-principles-title">資料與使用原則</h2></div></div>
      <div className="about-principle-grid">
        <article><Database aria-hidden="true" /><div><h3>資料來源透明</h3><p>物品資料由專案資料集整理並保留來源欄位，前端一律透過 Hono API 查詢 D1，不另藏一份固定資料。</p></div></article>
        <article><ShieldCheck aria-hidden="true" /><div><h3>非官方規則翻譯</h3><p>本站內容供玩家查找與記錄，不代表官方中文規則；遇到規則差異時，仍以遊戲原文與官方規則書為準。</p></div></article>
        <article><Archive aria-hidden="true" /><div><h3>戰役資料可備份</h3><p>管理者可匯出單一戰役資料並在需要時還原；多人修改則使用版本檢查，降低互相覆蓋紀錄的風險。</p></div></article>
      </div>
    </section>

    <aside className="about-callout">
      <div><p className="eyebrow">READY FOR THE HUNT</p><h2>從下一場戰役開始使用</h2><p>查資料不需登入；角色、地圖與馬車紀錄需使用所屬戰役帳號進入。</p></div>
      <Link className="button" to="/campaigns">前往戰役入口<ArrowRight size={16} /></Link>
    </aside>
  </article>;
}
