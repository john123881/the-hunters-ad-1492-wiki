-- 玩家戰役登入基礎：戰役、席位、可撤銷工作階段與登入節流。
PRAGMA foreign_keys = ON;

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  campaign_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 1 AND 4),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX idx_campaigns_active ON campaigns(is_active) WHERE deleted_at IS NULL;

CREATE TABLE campaign_players (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  player_number INTEGER NOT NULL CHECK (player_number BETWEEN 1 AND 4),
  player_alias TEXT NOT NULL,
  is_ready INTEGER NOT NULL DEFAULT 1 CHECK (is_ready IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, player_number)
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  player_number INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id, player_number)
    REFERENCES campaign_players(campaign_id, player_number) ON DELETE CASCADE
);

CREATE INDEX idx_auth_sessions_player ON auth_sessions(campaign_id, player_number);
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE auth_login_attempts (
  campaign_id TEXT NOT NULL,
  client_key TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL,
  locked_until INTEGER,
  PRIMARY KEY (campaign_id, client_key)
);

PRAGMA optimize;
