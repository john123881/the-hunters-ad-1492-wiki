-- 戰役共用語音播放紀錄。只在音訊真正開始播放後追加，不參與戰役版本鎖。
CREATE TABLE campaign_audio_playback_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_event_id TEXT NOT NULL,
  code TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('story','character','quest','quest_win','quest_loss','w_quest','w_quest_win','w_quest_loss')),
  title TEXT NOT NULL,
  player_number INTEGER NOT NULL CHECK (player_number BETWEEN 1 AND 4),
  player_alias TEXT NOT NULL,
  played_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, client_event_id)
);

CREATE INDEX idx_campaign_audio_playback_recent
  ON campaign_audio_playback_logs (campaign_id, id DESC);
