import { BookOpen, RotateCcw, SearchX } from 'lucide-react';

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="empty-state" role="alert">
    <BookOpen size={34} strokeWidth={1} />
    <h2>暫時無法翻開這份檔案</h2>
    <p>{message}</p>
    <button className="button" onClick={onRetry}><RotateCcw size={16} />重新讀取</button>
  </div>;
}

export function EmptyState({ onReset }: { onReset: () => void }) {
  return <div className="empty-state">
    <SearchX size={38} strokeWidth={1} />
    <h2>尚未找到這份檔案</h2>
    <p>試試其他名稱或物品編號，或清除篩選以瀏覽全部物品。</p>
    <button className="button" onClick={onReset}>清除搜尋與篩選</button>
  </div>;
}

export function CardSkeletons() {
  return <div className="card-grid" aria-label="正在載入物品" role="status">
    {Array.from({ length: 8 }, (_, index) => <div className="skeleton-card" key={index}>
      <div className="skeleton-art" /><div className="skeleton-line" /><div className="skeleton-line short" />
    </div>)}
    <span className="sr-only">正在載入物品</span>
  </div>;
}
