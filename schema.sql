-- GFC (Global Fighting Championship) — D1 schema
-- Build the tables in your own Cloudflare account with:
--   npx wrangler d1 execute gfc-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS fighters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mc_username TEXT NOT NULL UNIQUE,     -- Minecraft name; avatar built from this
  display_name TEXT NOT NULL,
  description TEXT,
  division TEXT,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fighter1_id INTEGER NOT NULL REFERENCES fighters(id),
  fighter2_id INTEGER NOT NULL REFERENCES fighters(id),
  winner_id INTEGER REFERENCES fighters(id),   -- NULL = draw / no contest
  event TEXT,
  fight_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS champions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fighter_id INTEGER NOT NULL REFERENCES fighters(id),
  title TEXT NOT NULL,             -- belt / division name
  won_date TEXT,
  lost_date TEXT,                  -- NULL = current champion
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'premium',
  price INTEGER NOT NULL,
  memo TEXT NOT NULL UNIQUE,       -- 32-char memo for /pay verification
  buyer_mc_username TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_fights_f1 ON fights(fighter1_id);
CREATE INDEX IF NOT EXISTS idx_fights_f2 ON fights(fighter2_id);
CREATE INDEX IF NOT EXISTS idx_champions_fighter ON champions(fighter_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_news_published ON news(published_at);

-- Optional: a few sample rows so the site isn't empty on first load.
INSERT INTO fighters (mc_username, display_name, description, division) VALUES
  ('Technoblade', 'The Blade', 'Aggressive crystal PvP specialist.', 'Heavyweight'),
  ('Dream', 'Dreamer', 'Movement-heavy counter fighter.', 'Heavyweight'),
  ('Tommyinnit', 'Big T', 'Unpredictable brawler.', 'Lightweight');
INSERT INTO fights (fighter1_id, fighter2_id, winner_id, event, fight_date) VALUES
  (1, 2, 1, 'GFC 1: Genesis', '2026-06-25');
UPDATE fighters SET wins = wins + 1 WHERE id = 1;
UPDATE fighters SET losses = losses + 1 WHERE id = 2;
INSERT INTO champions (fighter_id, title, won_date) VALUES (1, 'Heavyweight', '2026-06-25');
INSERT INTO news (title, body, author) VALUES
  ('GFC 1 in the books', 'The Blade takes the inaugural Heavyweight belt.', 'GFC Staff');
