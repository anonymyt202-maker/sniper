const { Api } = require('telegram');
const db = require('../db');

const runningTimers = new Map(); // managerChatId -> intervalId
const originalNames = new Map(); // managerChatId -> { firstName, lastName, about }

function formatUzbekistanTime() {
  // O'zbekiston doim GMT+5:00 da (DST yo'q)
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const uzTime = new Date(utcMs + 5 * 60 * 60000);
  const hh = String(uzTime.getHours()).padStart(2, '0');
  const mm = String(uzTime.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function startProfileClock(client, managerChatId) {
  stopProfileClock(client, managerChatId);

  const me = await client.getMe();
  originalNames.set(managerChatId, { firstName: me.firstName || '' });

  const botUsername = db.getConfig('bot_username') || 'aisuxbat_bot';

  const update = async () => {
    try {
      const base = originalNames.get(managerChatId);
      const time = formatUzbekistanTime();
      await client.invoke(
        new Api.account.UpdateProfile({
          firstName: `${base.firstName} 🕔${time}`.slice(0, 64),
          about: `⏰ Soat @${botUsername} orqali qo'yildi (GMT +5:00, O'zbekiston)`,
        })
      );
    } catch (err) {
      console.error(`[profileClock:${managerChatId}]`, err.message);
    }
  };

  await update();
  const timer = setInterval(update, 60 * 1000); // har daqiqa
  runningTimers.set(managerChatId, timer);
}

async function stopProfileClock(client, managerChatId) {
  const timer = runningTimers.get(managerChatId);
  if (timer) {
    clearInterval(timer);
    runningTimers.delete(managerChatId);
  }
  const base = originalNames.get(managerChatId);
  if (client && base) {
    try {
      await client.invoke(new Api.account.UpdateProfile({ firstName: base.firstName, about: '' }));
    } catch (err) {
      console.error(`[profileClock:stop:${managerChatId}]`, err.message);
    }
  }
  originalNames.delete(managerChatId);
}

module.exports = { startProfileClock, stopProfileClock };
