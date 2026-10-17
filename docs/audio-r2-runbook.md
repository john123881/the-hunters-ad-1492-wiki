# R2 語音正式媒體操作手冊

## 固定設定

- Bucket：`the-hunters-ad-1492-audio`
- Worker binding：`AUDIO`
- 媒體入口：`/media/audio/`
- 來源：`data/audio/`
- 物件數：722
- 目前來源容量：1,121,144,376 bytes

Bucket 維持私有，瀏覽器透過同站 Worker 路由讀取。路由支援 `HEAD`、HTTP Range、ETag 與 `Cache-Control: public, max-age=31536000, immutable`。

## 首次建立

Wrangler 使用的 `CLOUDFLARE_API_TOKEN` 必須具備 Account → Workers R2 Storage → Edit／Write。

```bash
npx wrangler r2 bucket create the-hunters-ad-1492-audio --location apac --update-config --binding AUDIO
npx wrangler r2 bucket list
```

`--update-config` 會在 `wrangler.jsonc` 加入 `AUDIO` binding。不要把 R2 bucket 設為公開。

## 產生與預覽

```bash
npm run audio:manifest
npm run audio:r2:sync
```

同步指令預設只列出 bucket、物件數與容量，不會上傳。

## 正式上傳

先用一個檔案確認權限與 bucket：

```bash
npm run audio:r2:sync -- --upload --limit=1
```

確認成功後上傳全部檔案：

```bash
npm run audio:r2:sync -- --upload --concurrency=4
```

每個 MP3 都會寫入 `Content-Type: audio/mpeg` 與一年 immutable 快取。檔名包含內容雜湊，因此可安全長期快取。

## 正式 manifest 與部署

```bash
npm run audio:manifest:prod
npm run build
npx wrangler d1 migrations apply hunters-db --remote
npx wrangler deploy
```

正式 manifest 的 `mediaBaseUrl` 必須是 `/media/audio/`。部署會同時套用播放紀錄的 `0027` migration；不需重新匯入物品 seed。

## 自動驗收

```bash
npm run audio:r2:verify -- https://the-hunters-ad-1492.boardgame-wiki.workers.dev/media/audio/
```

工具會抽查八個代表代碼，確認：

- `HEAD` 成功。
- `Content-Type` 是音訊。
- 快取包含 `immutable`。
- `Range: bytes=0-31` 回傳 `206` 與正確 `Content-Range`。

## 瀏覽器驗收

1. 開啟正式站並按「語音播放」。
2. 依序測試 `Q1`、`V1`、`L1`、`W2`、`VW1`、`LW2`、`F001`、`37.22`。
3. 確認載入後可播放、暫停、拖曳進度及重新播放。
4. 播放中切換到物品圖鑑或戰役頁，聲音不能中斷。
5. 用手機確認播放器沒有水平溢出，鍵盤開啟時仍看得到輸入及播放按鈕。
6. 登入同一戰役的兩個瀏覽器；其中一方成功播放後，另一方展開播放器並重新整理紀錄，應看到相同代碼、玩家與時間。
7. 輸入不存在的代碼，必須顯示錯誤且不能新增共用紀錄。

## 回復開發 manifest

若正式 R2 尚未就緒，不要部署指向 `/media/audio/` 的 manifest。可用以下指令回復不含正式媒體網址的開發版本：

```bash
npm run audio:manifest
```
