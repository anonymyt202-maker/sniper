require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const loginFlow = require('./loginFlow');
const { buildSettingsKeyboard } = require('./settingsKeyboard');
const { startUserbotForUser, stopUserbotForUser, getClient } = require('./userbotManager');
const payments = require('./payments');
const admin = require('./adminPanel');
const checkersBot = require('./checkersBot');

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
  const custom = db.getConfig('settings_text');
  const headerText = custom && custom.trim() ? custom : "⚙️ **Sozlamalar**\n\nKerakli tugmani bosib yoqing/o'chiring:";
  await send(chatId, headerText, {
    reply_markup: buildSettingsKeyboard(chatId),
  });
});

bot.onText(/^\/premium$/, async (msg) => {
  const chatId = msg.chat.id;
  db.ensureUser(chatId);
  if (db.isPremiumActive(chatId)) {
    const user = db.getUser(chatId);
    const untilDate = new Date(user.premium_until * 1000).toLocaleDateString('uz-UZ');
    await send(chatId, `⭐ Sizda allaqachon Premium faol!\n📅 Muddati: ${untilDate} gacha`);
    return;
  }
  await payments.sendPlansMenu(bot, chatId);
});

bot.onText(/^\/admin$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!db.isAdmin(chatId)) {
    await send(chatId, "⛔ Sizda admin panelga kirish huquqi yo'q.");
    return;
  }
  await send(chatId, "🛠 **Admin panel**", { reply_markup: admin.buildAdminMenu() });
});

// Birinchi marta admin tayinlash uchun: hech kim admin bo'lmasa, birinchi /makeadmin ishlatgan kishi admin bo'ladi.
bot.onText(/^\/makeadmin$/, async (msg) => {
  const chatId = msg.chat.id;
  db.ensureUser(chatId);
  const allUsers = db.getAllUsers();
  const anyAdmin = allUsers.some((u) => u.is_admin);
  if (anyAdmin && !db.isAdmin(chatId)) {
    await send(chatId, "⛔ Admin allaqachon tayinlangan. Yangi admin qo'shish uchun mavjud admindan so'rang.");
    return;
  }
  db.setAdmin(chatId, true);
  await send(chatId, "✅ Siz admin sifatida tayinlandingiz. /admin buyrug'i bilan panelni oching.");
});

bot.onText(/^\/setbotusername (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!db.isAdmin(chatId)) return;
  const username = match[1].trim().replace(/^@/, '');
  db.setConfig('bot_username', username);
  await send(chatId, `✅ Bot username o'rnatildi: @${username}`);
});

bot.onText(/^\/shashka$/, async (msg) => {
  const chatId = msg.chat.id;
  if (msg.chat.type !== 'private') {
    await send(chatId, "♟ Guruhda o'ynash uchun: `@" + (db.getConfig('bot_username') || 'bot_username') + " shashka` deb yozing.");
    return;
  }
  await checkersBot.startAiGame(bot, chatId, msg.from.id, msg.from.first_name || msg.from.username || 'Player');
});

// Callback query handler - settings tugmalarini bosganda
bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat?.id; // inline (shashka guruh) callbacklarida query.message bo'lmaydi
  const data = query.data;

  try {
    if (data === 'noop') {
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // ---------- Shashka o'yini callbacklari ----------
    if (data.startsWith('sh:') || data.startsWith('sh_join:') || data.startsWith('sh_resign:') || data === 'sh_join_placeholder') {
      await checkersBot.handleCallbackQuery(bot, query);
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
      return;
    }

    // ---------- Premium sotib olish ----------
    if (data.startsWith('buy_plan:')) {
      const planCode = data.replace('buy_plan:', '');
      await bot.answerCallbackQuery(query.id);
      await payments.sendInvoiceForPlan(bot, chatId, planCode);
      return;
    }

    if (data === 'buy_card') {
      await bot.answerCallbackQuery(query.id);
      await send(chatId, "💳 UZS kartaga to'lov uchun admin bilan bog'laning: @your_admin_username");
      return;
    }

    // ---------- Admin panel ----------
    if (data.startsWith('admin:')) {
      if (!db.isAdmin(chatId)) {
        await bot.answerCallbackQuery(query.id, { text: "⛔ Ruxsat yo'q" });
        return;
      }
      await handleAdminCallback(query, data);
      return;
    }
  } catch (err) {
    console.error('callback_query error:', err.message);
    await bot.answerCallbackQuery(query.id, { text: `Xatolik: ${err.message}` });
  }
});

// ---------- Admin panel callback logikasi ----------
async function handleAdminCallback(query, data) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const action = data.replace('admin:', '');

  const editText = (text, keyboard) =>
    bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });

  if (action === 'close') {
    admin.clearAdminState(chatId);
    await bot.answerCallbackQuery(query.id);
    await bot.deleteMessage(chatId, messageId).catch(() => {});
    return;
  }

  if (action === 'back') {
    admin.clearAdminState(chatId);
    await bot.answerCallbackQuery(query.id);
    await editText('🛠 **Admin panel**', admin.buildAdminMenu());
    return;
  }

  if (action === 'stats') {
    await bot.answerCallbackQuery(query.id);
    await editText(admin.buildStatsText(), {
      inline_keyboard: [[{ text: '⬅️ Orqaga', callback_data: 'admin:back' }]],
    });
    return;
  }

  if (action === 'broadcast') {
    admin.startBroadcast(chatId);
    await bot.answerCallbackQuery(query.id);
    await editText(
      "📢 Broadcast matnini yuboring (keyingi xabaringiz hammaga jo'natiladi).\n\nBekor qilish uchun /cancel yozing.",
      { inline_keyboard: [[{ text: '⬅️ Bekor qilish', callback_data: 'admin:back' }]] }
    );
    return;
  }

  if (action === 'plans') {
    await bot.answerCallbackQuery(query.id);
    await editText('⭐ **Premium tariflar** (tahrirlash uchun tanlang)', admin.buildPlansMenu());
    return;
  }

  if (action.startsWith('plan_edit:')) {
    const code = action.replace('plan_edit:', '');
    const { text, keyboard } = admin.buildPlanEditMenu(code);
    await bot.answerCallbackQuery(query.id);
    await editText(text, keyboard);
    return;
  }

  if (action.startsWith('plan_price_inc:') || action.startsWith('plan_price_dec:')) {
    const code = action.split(':')[1];
    const delta = action.includes('inc') ? 10 : -10;
    admin.adjustPlanPrice(code, delta);
    const { text, keyboard } = admin.buildPlanEditMenu(code);
    await bot.answerCallbackQuery(query.id, { text: '✅ Yangilandi' });
    await editText(text, keyboard);
    return;
  }

  if (action.startsWith('plan_disc_inc:') || action.startsWith('plan_disc_dec:')) {
    const code = action.split(':')[1];
    const delta = action.includes('inc') ? 5 : -5;
    admin.adjustPlanDiscount(code, delta);
    const { text, keyboard } = admin.buildPlanEditMenu(code);
    await bot.answerCallbackQuery(query.id, { text: '✅ Yangilandi' });
    await editText(text, keyboard);
    return;
  }

  if (action.startsWith('plan_toggle:')) {
    const code = action.replace('plan_toggle:', '');
    admin.togglePlanActive(code);
    const { text, keyboard } = admin.buildPlanEditMenu(code);
    await bot.answerCallbackQuery(query.id, { text: '✅ Yangilandi' });
    await editText(text, keyboard);
    return;
  }

  if (action === 'limits') {
    const { text, keyboard } = admin.buildLimitsMenu();
    await bot.answerCallbackQuery(query.id);
    await editText(text, keyboard);
    return;
  }

  if (action.startsWith('limit_inc:') || action.startsWith('limit_dec:')) {
    const key = action.split(':')[1];
    const delta = action.includes('inc') ? 1 : -1;
    admin.adjustLimit(key, delta);
    const { text, keyboard } = admin.buildLimitsMenu();
    await bot.answerCallbackQuery(query.id, { text: '✅ Yangilandi' });
    await editText(text, keyboard);
    return;
  }

  if (action === 'toggle_ads') {
    admin.toggleAds();
    const { text, keyboard } = admin.buildLimitsMenu();
    await bot.answerCallbackQuery(query.id, { text: '✅ Yangilandi' });
    await editText(text, keyboard);
    return;
  }

  if (action === 'user_manage') {
    admin.startUserManage(chatId);
    await bot.answerCallbackQuery(query.id);
    await editText(
      "👤 Foydalanuvchi manager_chat_id raqamini yuboring (masalan: `123456789`).\n\nBekor qilish uchun /cancel yozing.",
      { inline_keyboard: [[{ text: '⬅️ Bekor qilish', callback_data: 'admin:back' }]] }
    );
    return;
  }

  if (action.startsWith('grant:')) {
    const [, targetChatId, days] = action.split(':');
    db.grantPremium(parseInt(targetChatId, 10), parseInt(days, 10));
    await bot.answerCallbackQuery(query.id, { text: `✅ ${days} kun premium berildi` });
    const menu = admin.buildUserManageMenu(parseInt(targetChatId, 10));
    await editText(menu.text, menu.keyboard);
    try {
      await bot.sendMessage(parseInt(targetChatId, 10), `🎉 Sizga admin tomonidan ${days} kunlik Premium berildi!`);
    } catch (e) {}
    return;
  }

  if (action.startsWith('ban_toggle:')) {
    const targetChatId = parseInt(action.replace('ban_toggle:', ''), 10);
    const user = db.getUser(targetChatId);
    db.setBanned(targetChatId, !user.is_banned);
    await bot.answerCallbackQuery(query.id, { text: '✅ Yangilandi' });
    const menu = admin.buildUserManageMenu(targetChatId);
    await editText(menu.text, menu.keyboard);
    return;
  }

  await bot.answerCallbackQuery(query.id);
}


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

  // 3) Admin: broadcast matni kutilyaptimi?
  if (admin.isAwaitingBroadcast(chatId) && db.isAdmin(chatId)) {
    admin.clearAdminState(chatId);
    await admin.runBroadcast(bot, text, chatId);
    return;
  }

  // 4) Admin: foydalanuvchi ID kutilyaptimi?
  if (admin.isAwaitingUserId(chatId) && db.isAdmin(chatId)) {
    admin.clearAdminState(chatId);
    const targetChatId = parseInt(text.trim(), 10);
    if (isNaN(targetChatId)) {
      await send(chatId, "❌ Noto'g'ri ID.");
      return;
    }
    const menu = admin.buildUserManageMenu(targetChatId);
    if (!menu) {
      await send(chatId, "❗ Bu ID bilan foydalanuvchi topilmadi.");
      return;
    }
    await send(chatId, menu.text, { reply_markup: menu.keyboard });
    return;
  }

  // 5) .add_message kabi userbot komandalari manager botda emas, shaxsiy akkauntda ishlaydi.
  //    Manager botga oddiy xabar yozilsa, hech narsa qilmaymiz (yoki yordam ko'rsatamiz).
});

bot.on('inline_query', async (query) => {
  const text = (query.query || '').trim();
  const lower = text.toLowerCase();

  if (lower === 'shashka' || lower === 'шашки' || lower === '') {
    await checkersBot.handleInlineQuery(bot, query);
    return;
  }

  // Token bo'lishi mumkin (.post orqali yaratilgan) - 8 xonali hex
  if (/^[a-f0-9]{8}$/.test(text)) {
    const post = db.getPostByToken(text);
    if (!post) {
      try {
        await bot.answerInlineQuery(query.id, [], { cache_time: 0, switch_pm_text: 'Token topilmadi', switch_pm_parameter: 'notfound' });
      } catch (e) {}
      return;
    }

    const result = {
      type: 'article',
      id: `post_${text}`,
      title: '📨 Post yuborish',
      description: post.text.slice(0, 80),
      input_message_content: { message_text: post.text },
    };
    if (post.button_label && post.button_url) {
      result.reply_markup = {
        inline_keyboard: [[{ text: post.button_label, url: post.button_url }]],
      };
    }

    try {
      await bot.answerInlineQuery(query.id, [result], { cache_time: 0 });
    } catch (err) {
      console.error('[inlineQuery:post]', err.message);
    }
    return;
  }

  // Boshqa matnlar uchun bo'sh natija
  try {
    await bot.answerInlineQuery(query.id, [], { cache_time: 0 });
  } catch (e) {}
});

bot.on('chosen_inline_result', async (result) => {
  if (result.result_id === 'new_checkers_game') {
    await checkersBot.handleChosenInlineResult(bot, result);
  }
});

bot.on('pre_checkout_query', async (query) => {
  await payments.handlePreCheckout(bot, query);
});

bot.on('successful_payment', async (msg) => {
  await payments.handleSuccessfulPayment(bot, msg);
});
// node-telegram-bot-api successful_payment eventini alohida ajratmasligi mumkin -
// shuning uchun oddiy 'message' ichida ham tekshiramiz (yuqoridagi asosiy handlerda emas, alohida):
bot.on('message', async (msg) => {
  if (msg.successful_payment) {
    await payments.handleSuccessfulPayment(bot, msg);
  }
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
