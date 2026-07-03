const { Api } = require('telegram');

const runningTimers = new Map(); // managerChatId -> intervalId
const originalNames = new Map(); // managerChatId -> { firstName, lastName }

function formatTime() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function startProfileClock(client, managerChatId) {
  stopProfileClock(managerChatId);

  const me = await client.getMe();
  originalNames.set(managerChatId, { firstName: me.firstName || '', lastName: me.lastName || '' });

  const update = async () => {
    try {
      const base = originalNames.get(managerChatId);
      const time = formatTime();
      await client.invoke(
        new Api.account.UpdateProfile({
          firstName: `${base.firstName} 🕔${time}`.slice(0, 64),
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
      await client.invoke(new Api.account.UpdateProfile({ firstName: base.firstName }));
    } catch (err) {
      console.error(`[profileClock:stop:${managerChatId}]`, err.message);
    }
  }
  originalNames.delete(managerChatId);
}

module.exports = { startProfileClock, stopProfileClock };
