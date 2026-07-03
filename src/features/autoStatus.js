const { Api } = require('telegram');

// Statuslar ro'yxati - emoji "status" atamasi sifatida bio yoki emoji-status ishlatiladi.
// Telegram emoji-status uchun premium custom emoji document_id kerak bo'lgani sabab,
// bu yerda oddiyroq va universal yechim: bio'ni belgilangan status matnlari bilan
// aylantirib turamiz (agar client premium bo'lsa, xohlasa emoji_status ham qo'shsa bo'ladi).
const DEFAULT_STATUSES = ['🌐', '✅', '⭐️', '🍏', '🔥', '💎', '🚀', '🌙'];

// managerChatId -> intervalId
const runningTimers = new Map();

async function startAutoStatus(client, managerChatId, statuses = DEFAULT_STATUSES) {
  stopAutoStatus(managerChatId);

  let i = 0;
  const timer = setInterval(async () => {
    try {
      const emoji = statuses[i % statuses.length];
      i++;
      // Emoji-statusni custom emoji sifatida qo'yish uchun avval shu emojiga mos
      // custom emoji document ID kerak. Oddiy fallback: emoji-statusni tozalab,
      // profil "About" maydonini vaqtincha shu emoji bilan yangilaymiz.
      await client.invoke(
        new Api.account.UpdateProfile({
          about: emoji,
        })
      );
    } catch (err) {
      console.error(`[autoStatus:${managerChatId}]`, err.message);
    }
  }, 3500); // 3.5 soniya - "har 3-4 soniyada"

  runningTimers.set(managerChatId, timer);
}

function stopAutoStatus(managerChatId) {
  const timer = runningTimers.get(managerChatId);
  if (timer) {
    clearInterval(timer);
    runningTimers.delete(managerChatId);
  }
}

module.exports = { startAutoStatus, stopAutoStatus, DEFAULT_STATUSES };
