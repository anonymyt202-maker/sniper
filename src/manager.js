require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const loginFlow = require('./loginFlow');
const { buildSettingsKeyboard } = require('./settingsKeyboard');
const { startUserbotForUser, stopUserbotForUser, getClient } = require('./userbotManager');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN .env faylida topilmadi!');
  process.exit(1);
}
if (!process.env.API_ID || !process.env.API_HASH) {
  console.error('❌ API_ID / API_HASH .env faylida topilmadi! https://my.telegram.org dan oling.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// managerChatId -> 'awaiting_phone' | null (telefon so'ralayotganini bilish uchun)
const awaitingPhone = new Set();

function send(chatId, text, extra = {}) {
  return bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra });
}

bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  db.ensureUser(chatId);
  const user = db.getUser(chatId);

  const intro =
    "👋 Assalomu alaykum!\n\n" +
    "Bu bot orqali siz shaxsiy Telegram akkauntingizni ulab, `.` (nuqta) bilan boshlanuvchi buyruqlar orqali " +
    "avtomatlashtirilgan userbot xususiyatlaridan foydalanishingiz mumkin.\n\n" +
    (user.is_logged_in
      ? "✅ Siz allaqachon ulangansiz. /settings buyrug'i bilan sozlamalarni boshqaring."
      : "🔐 Boshlash uchun /login buyrug'ini yuboring.");

  await send(chatId, intro);
});

bot.onText(/^\/login$/, async (msg) => {
  const chatId = msg.chat.id;
  const user = db.getUser(chatId) || db.ensureUser(chatId);

  if (user.is_logged_in) {
    await send(chatId, "✅ Siz allaqachon ulangansiz. Qayta ulash uchun avval /logout qiling.");
    return;
  }

  awaitingPhone.add(chatId);
  await send(
    chatId,
    "📱 Telefon raqamingizni xalqaro formatda yuboring.\nMasalan: `+998901234567`"
  );
});

bot.onText(/^\/cancel$/, async (msg) => {
  const chatId = msg.chat.id;
  awaitingPhone.delete(chatId);
  const cancelled = loginFlow.cancelLogin(chatId);
  await send(chatId, cancelled || awaitingPhone.has(chatId) ? "🚫 Bekor qilindi." : "Bekor qilinadigan jarayon topilmadi.");
});

bot.onText(/^\/logout$/, async (msg) => {
  const chatId = msg.chat.id;
  const user = db.getUser(chatId);
  if (!user || !user.is_logged_in) {
    await send(chatId, "❗ Siz ulanmagansiz.");
    return;
  }
  await stopUserbotForUser(chatId);
  db.logout(chatId);
  await send(chatId, "🚪 Akkauntdan muvaffaqiyatli chiqdingiz.");
});

bot.onText(/^\/settings$/, async (msg) => {
  const chatId = msg.chat.id;
  const user = db.getUser(chatId);
  if (!user || !user.is_logged_in) {
    await send(chatId, "❗ Avval /login orqali akkauntingizni ulang.");
    return;
  }
  await send(chatId, "⚙️ **Sozlamalar**\n\nKerakli tugmani bosib yoqing/o'chiring:", {
    reply_markup: buildSettingsKeyboard(chatId),
  });
});

// Callback query handler - settings tugmalarini bosganda
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  try {
    if (data === 'noop') {
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'logout') {
      await stopUserbotForUser(chatId);
      db.logout(chatId);
      await bot.answerCallbackQuery(query.id, { text: 'Chiqildi' });
      await bot.editMessageText('🚪 Akkauntdan chiqdingiz.', {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      return;
    }

    if (data === 'list_auto_messages') {
      const list = db.listAutoMessages(chatId);
      const text =
        list.length === 0
          ? "💬 Auto xabarlar yo'q."
          : list.map((m) => `#${m.id} — ${m.text}`).join('\n');
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, text);
      return;
    }

    if (data.startsWith('toggle:')) {
      const field = data.replace('toggle:', '');
      const settings = db.getSettings(chatId);
      const client = getClient(chatId);

      if (field === 'ai_provider') {
        const newVal = settings.ai_provider === 'grok' ? 'chatgpt' : 'grok';
        db.updateSetting(chatId, 'ai_provider', newVal);
      } else {
        const newVal = settings[field] ? 0 : 1;
        db.updateSetting(chatId, field, newVal);

        // Real-time effekt: auto_status va profile_clock uchun darhol yoqish/o'chirish
        if (client) {
          const autoStatus = require('./features/autoStatus');
          const profileClock = require('./features/profileClock');
          const { Api } = require('telegram');

          if (field === 'auto_status_running') {
            if (newVal) await autoStatus.startAutoStatus(client, chatId);
            else autoStatus.stopAutoStatus(chatId);
          }
          if (field === 'profile_clock') {
            if (newVal) await profileClock.startProfileClock(client, chatId);
            else await profileClock.stopProfileClock(client, chatId);
          }
          if (field === 'online_247') {
            await client.invoke(new Api.account.UpdateStatus({ offline: !newVal }));
          }
        }
      }

      await bot.answerCallbackQuery(query.id, { text: '✅ Yangilandi' });
      await bot.editMessageReplyMarkup(buildSettingsKeyboard(chatId), {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
    }
  } catch (err) {
    console.error('callback_query error:', err.message);
    await bot.answerCallbackQuery(query.id, { text: `Xatolik: ${err.message}` });
  }
});

// Oddiy matnli xabarlar - login jarayonining bosqichlarini (telefon/kod/parol) ushlaydi
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  // 1) Telefon raqami kutilyaptimi?
  if (awaitingPhone.has(chatId)) {
    awaitingPhone.delete(chatId);
    const phone = text.trim();
    if (!/^\+\d{9,15}$/.test(phone)) {
      await send(chatId, "❌ Noto'g'ri format. Masalan: `+998901234567`. Qaytadan /login qiling.");
      return;
    }
    await loginFlow.startLogin(chatId, phone, (t, extra) => send(chatId, t, extra));
    return;
  }

  // 2) Login jarayonida kod yoki parol kutilyaptimi?
  if (loginFlow.hasPendingLogin(chatId)) {
    const step = loginFlow.getPendingStep(chatId);
    if (step === 'code') {
      await loginFlow.submitCode(chatId, text, (t, extra) => send(chatId, t, extra));
    } else if (step === 'password') {
      await loginFlow.submitPassword(chatId, text, (t, extra) => send(chatId, t, extra));
    }
    return;
  }

  // 3) .add_message kabi userbot komandalari manager botda emas, shaxsiy akkauntda ishlaydi.
  //    Manager botga oddiy xabar yozilsa, hech narsa qilmaymiz (yoki yordam ko'rsatamiz).
});

bot.on('polling_error', (err) => {
  console.error('Manager bot polling xatolik:', err.message);
});

// Server qayta ishga tushganda, avval ulangan barcha foydalanuvchilar uchun
// userbot instance'larini avtomatik qayta ko'taramiz.
async function restoreAllUsers() {
  const users = db.getAllLoggedInUsers();
  console.log(`🔄 ${users.length} ta foydalanuvchi uchun userbot qayta tiklanmoqda...`);
  for (const user of users) {
    try {
      await startUserbotForUser(user.manager_chat_id, user.session_string);
    } catch (err) {
      console.error(`❌ Qayta tiklashda xatolik (${user.manager_chat_id}):`, err.message);
    }
  }
}

restoreAllUsers();

console.log('🤖 Manager bot ishga tushdi. /login orqali foydalanuvchilarni kutmoqda...');
