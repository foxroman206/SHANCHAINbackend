// src/db.js  – SQLite database setup
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const DB_PATH = process.env.DB_PATH || './data/goodchain.db';
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  phone       TEXT UNIQUE,
  password    TEXT,
  provider    TEXT NOT NULL DEFAULT 'email',
  avatar      TEXT,
  role        TEXT NOT NULL DEFAULT 'user',
  points      INTEGER NOT NULL DEFAULT 0,
  level       INTEGER NOT NULL DEFAULT 1,
  is_elder    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  org           TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT NOT NULL,
  emoji         TEXT DEFAULT '🌟',
  goal          INTEGER NOT NULL,
  raised        INTEGER NOT NULL DEFAULT 0,
  donor_count   INTEGER NOT NULL DEFAULT 0,
  deadline      TEXT,
  ai_score      INTEGER NOT NULL DEFAULT 0,
  ai_desc       TEXT,
  is_religion   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  contract_addr TEXT,
  image_url     TEXT,
  milestones    TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS donations (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  project_id    TEXT NOT NULL REFERENCES projects(id),
  amount        INTEGER NOT NULL,
  method        TEXT NOT NULL,
  method_tab    TEXT NOT NULL DEFAULT 'fiat',
  is_anonymous  INTEGER NOT NULL DEFAULT 0,
  nft_minted    INTEGER NOT NULL DEFAULT 0,
  tx_hash       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  receipt_url   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dao_proposals (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'general',
  yes_votes     INTEGER NOT NULL DEFAULT 0,
  no_votes      INTEGER NOT NULL DEFAULT 0,
  total_voters  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  deadline      TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dao_votes (
  id          TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES dao_proposals(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  vote        TEXT NOT NULL,
  weight      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(proposal_id, user_id)
);

CREATE TABLE IF NOT EXISTS ai_alerts (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info',
  project_id  TEXT REFERENCES projects(id),
  resolved    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS badges (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  badge_key   TEXT NOT NULL,
  badge_name  TEXT NOT NULL,
  badge_emoji TEXT NOT NULL DEFAULT '🏅',
  earned_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, badge_key)
);

CREATE TABLE IF NOT EXISTS milestones (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  title         TEXT NOT NULL,
  target_amount INTEGER NOT NULL,
  completed     INTEGER NOT NULL DEFAULT 0,
  photo_url     TEXT,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_donations_project ON donations(project_id);
CREATE INDEX IF NOT EXISTS idx_donations_user ON donations(user_id);
CREATE INDEX IF NOT EXISTS idx_dao_votes_proposal ON dao_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON ai_alerts(severity, resolved);
`);

export default db;
