CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  blue TEXT NOT NULL,
  red TEXT,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS rooms_expires_idx ON rooms(expires);
