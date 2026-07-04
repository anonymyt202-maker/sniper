const db = require('./db');

// managerChatId -> { step, data } - admin panel ichidagi ko'p bosqichli amallar uchun (masalan broadcast matn kutish)
const adminState = new Map();

function buildAdminMenu() {
  return {
    inline_keyboard: [
      [{ text: '📊 Statistika', callback_data: 'admin:stats' }],
      [{ text: '📢 Broadcast (hammaga xabar)', callback_data: 'admin:broadcast' }],
      [{ text: '⭐ Premium tariflarni tahrirlash', callback_data: 'admin:plans' }],
      [{ text: '⚙️ Limitlarni tahrirlash', callback_data: 'admin:limits' }],
      [{ text: '👤 Foydalanuvchini boshqarish', callback_data: 'admin:user_manage' }],
      [{ text: '❌ Yopish', callback_data: 'admin:close' }],
    ],
  };
}

function buildPlansMenu() {
  const plans = db.getPremiumPlans(false);
  const rows = plans.map((p) => [
    {
      text: `${p.label} — ⭐${p.price_stars} (-${p.discount_percent}%) ${p.is_active ? '✅' : '🚫'}`,
      callback_data: `admin:plan_edit:${p.code}`,
    },
  ]);
  rows.push([{ text: '⬅️ Orqaga', callback_data: 'admin:back' }]);
  return { inline_keyboard: rows };
}

function buildPlanEditMenu(code) {
  const plan = db.getPlan(code);
  const finalPrice = db.finalPriceStars(plan);
  return {
    text:
      `⭐ **${plan.label}**\n\n` +
      `Muddat: ${plan.days} kun\n` +
      `Asosiy narx: ${plan.price_stars} Stars\n` +
      `Aksiya: ${plan.discount_percent}%\n` +
      `Yakuniy narx: ${finalPrice} Stars\n` +
      `Holati: ${plan.is_active ? "✅ Faol" : '🚫 O\'chirilgan'}`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '➖ Narx', callback_data: `admin:plan_price_dec:${code}` },
          { text: '➕ Narx', callback_data: `admin:plan_price_inc:${code}` },
        ],
        [
          { text: '➖ Aksiya %', callback_data: `admin:plan_disc_dec:${code}` },
          { text: '➕ Aksiya %', callback_data: `admin:plan_disc_inc:${code}` },
        ],
        [
          {
            text: plan.is_active ? "🚫 O'chirish" : '✅ Yoqish',
            callback_data: `admin:plan_toggle:${code}`,
          },
        ],
        [{ text: '⬅️ Orqaga', callback_data: 'admin:plans' }],
      ],
    },
  };
}

function buildLimitsMenu() {
  const cfg = db.getAllConfig();
  return {
    text:
      `⚙️ **Kunlik limitlar**\n\n` +
      `🆓 Free .img limiti: ${cfg.free_img_limit_daily}\n` +
      `⭐ Premium .img limiti: ${cfg.premium_img_limit_daily === '-1' ? "Cheksiz" : cfg.premium_img_limit_daily}\n` +
      `🆓 Free .ai limiti: ${cfg.free_ai_limit_daily === '-1' ? "Cheksiz" : cfg.free_ai_limit_daily}\n` +
      `📢 Free foydalanuvchida reklama: ${cfg.ads_enabled_for_free === '1' ? 'Yoqilgan' : "O'chirilgan"}`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '➖ Free img', callback_data: 'admin:limit_dec:free_img_limit_daily' },
          { text: '➕ Free img', callback_data: 'admin:limit_inc:free_img_limit_daily' },
        ],
        [
          { text: '➖ Premium img', callback_data: 'admin:limit_dec:premium_img_limit_daily' },
          { text: '➕ Premium img', callback_data: 'admin:limit_inc:premium_img_limit_daily' },
        ],
        [
          { text: '➖ Free AI', callback_data: 'admin:limit_dec:free_ai_limit_daily' },
          { text: '➕ Free AI', callback_data: 'admin:limit_inc:free_ai_limit_daily' },
        ],
        [
          {
            text: `📢 Reklama: ${cfg.ads_enabled_for_free === '1' ? 'ON' : 'OFF'}`,
            callback_data: 'admin:toggle_ads',
          },
        ],
        [{ text: '⬅️ Orqaga', callback_data: 'admin:back' }],
      ],
    },
  };
}

function buildStatsText() {
  const s = db.getStats();
  return (
    `📊 **Statistika**\n\n` +
    `👥 Jami foydalanuvchilar: ${s.total}\n` +
    `🔌 Ulangan (login qilgan): ${s.loggedIn}\n` +
    `⭐ Premium (faol): ${s.premium}\n` +
    `🚫 Bloklangan: ${s.banned}\n` +
    `🆕 Bugun qo'shilgan: ${s.newToday}\n\n` +
    `💳 To'lovlar soni: ${s.paymentsCount}\n` +
    `⭐ Jami tushum: ${s.paymentsStarsTotal} Stars`
  );
}

function adjustLimit(key, delta) {
  const current = db.getConfig(key);
  let val = parseInt(current, 10);
  if (isNaN(val)) val = 0;
  val += delta;
  if (val < -1) val = -1; // -1 = cheksiz, pastga tushmaydi
  db.setConfig(key, String(val));
}

function adjustPlanPrice(code, delta) {
  const plan = db.getPlan(code);
  const newPrice = Math.max(1, plan.price_stars + delta);
  db.updatePlan(code, { price_stars: newPrice });
}

function adjustPlanDiscount(code, delta) {
  const plan = db.getPlan(code);
  let newDiscount = plan.discount_percent + delta;
  if (newDiscount < 0) newDiscount = 0;
  if (newDiscount > 90) newDiscount = 90;
  db.updatePlan(code, { discount_percent: newDiscount });
}

function togglePlanActive(code) {
  const plan = db.getPlan(code);
  db.updatePlan(code, { is_active: plan.is_active ? 0 : 1 });
}

function toggleAds() {
  const cur = db.getConfig('ads_enabled_for_free');
  db.setConfig('ads_enabled_for_free', cur === '1' ? '0' : '1');
}

// ---------- Broadcast ----------
function startBroadcast(adminChatId) {
  adminState.set(adminChatId, { step: 'awaiting_broadcast_text' });
}

function isAwaitingBroadcast(adminChatId) {
  return adminState.get(adminChatId)?.step === 'awaiting_broadcast_text';
}

function clearAdminState(adminChatId) {
  adminState.delete(adminChatId);
}

async function runBroadcast(bot, text, fromChatId) {
  const users = db.getAllUsers();
  let sent = 0;
  let failed = 0;

  await bot.sendMessage(fromChatId, `📢 Broadcast boshlandi. Jami: ${users.length} ta foydalanuvchi.`);

  for (const user of users) {
    try {
      await bot.sendMessage(user.manager_chat_id, text, { parse_mode: 'Markdown' });
      sent++;
    } catch (err) {
      failed++;
    }
    // Telegram rate-limitiga tushmaslik uchun kichik pauza
    await new Promise((r) => setTimeout(r, 40));
  }

  await bot.sendMessage(fromChatId, `✅ Broadcast tugadi.\n\n✔️ Yuborildi: ${sent}\n❌ Xato: ${failed}`);
}

// ---------- Foydalanuvchi boshqarish ----------
function startUserManage(adminChatId) {
  adminState.set(adminChatId, { step: 'awaiting_user_id' });
}

function isAwaitingUserId(adminChatId) {
  return adminState.get(adminChatId)?.step === 'awaiting_user_id';
}

function buildUserManageMenu(targetChatId) {
  const user = db.getUser(targetChatId);
  if (!user) return null;
  const premiumStatus = db.isPremiumActive(targetChatId) ? '⭐ Faol' : "🆓 Yo'q";
  return {
    text:
      `👤 **Foydalanuvchi:** \`${targetChatId}\`\n\n` +
      `📱 Tel: ${user.phone || "yo'q"}\n` +
      `🔌 Ulangan: ${user.is_logged_in ? '✅' : '❌'}\n` +
      `⭐ Premium: ${premiumStatus}\n` +
      `🚫 Bloklangan: ${user.is_banned ? '✅' : '❌'}`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '⭐ +1 kun', callback_data: `admin:grant:${targetChatId}:1` },
          { text: '⭐ +7 kun', callback_data: `admin:grant:${targetChatId}:7` },
          { text: '⭐ +30 kun', callback_data: `admin:grant:${targetChatId}:30` },
        ],
        [
          {
            text: user.is_banned ? '✅ Blokdan chiqarish' : '🚫 Bloklash',
            callback_data: `admin:ban_toggle:${targetChatId}`,
          },
        ],
        [{ text: '⬅️ Orqaga', callback_data: 'admin:back' }],
      ],
    },
  };
}

module.exports = {
  buildAdminMenu,
  buildPlansMenu,
  buildPlanEditMenu,
  buildLimitsMenu,
  buildStatsText,
  adjustLimit,
  adjustPlanPrice,
  adjustPlanDiscount,
  togglePlanActive,
  toggleAds,
  startBroadcast,
  isAwaitingBroadcast,
  clearAdminState,
  runBroadcast,
  startUserManage,
  isAwaitingUserId,
  buildUserManageMenu,
};
