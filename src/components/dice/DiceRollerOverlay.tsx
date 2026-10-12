import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { attackDie, diceDefinitions } from '../../features/dice/definitions';
import type { DiceArenaStatus, DiceResult, DieDefinition } from '../../features/dice/types';
import { diceResultText, presentDiceResult, sortDiceResults } from '../../features/dice/diceRules';
import { useIsMobileProgress } from '../../lib/useMediaQuery';

const DiceArena3D = lazy(() =>
  import('./DiceArena3D').then(module => ({ default: module.DiceArena3D })),
);

interface DiceRollerOverlayProps {
  onClose: () => void;
}

interface DiceHistoryEntry {
  id: string;
  rolledAt: string;
  results: DiceResult[];
}

interface DiceCountControlProps {
  definition: DieDefinition;
  count: number;
  disabled: boolean;
  onChange: (count: number) => void;
}

const DICE_HISTORY_KEY = 'hunters-dice-history-v1';
const MAX_HISTORY_ENTRIES = 20;

function loadHistory(): DiceHistoryEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(DICE_HISTORY_KEY) ?? '[]');
    return Array.isArray(value) ? value.slice(0, MAX_HISTORY_ENTRIES) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: DiceHistoryEntry[]) {
  try {
    localStorage.setItem(DICE_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // 隱私模式或儲存空間不足時，骰盤仍可正常使用。
  }
}

function DiceCountControl({ definition, count, disabled, onChange }: DiceCountControlProps) {
  return <div className="dice-count-control" data-kind={definition.id} aria-label={`${definition.name}數量`}>
    <span><i style={{ background: definition.colorLight }} />{definition.name}<small>最多 {definition.maxCount} 顆</small></span>
    <div>
      <button type="button" onClick={() => onChange(Math.max(1, count - 1))} disabled={disabled || count <= 1} aria-label={`減少一顆${definition.name}`}><Minus /></button>
      <strong>{count}</strong>
      <button type="button" onClick={() => onChange(Math.min(definition.maxCount, count + 1))} disabled={disabled || count >= definition.maxCount} aria-label={`增加一顆${definition.name}`}><Plus /></button>
    </div>
  </div>;
}

export function DiceRollerOverlay({ onClose }: DiceRollerOverlayProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [selectedDieId, setSelectedDieId] = useState(attackDie.id);
  const [attackCount, setAttackCount] = useState(1);
  const [rollRequest, setRollRequest] = useState(0);
  const [status, setStatus] = useState<DiceArenaStatus>('loading');
  const [results, setResults] = useState<DiceResult[]>([]);
  const [arenaAttempt, setArenaAttempt] = useState(0);
  const [history, setHistory] = useState<DiceHistoryEntry[]>(loadHistory);
  const [mobileView, setMobileView] = useState<'roll' | 'history'>('roll');
  const isMobile = useIsMobileProgress();

  const selectedDefinition = diceDefinitions.find(definition => definition.id === selectedDieId) ?? attackDie;
  const selectedCount = selectedDefinition.id === attackDie.id ? attackCount : 1;
  const selectedDice = useMemo(
    () => Array.from({ length: selectedCount }, () => selectedDefinition),
    [selectedCount, selectedDefinition],
  );

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const roll = () => {
    setResults([]);
    setRollRequest(value => value + 1);
  };

  const receiveResults = (nextResults: DiceResult[]) => {
    const orderedResults = sortDiceResults(nextResults);
    setResults(orderedResults);
    if (!orderedResults.length) return;
    setHistory(current => {
      const next = [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        rolledAt: new Date().toISOString(),
        results: orderedResults,
      }, ...current].slice(0, MAX_HISTORY_ENTRIES);
      saveHistory(next);
      return next;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const selectDie = (dieId: string) => {
    setSelectedDieId(dieId);
    setResults([]);
  };

  const changeAttackCount = (count: number) => {
    setAttackCount(count);
    setResults([]);
  };

  const rollDisabled = !selectedDice.length || status === 'loading' || status === 'rolling' || status === 'error';
  const statusLabel = {
    loading: '正在載入 3D 骰盤…',
    ready: '骰盤已就緒',
    rolling: '骰子投擲中…',
    settled: '投擲完成',
    error: '無法啟動 3D 骰盤',
  }[status];

  return <div className="dice-overlay" role="dialog" aria-modal="true" aria-labelledby="dice-title">
    <button className="dice-overlay-backdrop" type="button" tabIndex={-1} aria-label="關閉骰盤" onClick={onClose} />
    <section ref={panelRef} className="dice-panel">
      <header className="dice-panel-header">
        <div>
          <p className="eyebrow">LOCAL PHYSICS · RAPIER</p>
          <h2 id="dice-title">獵人骰盤</h2>
          <p>攻擊、檢定與旅行骰 · 本機物理投擲</p>
        </div>
        <button ref={closeButtonRef} className="dice-icon-button" type="button" onClick={onClose} aria-label="關閉骰盤">
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="dice-panel-body">
        <div className="dice-arena">
          <Suspense fallback={null}>
            <DiceArena3D
              key={arenaAttempt}
              dice={selectedDice}
              rollRequest={rollRequest}
              onResults={receiveResults}
              onStatusChange={setStatus}
            />
          </Suspense>
          {status === 'loading' && <div className="dice-loading" role="status">
            <span aria-hidden="true" />
            <p>載入 3D 骰盤中…</p>
          </div>}
          <div className="dice-arena-status" data-status={status}>{statusLabel}</div>
          {status === 'settled' && results.length > 0 && <section className="dice-arena-results" aria-label="本次投擲結果">
            <span>結果</span>
            <ol>{results.map(result => {
              const presentation = presentDiceResult(result);
              return <li key={'arena-' + result.dieId} data-tone={presentation.tone} title={diceResultText(result)}>
                <strong>{presentation.primary}</strong>
                {presentation.outcome && <small>{presentation.outcome}</small>}
              </li>;
            })}</ol>
          </section>}
          {status === 'error' && <button className="dice-arena-retry" type="button" onClick={() => { setStatus('loading'); setArenaAttempt(value => value + 1); }}>重新載入</button>}
        </div>

        <aside className="dice-controls">
          {isMobile && <nav className="dice-mobile-tabs" aria-label="骰盤功能">
            <button type="button" className={mobileView === 'roll' ? 'active' : ''} onClick={() => setMobileView('roll')}>擲骰</button>
            <button type="button" className={mobileView === 'history' ? 'active' : ''} onClick={() => setMobileView('history')}>歷史 <span>{history.length}</span></button>
          </nav>}

          <div className="dice-roll-view" hidden={isMobile && mobileView !== 'roll'}>
            <div>
              <p className="eyebrow">DICE SET</p>
              <h3>選擇骰子種類</h3>
              <p className="dice-help">每次只投擲一種類型。攻擊骰可選 1～8 顆，其他骰固定 1 顆。</p>
            </div>

            <div className="dice-type-selector" role="group" aria-label="骰子種類">
              {diceDefinitions.map(definition => <button
                type="button"
                key={definition.id}
                className={selectedDefinition.id === definition.id ? 'active' : ''}
                aria-pressed={selectedDefinition.id === definition.id}
                aria-label={'選擇' + definition.name}
                onClick={() => selectDie(definition.id)}
                disabled={status === 'rolling'}
              >
                <i style={{ background: definition.colorLight }} />
                <span>{definition.name}</span>
              </button>)}
            </div>

            <div className="dice-selector-list">
              {selectedDefinition.id === attackDie.id
                ? <DiceCountControl definition={attackDie} count={attackCount} disabled={status === 'rolling'} onChange={changeAttackCount} />
                : <div className="dice-fixed-count">
                    <span><i style={{ background: selectedDefinition.colorLight }} />{selectedDefinition.name}</span>
                    <strong>1</strong>
                    <small>固定一顆</small>
                  </div>}
            </div>

            <button className="dice-roll-button dice-roll-button-main" type="button" onClick={roll} disabled={rollDisabled}>
              {status === 'rolling' ? <RotateCcw aria-hidden="true" /> : <Dices aria-hidden="true" />}
              {status === 'rolling' ? '投擲中…' : results.length ? `再次投擲 ${selectedDice.length} 顆` : `投擲 ${selectedDice.length} 顆骰子`}
            </button>

            <section className="dice-results" aria-labelledby="dice-results-title">
              <div>
                <p className="eyebrow">RESULT</p>
                <h3 id="dice-results-title">投擲結果</h3>
              </div>
              {results.length
                ? <ul>{results.map((result, index) => {
                    const presentation = presentDiceResult(result);
                    return <li key={result.dieId} data-tone={presentation.tone}>
                      <span>{result.dieName || `骰子 ${index + 1}`}</span>
                      <strong>{presentation.primary}{presentation.outcome && <small>{presentation.outcome}</small>}</strong>
                    </li>;
                  })}</ul>
                : <p className="dice-empty-result">投擲後會在這裡顯示每顆骰子的朝上面。</p>}
              <p className="sr-only" aria-live="polite">
                {status === 'settled' ? `投擲完成，結果為 ${results.map(result => `${result.dieName} ${diceResultText(result)}`).join('、')}` : statusLabel}
              </p>
            </section>
          </div>

          <section className="dice-history" hidden={isMobile && mobileView !== 'history'} aria-labelledby="dice-history-title">
            <div className="dice-history-heading">
              <div>
                <p className="eyebrow">HISTORY</p>
                <h3 id="dice-history-title">投擲歷史</h3>
              </div>
              <button type="button" onClick={clearHistory} disabled={!history.length}>清空歷史</button>
            </div>
            {history.length
              ? <ol>{history.map(entry => <li key={entry.id}>
                  <time dateTime={entry.rolledAt}>{new Date(entry.rolledAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</time>
                  <span>{entry.results.map(result => `${result.dieName ? `${result.dieName}：` : ''}${result.dieType ? diceResultText(result) : result.label}`).join('、')}</span>
                </li>)}</ol>
              : <p className="dice-empty-result">尚無投擲紀錄。最多保留最近 {MAX_HISTORY_ENTRIES} 次。</p>}
          </section>
        </aside>

        {isMobile && mobileView === 'roll' && <div className="dice-mobile-roll-dock">
          <span><strong>{selectedDefinition.name}</strong><small>{selectedCount} 顆</small></span>
          <button className="dice-roll-button" type="button" onClick={roll} disabled={rollDisabled}>
            {status === 'rolling' ? <RotateCcw aria-hidden="true" /> : <Dices aria-hidden="true" />}
            {status === 'rolling' ? '投擲中…' : results.length ? '再次投擲 ' + selectedCount + ' 顆' : '投擲 ' + selectedCount + ' 顆'}
          </button>
        </div>}
      </div>
    </section>
  </div>;
}
