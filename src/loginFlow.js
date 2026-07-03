const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const db = require('./db');

const API_ID = parseInt(process.env.API_ID, 10);
const API_HASH = process.env.API_HASH;

// managerChatId -> { step, client, phone, phoneCodeHash, resolveCode, resolvePassword }
const pendingLogins = new Map();

/**
 * Login jarayonini boshlaydi. Foydalanuvchidan telefon raqamini so'raydi
 * (bot allaqachon .login komandasi bilan telefon yuborgan bo'lishi kerak).
 */
async function startLogin(managerChatId, phone, sendMessage) {
  if (pendingLogins.has(managerChatId)) {
    await sendMessage("⏳ Sizda allaqachon login jarayoni ketmoqda. Avval uni tugating yoki /cancel yozing.");
    return;
  }

  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.connect();

  const state = { step: 'code', client, phone };
  pendingLogins.set(managerChatId, state);

  try {
    const result = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone);
    state.phoneCodeHash = result.phoneCodeHash;
    await sendMessage(
      "📩 Tasdiqlash kodi yuborildi. Kodni shu yerga yozing.\n\n" +
      "⚠️ Kodni oralariga probel qo'shib yuboring, masalan: `1 2 3 4 5`\n" +
      "(Telegram ba'zan botlarga to'g'ridan-to'g'ri kod yozishni bloklaydi, probel bilan yozish buni chetlab o'tadi)"
    );
  } catch (err) {
    pendingLogins.delete(managerChatId);
    await client.destroy();
    await sendMessage(`❌ Xatolik: ${err.message}`);
  }
}

async function submitCode(managerChatId, rawCode, sendMessage) {
  const state = pendingLogins.get(managerChatId);
  if (!state || state.step !== 'code') {
    await sendMessage("❗ Avval /login buyrug'i bilan telefon raqamingizni yuboring.");
    return;
  }

  const code = rawCode.replace(/\s+/g, '').trim();

  try {
    const { Api } = require('telegram');
    const signInResult = await state.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: state.phone,
        phoneCodeHash: state.phoneCodeHash,
        phoneCode: code,
      })
    );

    await finishLogin(managerChatId, state, sendMessage);
  } catch (err) {
    if (err.message && err.message.includes('SESSION_PASSWORD_NEEDED')) {
      state.step = 'password';
      await sendMessage("🔐 Ikki bosqichli tasdiqlash (2FA) yoqilgan. Parolingizni yuboring:");
    } else if (err.message && err.message.includes('PHONE_CODE_INVALID')) {
      await sendMessage("❌ Kod noto'g'ri. Qaytadan urinib ko'ring yoki /cancel yozing.");
    } else {
      pendingLogins.delete(managerChatId);
      await state.client.destroy();
      await sendMessage(`❌ Xatolik: ${err.message}`);
    }
  }
}

async function submitPassword(managerChatId, password, sendMessage) {
  const state = pendingLogins.get(managerChatId);
  if (!state || state.step !== 'password') {
    await sendMessage("❗ Avval /login buyrug'i bilan boshlang.");
    return;
  }

  try {
    await state.client.signInWithPassword(
      { apiId: API_ID, apiHash: API_HASH },
      {
        password: async () => password,
        onError: async (err) => {
          await sendMessage(`❌ Parol xato: ${err.message}`);
        },
      }
    );
    await finishLogin(managerChatId, state, sendMessage);
  } catch (err) {
    await sendMessage(`❌ Xatolik: ${err.message}. Qaytadan urinib ko'ring yoki /cancel yozing.`);
  }
}

async function finishLogin(managerChatId, state, sendMessage) {
  const sessionString = state.client.session.save();
  db.saveSession(managerChatId, sessionString, state.phone);
  pendingLogins.delete(managerChatId);

  await sendMessage(
    "✅ Muvaffaqiyatli ulandingiz!\n\n" +
    "Endi shaxsiy akkauntingizda `.help` deb yozib, barcha buyruqlarni ko'rishingiz mumkin.\n" +
    "Sozlamalar uchun shu yerda /settings yozing."
  );

  // Userbot processini shu foydalanuvchi uchun ishga tushiramiz
  const { startUserbotForUser } = require('./userbotManager');
  await startUserbotForUser(managerChatId, sessionString);

  // Login uchun ochilgan vaqtinchalik clientni yopamiz (userbotManager o'zi yangisini ochadi)
  await state.client.destroy();
}

function cancelLogin(managerChatId) {
  const state = pendingLogins.get(managerChatId);
  if (state) {
    state.client.destroy().catch(() => {});
    pendingLogins.delete(managerChatId);
    return true;
  }
  return false;
}

function hasPendingLogin(managerChatId) {
  return pendingLogins.has(managerChatId);
}

function getPendingStep(managerChatId) {
  const state = pendingLogins.get(managerChatId);
  return state ? state.step : null;
}

module.exports = {
  startLogin,
  submitCode,
  submitPassword,
  cancelLogin,
  hasPendingLogin,
  getPendingStep,
};
