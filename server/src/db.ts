import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// The server stores only what it must to route messages: account public keys,
// group membership, invite codes, and *encrypted* envelopes waiting for
// delivery. It never stores chats with Harry or profile data.
const path = process.env.HARRY_DB ?? "./data/harry.db";
mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  alias TEXT NOT NULL,
  box_pk TEXT NOT NULL,
  sign_pk TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  uses_left INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  sender_id TEXT,              -- NULL for anonymous circle questions
  kind TEXT NOT NULL,          -- chat | circle_question | circle_reply | system
  question_id TEXT,
  envelope TEXT NOT NULL,      -- ciphertext; the server cannot read it
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS inbox_recipient ON inbox(recipient_id, id);
CREATE TABLE IF NOT EXISTS circle_questions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  asker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
`);

// Undelivered envelopes expire after 30 days, circle question routing after 14.
export function sweep() {
  const now = Date.now();
  db.prepare("DELETE FROM inbox WHERE created_at < ?").run(now - 30 * 864e5);
  db.prepare("DELETE FROM circle_questions WHERE created_at < ?").run(now - 14 * 864e5);
  db.prepare("DELETE FROM invites WHERE expires_at < ? OR uses_left <= 0").run(now);
}
