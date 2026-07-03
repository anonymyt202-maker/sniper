// Har bir chat+msgId uchun oxirgi matnni va yuboruvchini xotirada saqlaymiz,
// shunda kimdir edit yoki delete qilganda "oldingi holat"ni bilamiz.
// Xotirada saqlash yetarli (doimiy DB shart emas) - eski yozuvlar avtomatik tozalanadi.

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 soat
const store = new Map(); // key: `${managerChatId}:${chatId}:${msgId}` -> { text, senderId, isPremium, timestamp }

function key(managerChatId, chatId, msgId) {
  return `${managerChatId}:${chatId}:${msgId}`;
}

function track(managerChatId, chatId, msgId, text, senderId, isPremium) {
  store.set(key(managerChatId, chatId, msgId), {
    text: text || '',
    senderId,
    isPremium: !!isPremium,
    timestamp: Date.now(),
  });
  cleanupIfNeeded();
}

function get(managerChatId, chatId, msgId) {
  return store.get(key(managerChatId, chatId, msgId));
}

function remove(managerChatId, chatId, msgId) {
  store.delete(key(managerChatId, chatId, msgId));
}

let lastCleanup = 0;
function cleanupIfNeeded() {
  const now = Date.now();
  if (now - lastCleanup < 10 * 60 * 1000) return; // har 10 daqiqada bir tozalaymiz
  lastCleanup = now;
  for (const [k, v] of store.entries()) {
    if (now - v.timestamp > MAX_AGE_MS) store.delete(k);
  }
}

module.exports = { track, get, remove };
