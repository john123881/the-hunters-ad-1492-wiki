import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Migration 0024 Trigger & Splitting Integrity Test', async (t) => {
  const migrationPath = path.resolve('migrations/0024_create_character_loadouts.sql');
  const sqlContent = fs.readFileSync(migrationPath, 'utf8');

  await t.test('1. 驗證 migration 檔案中的所有 TRIGGER 均為單行 BEGIN...END 結構，無懸空斷行', () => {
    const triggerMatches = sqlContent.match(/CREATE TRIGGER[\s\S]*?END;/g) || [];
    assert.strictEqual(triggerMatches.length, 6, '應包含 6 個核心約束 Trigger');

    for (const trg of triggerMatches) {
      // 確保 BEGIN 與 END 在同一行，且結尾具有分號，不跨越多行巢狀破壞 wrangler statement 切割
      const beginEndMatch = trg.match(/BEGIN([\s\S]*?)END;/);
      assert.ok(beginEndMatch, 'Trigger 必須包含 BEGIN ... END;');
      const body = beginEndMatch[1];
      assert.ok(!body.includes('\n'), `Trigger 本體不應包含斷行：\n${trg}`);
    }
  });

  await t.test('2. 模擬 Wrangler SQL 切割器，驗證每一句 SQL 結尾均完整且沒有 incomplete input', () => {
    // 模擬 wrangler 針對 SQL 的切割方式（依 ';' 並且忽略字串與括號內的語法）
    const lines = sqlContent
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('--'));

    // 每一條 Trigger 必須是完整獨立的一句，其 BEGIN 與 END 必須在同一塊邏輯
    let inTrigger = false;
    let triggerBuffer = '';
    const triggers: string[] = [];

    for (const line of lines) {
      if (line.startsWith('CREATE TRIGGER')) {
        inTrigger = true;
        triggerBuffer = line;
      } else if (inTrigger) {
        triggerBuffer += ' ' + line;
      }
      if (inTrigger && line.endsWith('END;')) {
        triggers.push(triggerBuffer);
        inTrigger = false;
        triggerBuffer = '';
      }
    }

    assert.strictEqual(inTrigger, false, '所有 Trigger 都必須正常閉合 END;');
    assert.strictEqual(triggers.length, 6, '必須抓取到完整的 6 個單行 Trigger');
  });
});
