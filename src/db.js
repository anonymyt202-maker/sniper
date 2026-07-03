const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'userbot.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  manager_chat_id INTEGER PRIMARY KEY,   -- manager botdagi chat_id (foydalanuvchi)
  phone TEXT,
  session_string TEXT,                    -- GramJS StringSession
  is_logged_in INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS settings (
  manager_chat_id INTEGER PRIMARY KEY,
  auto_status INTEGER DEFAULT 0,
  auto_status_running INTEGER DEFAULT 0,
  profile_clock INTEGER DEFAULT 0,
  online_247 INTEGER DEFAULT 0,
  reply_mode INTEGER DEFAULT 0,
  typing_mode INTEGER DEFAULT 0,
  read_on_reply INTEGER DEFAULT 0,
  ai_provider TEXT DEFAULT 'chatgpt',      -- 'chatgpt' | 'grok' (ikkalasi ham groq orqali, faqat label)
  auto_reply_all INTEGER DEFAULT 0,
  auto_emoji_running INTEGER DEFAULT 0,    -- .emoji on/off - har bir chiquvchi xabarni avto-bezash
  auto_emoji_style TEXT DEFAULT 'random',  -- 'random' | '1'..'6'
  notify_edit INTEGER DEFAULT 0,           -- kimdir xabarini edit qilsa xabar berish
  notify_delete INTEGER DEFAULT 0,         -- kimdir xabarini o'chirsa xabar berish
  FOREIGN KEY (manager_chat_id) REFERENCES users(manager_chat_id)
);

CREATE TABLE IF NOT EXISTS auto_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_chat_id INTEGER,
  text TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_chat_id INTEGER,
  chat_id TEXT,
  items TEXT NOT NULL,   -- JSON array of {text, done}
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
`);

// Eski bazalarda yangi ustunlar bo'lmasligi mumkin (masalan .emoji on/off qo'shilishidan oldin yaratilgan baza)
const existingCols = db.prepare("PRAGMA table_info(settings)").all().map((c) => c.name);
if (!existingCols.includes('auto_emoji_running')) {
  db.exec("ALTER TABLE settings ADD COLUMN auto_emoji_running INTEGER DEFAULT 0");
}
if (!existingCols.includes('auto_emoji_style')) {
  db.exec("ALTER TABLE settings ADD COLUMN auto_emoji_style TEXT DEFAULT 'random'");
}
if (!existingCols.includes('notify_edit')) {
  db.exec("ALTER TABLE settings ADD COLUMN notify_edit INTEGER DEFAULT 0");
}
if (!existingCols.includes('notify_delete')) {
  db.exec("ALTER TABLE settings ADD COLUMN notify_delete INTEGER DEFAULT 0");
}

function ensureUser(managerChatId) {
  const row = db.prepare('SELECT * FROM users WHERE manager_chat_id = ?').get(managerChatId);
  if (!row) {
    db.prepare('INSERT INTO users (manager_chat_id) VALUES (?)').run(managerChatId);
    db.prepare('INSERT INTO settings (manager_chat_id) VALUES (?)').run(managerChatId);
  }
  const settingsRow = db.prepare('SELECT * FROM settings WHERE manager_chat_id = ?').get(managerChatId);
  if (!settingsRow) {
    db.prepare('INSERT INTO settings (manager_chat_id) VALUES (?)').run(managerChatId);
  }
  return db.prepare('SELECT * FROM users WHERE manager_chat_id = ?').get(managerChatId);
}

function getUser(managerChatId) {
  return db.prepare('SELECT * FROM users WHERE manager_chat_id = ?').get(managerChatId);
}

function saveSession(managerChatId, sessionString, phone) {
  db.prepare(
    'UPDATE users SET session_string = ?, phone = ?, is_logged_in = 1 WHERE manager_chat_id = ?'
  ).run(sessionString, phone, managerChatId);
}

function logout(managerChatId) {
  db.prepare(
    'UPDATE users SET session_string = NULL, is_logged_in = 0 WHERE manager_chat_id = ?'
  ).run(managerChatId);
}

function getAllLoggedInUsers() {
  return db.prepare('SELECT * FROM users WHERE is_logged_in = 1 AND session_string IS NOT NULL').all();
}

function getSettings(managerChatId) {
  ensureUser(managerChatId);
  return db.prepare('SELECT * FROM settings WHERE manager_chat_id = ?').get(managerChatId);
}

function updateSetting(managerChatId, field, value) {
  const allowed = [
    'auto_status', 'auto_status_running', 'profile_clock', 'online_247',
    'reply_mode', 'typing_mode', 'read_on_reply', 'ai_provider', 'auto_reply_all',
    'auto_emoji_running', 'auto_emoji_style', 'notify_edit', 'notify_delete',
  ];
  if (!allowed.includes(field)) throw new Error(`Noto'g'ri sozlama: ${field}`);
  db.prepare(`UPDATE settings SET ${field} = ? WHERE manager_chat_id = ?`).run(value, managerChatId);
}

function addAutoMessage(managerChatId, text) {
  db.prepare('INSERT INTO auto_messages (manager_chat_id, text) VALUES (?, ?)').run(managerChatId, text);
}

function listAutoMessages(managerChatId) {
  return db.prepare('SELECT * FROM auto_messages WHERE manager_chat_id = ? ORDER BY id').all(managerChatId);
}

function deleteAutoMessage(managerChatId, id) {
  db.prepare('DELETE FROM auto_messages WHERE manager_chat_id = ? AND id = ?').run(managerChatId, id);
}

module.exports = {
  db,
  ensureUser,
  getUser,
  saveSession,
  logout,
  getAllLoggedInUsers,
  getSettings,
  updateSetting,
  addAutoMessage,
  listAutoMessages,
  deleteAutoMessage,
};
