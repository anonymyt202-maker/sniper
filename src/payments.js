const db = require('./db');

/**
 * Foydalanuvchiga premium tariflarni tanlash uchun tugmalar ko'rsatadi.
 */
async function sendPlansMenu(bot, chatId) {
  const plans = db.getPremiumPlans(true);
  if (plans.length === 0) {
    await bot.sendMessage(chatId, "❗ Hozircha premium tariflar sozlanmagan.");
    return;
  }

  const rate = parseInt(db.getConfig('stars_to_uzs_rate') || '150', 10);

  const rows = plans.map((p) => {
    const price = db.finalPriceStars(p);
    const uzs = price * rate;
    const discountLabel = p.discount_percent > 0 ? ` (-${p.discount_percent}%)` : '';
    return [
      {
        text: `${p.label}${discountLabel} — ⭐${price} (~${uzs.toLocaleString('ru-RU')} so'm)`,
        callback_data: `buy_plan:${p.code}`,
      },
    ];
  });

  rows.push([{ text: "💳 Kartaga to'lov (admin bilan bog'lanish)", callback_data: 'buy_card' }]);

  await bot.sendMessage(
    chatId,
    "⭐ **Premium tariflar**\n\nTo'lov Telegram Stars (XTR) orqali amalga oshiriladi — to'lov Telegram ichida, xavfsiz.\n\nYoki UZS kartaga to'lovni admin bilan bog'lanib amalga oshirishingiz mumkin.",
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } }
  );
}

/**
 * Tanlangan tarif uchun Stars invoice yuboradi.
 */
async function sendInvoiceForPlan(bot, chatId, planCode) {
  const plan = db.getPlan(planCode);
  if (!plan || !plan.is_active) {
    await bot.sendMessage(chatId, "❗ Bu tarif topilmadi yoki faol emas.");
    return;
  }
  const price = db.finalPriceStars(plan);

  await bot.sendInvoice(
    chatId,
    `Premium — ${plan.label}`,
    `Userbot Premium obuna: ${plan.label}. Reklamasiz, cheksiz limit.`,
    `premium:${plan.code}`, // payload
    '', // provider_token — Stars uchun bo'sh bo'lishi kerak
    'XTR',
    [{ label: plan.label, amount: price }]
  );
}

/**
 * pre_checkout_query — har doim tasdiqlaymiz (agar tarif hali mavjud bo'lsa).
 */
async function handlePreCheckout(bot, query) {
  const payload = query.invoice_payload || '';
  if (!payload.startsWith('premium:')) {
    await bot.answerPreCheckoutQuery(query.id, false, { error_message: "Noto'g'ri buyurtma." });
    return;
  }
  const planCode = payload.replace('premium:', '');
  const plan = db.getPlan(planCode);
  if (!plan || !plan.is_active) {
    await bot.answerPreCheckoutQuery(query.id, false, { error_message: "Bu tarif endi mavjud emas." });
    return;
  }
  await bot.answerPreCheckoutQuery(query.id, true);
}

/**
 * successful_payment — premiumni faollashtiradi va to'lovni yozib qo'yadi.
 */
async function handleSuccessfulPayment(bot, msg) {
  const chatId = msg.chat.id;
  const payment = msg.successful_payment;
  const payload = payment.invoice_payload || '';
  if (!payload.startsWith('premium:')) return;

  const planCode = payload.replace('premium:', '');
  const plan = db.getPlan(planCode);
  if (!plan) return;

  const newUntil = db.grantPremium(chatId, plan.days);
  db.recordPayment(chatId, planCode, payment.total_amount, payment.telegram_payment_charge_id);

  const untilDate = new Date(newUntil * 1000).toLocaleDateString('uz-UZ');
  await bot.sendMessage(
    chatId,
    `✅ To'lov muvaffaqiyatli! 🎉\n\n⭐ Premium faollashtirildi: **${plan.label}**\n📅 Amal qilish muddati: ${untilDate} gacha\n\nEndi reklamasiz va limitsiz foydalanishingiz mumkin!`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = {
  sendPlansMenu,
  sendInvoiceForPlan,
  handlePreCheckout,
  handleSuccessfulPayment,
};
