const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
  is_premium INTEGER DEFAULT 0,
  premium_until INTEGER DEFAULT 0,        -- unix timestamp, 0 = premium emas
  is_banned INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
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

-- Premium tariflar: narxi Stars (XTR) da. Admin panel orqali tahrirlanadi.
CREATE TABLE IF NOT EXISTS premium_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,        -- '1day' | '1week' | '1month' | '3month'
  label TEXT NOT NULL,              -- "1 kunlik"
  days INTEGER NOT NULL,
  price_stars INTEGER NOT NULL,     -- asosiy narx (XTR)
  discount_percent INTEGER DEFAULT 0, -- aksiya %
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_chat_id INTEGER,
  plan_code TEXT,
  amount_stars INTEGER,
  telegram_payment_charge_id TEXT,
  status TEXT DEFAULT 'paid',       -- 'paid' | 'refunded'
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Kunlik limit hisoblagichlari (free foydalanuvchilar uchun): .ai, .img va h.k.
CREATE TABLE IF NOT EXISTS usage_daily (
  manager_chat_id INTEGER,
  feature TEXT,             -- 'img' | 'ai' ...
  day TEXT,                 -- 'YYYY-MM-DD'
  count INTEGER DEFAULT 0,
  PRIMARY KEY (manager_chat_id, feature, day)
);

-- Bot-darajasidagi konfiguratsiya (limitlar, reklama matni va h.k.) - key/value
CREATE TABLE IF NOT EXISTS bot_config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- .post orqali yaratilgan xabarlar - secret token bilan istalgan chatda chaqiriladi
CREATE TABLE IF NOT EXISTS posts (
  token TEXT PRIMARY KEY,
  owner_chat_id INTEGER,
  text TEXT NOT NULL,
  button_label TEXT,
  button_url TEXT,
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

const existingUserCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
const userColDefs = {
  is_premium: 'INTEGER DEFAULT 0',
  premium_until: 'INTEGER DEFAULT 0',
  is_banned: 'INTEGER DEFAULT 0',
  is_admin: 'INTEGER DEFAULT 0',
};
for (const [col, def] of Object.entries(userColDefs)) {
  if (!existingUserCols.includes(col)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
  }
}

// Default premium tariflar (birinchi marta ishga tushganda)
const planCount = db.prepare('SELECT COUNT(*) as c FROM premium_plans').get().c;
if (planCount === 0) {
  const insertPlan = db.prepare(
    'INSERT INTO premium_plans (code, label, days, price_stars, discount_percent, is_active) VALUES (?, ?, ?, ?, ?, 1)'
  );
  insertPlan.run('1day', "1 kunlik", 1, 30, 0);
  insertPlan.run('1week', "1 haftalik", 7, 150, 0);
  insertPlan.run('1month', "1 oylik", 30, 500, 10);
  insertPlan.run('3month', "3 oylik", 90, 1300, 20);
}

// Default bot config (limitlar, reklama)
const defaultConfig = {
  free_img_limit_daily: '1',
  premium_img_limit_daily: '5',
  free_ai_limit_daily: '20',
  ads_enabled_for_free: '1',
  ads_text: "🤖 @{bot_username} orqali yuborildi",
  stars_to_uzs_rate: '150', // 1 Stars = 150 so'm (faqat ko'rsatish uchun, karta to'lovda qo'lda tasdiqlanadi)
  admin_ids: '', // vergul bilan ajratilgan manager_chat_id lar
  help_text: '', // bo'sh bo'lsa default HELP_TEXT ishlatiladi (admin panel orqali tahrirlanadi)
  settings_text: '', // bo'sh bo'lsa default matn ishlatiladi
  bot_username: '', // .soat va reklama matnlarida ishlatiladi (masalan "aisuxbat_bot")
};
const setConfigIfMissing = db.prepare('INSERT OR IGNORE INTO bot_config (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaultConfig)) {
  setConfigIfMissing.run(k, v);
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

// ---------- Bot config (key/value) ----------
function getConfig(key) {
  const row = db.prepare('SELECT value FROM bot_config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare('INSERT INTO bot_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

function getAllConfig() {
  const rows = db.prepare('SELECT key, value FROM bot_config').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

// ---------- Admin ----------
function isAdmin(managerChatId) {
  const user = getUser(managerChatId);
  if (user?.is_admin) return true;
  const adminIds = (getConfig('admin_ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(String(managerChatId));
}

function setAdmin(managerChatId, value) {
  ensureUser(managerChatId);
  db.prepare('UPDATE users SET is_admin = ? WHERE manager_chat_id = ?').run(value ? 1 : 0, managerChatId);
}

function setBanned(managerChatId, value) {
  db.prepare('UPDATE users SET is_banned = ? WHERE manager_chat_id = ?').run(value ? 1 : 0, managerChatId);
}

function getAllUsers() {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
}

function getStats() {
  const total = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const loggedIn = db.prepare('SELECT COUNT(*) c FROM users WHERE is_logged_in = 1').get().c;
  const premium = db.prepare("SELECT COUNT(*) c FROM users WHERE is_premium = 1 AND premium_until > strftime('%s','now')").get().c;
  const banned = db.prepare('SELECT COUNT(*) c FROM users WHERE is_banned = 1').get().c;
  const today = new Date().toISOString().slice(0, 10);
  const newToday = db.prepare("SELECT COUNT(*) c FROM users WHERE date(created_at, 'unixepoch') = ?").get(today).c;
  const totalPayments = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(amount_stars),0) s FROM payments WHERE status = 'paid'").get();
  return {
    total, loggedIn, premium, banned, newToday,
    paymentsCount: totalPayments.c, paymentsStarsTotal: totalPayments.s,
  };
}

// ---------- Premium ----------
function getPremiumPlans(onlyActive = true) {
  const q = onlyActive
    ? 'SELECT * FROM premium_plans WHERE is_active = 1 ORDER BY days'
    : 'SELECT * FROM premium_plans ORDER BY days';
  return db.prepare(q).all();
}

function getPlan(code) {
  return db.prepare('SELECT * FROM premium_plans WHERE code = ?').get(code);
}

function updatePlan(code, fields) {
  const allowed = ['label', 'days', 'price_stars', 'discount_percent', 'is_active'];
  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.includes(k)) continue;
    sets.push(`${k} = ?`);
    values.push(v);
  }
  if (sets.length === 0) return;
  values.push(code);
  db.prepare(`UPDATE premium_plans SET ${sets.join(', ')} WHERE code = ?`).run(...values);
}

function finalPriceStars(plan) {
  const discount = plan.discount_percent || 0;
  return Math.max(1, Math.round(plan.price_stars * (1 - discount / 100)));
}

function grantPremium(managerChatId, days) {
  ensureUser(managerChatId);
  const user = getUser(managerChatId);
  const now = Math.floor(Date.now() / 1000);
  const base = user.premium_until && user.premium_until > now ? user.premium_until : now;
  const newUntil = base + days * 86400;
  db.prepare('UPDATE users SET is_premium = 1, premium_until = ? WHERE manager_chat_id = ?').run(newUntil, managerChatId);
  return newUntil;
}

function isPremiumActive(managerChatId) {
  const user = getUser(managerChatId);
  if (!user) return false;
  return !!(user.is_premium && user.premium_until > Math.floor(Date.now() / 1000));
}

function recordPayment(managerChatId, planCode, amountStars, chargeId) {
  db.prepare(
    'INSERT INTO payments (manager_chat_id, plan_code, amount_stars, telegram_payment_charge_id) VALUES (?, ?, ?, ?)'
  ).run(managerChatId, planCode, amountStars, chargeId);
}

// ---------- Kunlik limitlar ----------
function getTodayUsage(managerChatId, feature) {
  const day = new Date().toISOString().slice(0, 10);
  const row = db.prepare('SELECT count FROM usage_daily WHERE manager_chat_id = ? AND feature = ? AND day = ?').get(managerChatId, feature, day);
  return row ? row.count : 0;
}

function incrementUsage(managerChatId, feature) {
  const day = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO usage_daily (manager_chat_id, feature, day, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(manager_chat_id, feature, day) DO UPDATE SET count = count + 1`
  ).run(managerChatId, feature, day);
}

function canUseFeature(managerChatId, feature) {
  const premium = isPremiumActive(managerChatId);
  const limitKey = premium ? `premium_${feature}_limit_daily` : `free_${feature}_limit_daily`;
  const limitRaw = getConfig(limitKey);
  if (limitRaw === null) return { allowed: true, remaining: Infinity, limit: Infinity };
  const limit = parseInt(limitRaw, 10);
  if (limit < 0) return { allowed: true, remaining: Infinity, limit: Infinity }; // -1 = cheksiz
  const used = getTodayUsage(managerChatId, feature);
  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit };
}

// ---------- Postlar (.post token tizimi) ----------
function createPost(ownerChatId, text, buttonLabel, buttonUrl) {
  const token = crypto.randomBytes(4).toString('hex'); // 8 xonali qisqa token
  db.prepare(
    'INSERT INTO posts (token, owner_chat_id, text, button_label, button_url) VALUES (?, ?, ?, ?, ?)'
  ).run(token, ownerChatId, text, buttonLabel || null, buttonUrl || null);
  return token;
}

function getPostByToken(token) {
  return db.prepare('SELECT * FROM posts WHERE token = ?').get(token);
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
  getConfig,
  setConfig,
  getAllConfig,
  isAdmin,
  setAdmin,
  setBanned,
  getAllUsers,
  getStats,
  getPremiumPlans,
  getPlan,
  updatePlan,
  finalPriceStars,
  grantPremium,
  isPremiumActive,
  recordPayment,
  getTodayUsage,
  incrementUsage,
  canUseFeature,
  createPost,
  getPostByToken,
};
