import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Emblem } from '../components/Emblem';

export function AboutPage() {
  useEffect(() => { document.title = '資料來源說明｜THE HUNTERS A.D. 1492 WIKI'; }, []);
  return <article className="about-page">
    <Link className="back-link" to="/items"><ArrowLeft size={16} />返回物品圖鑑</Link>
    <Emblem className="about-emblem" /><p className="eyebrow">THE HUNTERS A.D. 1492 WIKI</p><h1>關於這份圖鑑</h1>
    <section><h2>資料來自你整理的物品檔案</h2><p>目前收錄 <code>data/equipment_page1.json</code> 與 <code>data/equipment_page2.json</code> 的 25 件武器與武器附件，包含名稱、索引、面板、效果、接口與圖片路徑。網站透過 Hono API 查詢 D1，不在前端保存另一份物品陣列。</p><p>這批內容是預先整理的參考資料，本站不將它宣稱為官方中文規則。每件物品保留來源欄位，內容仍應以原始遊戲資料與規則書為準。</p></section>
    <section><h2>如何使用</h2><p>可依物品名稱、索引編號或效果文字搜尋，並用格數、攻擊模式、屬性、效果與接口縮小範圍。</p><p>點選物品可閱讀面板、資料轉錄與來源說明。搜尋、篩選與頁碼會保留在網址中，方便分享與返回。</p></section>
    <section><h2>這一階段的範圍</h2><p>目前可使用物品圖鑑。物件合成表、戰役紀錄與登入仍在規劃中，其中戰役紀錄未來需登入才能使用。角色行動卡、隊伍與角色狀態等功能將在需求確定後再開發。</p></section>
  </article>;
}
