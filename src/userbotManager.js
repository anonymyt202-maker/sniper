const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const { Api } = require('telegram');
const Groq = require('groq-sdk');
const fs = require('fs');

const db = require('./db');
const autoStatus = require('./features/autoStatus');
const profileClock = require('./features/profileClock');
const rates = require('./features/rates');
const downloader = require('./features/downloader');
const emojiText = require('./features/emojiText');

const API_ID = parseInt(process.env.API_ID, 10);
const API_HASH = process.env.API_HASH;
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 30000, // 30s
  maxRetries: 3,   // Railway tarmog'ida vaqti-vaqti bilan uchraydigan "Premature close" kabi xatoliklarni avtomatik qayta urinadi
});
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// managerChatId -> TelegramClient (foydalanuvchining shaxsiy userbot instance'i)
const activeClients = new Map();

const DICE_EMOJIS = ['🎲', '🎯', '🏀', '⚽', '🎳', '🎰'];

async function askGroq(prompt, provider = 'chatgpt') {
  const systemPrompt =
    provider === 'grok'
      ? "Siz Grok uslubidagi hazilkash, to'g'ridan-to'g'ri javob beruvchi AI'siz. O'zbek tilida javob bering."
      : "Siz foydali AI-yordamchisiz (ChatGPT uslubida). O'zbek tilida aniq va qisqa javob bering.";

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
      });
      return completion.choices[0]?.message?.content?.trim() || '...';
    } catch (err) {
      lastError = err;
      const transient =
        err.message?.includes('Premature close') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('ETIMEDOUT') ||
        err.status === 503 ||
        err.status === 502;
      if (!transient || attempt === 3) throw err;
      console.warn(`[askGroq] urinish ${attempt} muvaffaqiyatsiz (${err.message}), qayta urinilmoqda...`);
      await new Promise((r) => setTimeout(r, 800 * attempt)); // 0.8s, 1.6s
    }
  }
  throw lastError;
}

async function typeAnimation(msg, text) {
  let current = '';
  for (const ch of text) {
    current += ch;
    try {
      await msg.edit({ text: current });
    } catch (e) {
      // tez-tez edit qilish flood-limitga tutilishi mumkin, sekinroq davom etamiz
    }
    await new Promise((r) => setTimeout(r, 60));
  }
}

const HELP_TEXT = `🤖 **Buyruqlar ro'yxati** 🤖

.help – 📖 Qo'llanma
.ping – 🚀 Tezlik
.settings – ⚙ Sozlamalar (manager botda)
.add_message <matn> – ➕ Auto xabar qo'shish
.list_messages – 💬 Auto xabarlarni ko'rish
.info – 👥 Ikki tomon haqida ma'lumot
.kurs – 💱 Valyuta narxlari
.crypto – 💱 Kripto narxlari
.type <matn> – 📝 Harfma-harf yozish animatsiyasi
.music <nom> – 🎵 Musiqa qidirish va yuklash
.ai <savol> – 🤖 ChatGPT’ga savol
.grok <savol> – 🪐 Grok’ga savol
.down <link> – ⬇️ IG/YouTube/TikTok/FB yuklab olish
.soat – 🕔 Profilga soat qo'yish (yoqish)
.soat_off – 🕔 Profil soatini o'chirish
.online – 🗂 24/7 online rejim yoqish
.offline – 🗂 24/7 online rejim o'chirish
.status <matn> – ✅ Bio/statusni o'zgartirish
.auto_status_on – 💍 Auto status (aylanuvchi) yoqish
.auto_status_off – 💍 Auto status o'chirish
.cheklist <qatorlar> – ☑️ Cheklist tuzish
.emoji <matn> – 🔤 Bir martalik random stil
.emoji1..emoji6 <matn> – 🔤 Bir martalik aniq stil
.emoji on – ✨ Avto-emoji rejimini yoqish (barcha keyingi xabarlaringiz avtomatik bezaladi)
.emoji on 1..6 – ✨ Avto-emoji rejimini aniq stil bilan yoqish
.emoji off – ✨ Avto-emoji rejimini o'chirish
.dice – 🎲 Random dice
.dice1..dice6 – 🎲 Aniq dice`;

async function startUserbotForUser(managerChatId, sessionString) {
  // Eski instance bo'lsa, avval to'xtatamiz
  if (activeClients.has(managerChatId)) {
    try {
      await activeClients.get(managerChatId).destroy();
    } catch (e) {}
    activeClients.delete(managerChatId);
  }

  const client = new TelegramClient(new StringSession(sessionString), API_ID, API_HASH, {
    connectionRetries: 5,
  });
  await client.connect();
  activeClients.set(managerChatId, client);

  // Sozlamalarga qarab avtomatik funksiyalarni ishga tushiramiz
  const settings = db.getSettings(managerChatId);
  if (settings.auto_status_running) {
    autoStatus.startAutoStatus(client, managerChatId);
  }
  if (settings.profile_clock) {
    profileClock.startProfileClock(client, managerChatId);
  }
  if (settings.online_247) {
    try {
      await client.invoke(new Api.account.UpdateStatus({ offline: false }));
    } catch (e) {}
  }

  client.addEventHandler(async (event) => {
    await handleUserbotMessage(client, managerChatId, event);
  }, new NewMessage({ outgoing: true })); // faqat o'zi yozgan xabarlarni (buyruqlarni) tinglaymiz

  client.addEventHandler(async (event) => {
    await handleIncomingMessage(client, managerChatId, event);
  }, new NewMessage({ incoming: true })); // "Hammaga auto javob berish" sozlamasi uchun

  console.log(`✅ Userbot ishga tushdi: manager_chat_id=${managerChatId}`);
  return client;
}

async function stopUserbotForUser(managerChatId) {
  const client = activeClients.get(managerChatId);
  if (client) {
    autoStatus.stopAutoStatus(managerChatId);
    await profileClock.stopProfileClock(client, managerChatId);
    await client.destroy();
    activeClients.delete(managerChatId);
  }
}

function getClient(managerChatId) {
  return activeClients.get(managerChatId);
}

async function handleUserbotMessage(client, managerChatId, event) {
  const msg = event.message;
  const text = msg.message || '';

  // Buyruq (.) bilan boshlanmagan oddiy chiquvchi xabar - avto-emoji rejimi yoqilgan bo'lsa bezaymiz
  if (!text.startsWith('.')) {
    try {
      const settings = db.getSettings(managerChatId);
      if (settings.auto_emoji_running && text.trim()) {
        const style = settings.auto_emoji_style || 'random';
        const styled =
          style === 'random'
            ? emojiText.randomStyle(text)
            : emojiText.applyStyle(parseInt(style, 10), text);

        // O'zgarish bo'lmasa (masalan matn faqat raqam/emoji bo'lsa) qayta edit qilib
        // urinmaymiz - flood va keraksiz xatolarni oldini olamiz.
        if (styled && styled !== text) {
          await msg.edit({ text: styled });
        }
      }
    } catch (err) {
      console.error(`[autoEmoji:${managerChatId}]`, err.message);
    }
    return;
  }

  const [cmdRaw, ...rest] = text.slice(1).split(' ');
  const cmd = cmdRaw.toLowerCase();
  const argText = rest.join(' ').trim();

  try {
    switch (true) {
      case cmd === 'help': {
        await msg.edit({ text: HELP_TEXT });
        break;
      }

      case cmd === 'ping': {
        const start = Date.now();
        await msg.edit({ text: '🚀 Hisoblanmoqda...' });
        const ms = Date.now() - start;
        await msg.edit({ text: `🚀 Pong! \`${ms}ms\`` });
        break;
      }

      case cmd === 'add_message': {
        if (!argText) {
          await msg.edit({ text: "❗ Matn kiriting: `.add_message Salom!`" });
          break;
        }
        db.addAutoMessage(managerChatId, argText);
        await msg.edit({ text: `✅ Auto xabar qo'shildi:\n"${argText}"` });
        break;
      }

      case cmd === 'list_messages': {
        const list = db.listAutoMessages(managerChatId);
        if (list.length === 0) {
          await msg.edit({ text: "💬 Hali auto xabarlar yo'q." });
          break;
        }
        const text2 = list.map((m) => `#${m.id} — ${m.text}`).join('\n');
        await msg.edit({ text: `💬 **Auto xabarlar:**\n${text2}` });
        break;
      }

      case cmd === 'info': {
        const me = await client.getMe();
        let peerInfo = '';
        if (msg.isReply) {
          const replied = await msg.getReplyMessage();
          const sender = await replied.getSender();
          peerInfo = `\n\n👤 **Suhbatdosh:** ${sender.firstName || ''} ${sender.lastName || ''} (ID: ${sender.id})`;
        }
        await msg.edit({
          text: `👥 **Ma'lumot**\n\n🙋 **Siz:** ${me.firstName || ''} ${me.lastName || ''} (@${me.username || 'yo\'q'})\nID: ${me.id}${peerInfo}`,
        });
        break;
      }

      case cmd === 'kurs': {
        await msg.edit({ text: '⏳ Kurslar olinmoqda...' });
        const text2 = await rates.getCurrencyRates();
        await msg.edit({ text: text2 });
        break;
      }

      case cmd === 'crypto': {
        await msg.edit({ text: '⏳ Kripto narxlari olinmoqda...' });
        const text2 = await rates.getCryptoRates();
        await msg.edit({ text: text2 });
        break;
      }

      case cmd === 'type': {
        if (!argText) {
          await msg.edit({ text: '❗ Matn kiriting: `.type Salom dunyo`' });
          break;
        }
        await typeAnimation(msg, argText);
        break;
      }

      case cmd === 'music': {
        if (!argText) {
          await msg.edit({ text: '❗ Qo\'shiq nomi kiriting: `.music Xamdam`' });
          break;
        }
        await msg.edit({ text: `🎵 "${argText}" qidirilmoqda...` });
        try {
          const filePath = await downloader.downloadMusic(argText);
          await client.sendFile(msg.peerId, {
            file: filePath,
            caption: `🎵 ${argText}`,
            replyTo: msg.id,
          });
          downloader.cleanupFile(filePath);
          await msg.delete({ revoke: true });
        } catch (err) {
          await msg.edit({ text: `❌ Xatolik: ${err.message}` });
        }
        break;
      }

      case cmd === 'ai': {
        if (!argText) {
          await msg.edit({ text: '❗ Savol kiriting: `.ai Salom, qandaysan?`' });
          break;
        }
        await msg.edit({ text: '🤖 O\'ylanmoqda...' });
        const answer = await askGroq(argText, 'chatgpt');
        await msg.edit({ text: `🤖 ${answer}` });
        break;
      }

      case cmd === 'grok': {
        if (!argText) {
          await msg.edit({ text: '❗ Savol kiriting: `.grok Salom, qandaysan?`' });
          break;
        }
        await msg.edit({ text: '🪐 O\'ylanmoqda...' });
        const answer = await askGroq(argText, 'grok');
        await msg.edit({ text: `🪐 ${answer}` });
        break;
      }

      case cmd === 'img' || cmd === 'rasm': {
        await msg.edit({
          text: "🎇 Rasm generatsiya hozircha ulanmagan. Bu funksiyani keyinroq faollashtirish mumkin.",
        });
        break;
      }

      case cmd === 'down': {
        if (!argText) {
          await msg.edit({ text: '❗ Link kiriting: `.down https://...`' });
          break;
        }
        await msg.edit({ text: '⬇️ Yuklab olinmoqda...' });
        try {
          const filePath = await downloader.downloadMedia(argText);
          await client.sendFile(msg.peerId, {
            file: filePath,
            replyTo: msg.id,
          });
          downloader.cleanupFile(filePath);
          await msg.delete({ revoke: true });
        } catch (err) {
          await msg.edit({ text: `❌ Xatolik: ${err.message}` });
        }
        break;
      }

      case cmd === 'soat': {
        db.updateSetting(managerChatId, 'profile_clock', 1);
        await profileClock.startProfileClock(client, managerChatId);
        await msg.edit({ text: '🕔 Profil soati yoqildi.' });
        break;
      }

      case cmd === 'soat_off': {
        db.updateSetting(managerChatId, 'profile_clock', 0);
        await profileClock.stopProfileClock(client, managerChatId);
        await msg.edit({ text: '🕔 Profil soati o\'chirildi.' });
        break;
      }

      case cmd === 'online': {
        db.updateSetting(managerChatId, 'online_247', 1);
        await client.invoke(new Api.account.UpdateStatus({ offline: false }));
        await msg.edit({ text: '🗂 24/7 online rejim yoqildi.' });
        break;
      }

      case cmd === 'offline': {
        db.updateSetting(managerChatId, 'online_247', 0);
        await client.invoke(new Api.account.UpdateStatus({ offline: true }));
        await msg.edit({ text: '🗂 24/7 online rejim o\'chirildi.' });
        break;
      }

      case cmd === 'status': {
        if (!argText) {
          await msg.edit({ text: '❗ Matn kiriting: `.status Ishlaymiz!`' });
          break;
        }
        await client.invoke(new Api.account.UpdateProfile({ about: argText }));
        await msg.edit({ text: `✅ Status o'zgartirildi: ${argText}` });
        break;
      }

      case cmd === 'auto_status_on': {
        db.updateSetting(managerChatId, 'auto_status_running', 1);
        await autoStatus.startAutoStatus(client, managerChatId);
        await msg.edit({ text: '💍 Auto status yoqildi (har 3.5 soniyada).' });
        break;
      }

      case cmd === 'auto_status_off': {
        db.updateSetting(managerChatId, 'auto_status_running', 0);
        autoStatus.stopAutoStatus(managerChatId);
        await msg.edit({ text: '💍 Auto status o\'chirildi.' });
        break;
      }

      case cmd === 'cheklist': {
        if (!argText) {
          await msg.edit({ text: "❗ Vazifalarni har birini yangi qatorda yozing:\n`.cheklist\nvazifa1\nvazifa2`" });
          break;
        }
        const items = argText.split('\n').filter(Boolean);
        const listText = items.map((it) => `☐ ${it}`).join('\n');
        await msg.edit({ text: `☑️ **Cheklist:**\n${listText}` });
        break;
      }

      case cmd === 'emoji': {
        const sub = rest[0]?.toLowerCase();

        if (sub === 'on') {
          const styleArg = rest[1];
          let style = 'random';
          if (styleArg && /^[1-6]$/.test(styleArg)) {
            style = styleArg;
          }
          db.updateSetting(managerChatId, 'auto_emoji_running', 1);
          db.updateSetting(managerChatId, 'auto_emoji_style', style);
          await msg.edit({
            text: `✨ Avto-emoji rejimi yoqildi (stil: ${style === 'random' ? 'random' : `#${style}`}).\nEndi barcha yozgan xabarlaringiz avtomatik bezaladi.`,
          });
          break;
        }

        if (sub === 'off') {
          db.updateSetting(managerChatId, 'auto_emoji_running', 0);
          await msg.edit({ text: '✨ Avto-emoji rejimi o\'chirildi.' });
          break;
        }

        // Bir martalik: .emoji <matn>
        if (!argText) {
          await msg.edit({ text: "❗ Matn kiriting: `.emoji Salom` yoki rejim uchun `.emoji on` / `.emoji off`" });
          break;
        }
        await msg.edit({ text: emojiText.randomStyle(argText) });
        break;
      }

      case /^emoji[1-6]$/.test(cmd): {
        if (!argText) {
          await msg.edit({ text: `❗ Matn kiriting: \`.${cmd} Salom\`` });
          break;
        }
        const styleNum = parseInt(cmd.replace('emoji', ''), 10);
        await msg.edit({ text: emojiText.applyStyle(styleNum, argText) });
        break;
      }

      case cmd === 'dice': {
        const emoji = DICE_EMOJIS[Math.floor(Math.random() * DICE_EMOJIS.length)];
        await msg.delete({ revoke: true });
        await client.invoke(
          new Api.messages.SendMedia({
            peer: msg.peerId,
            media: new Api.InputMediaDice({ emoticon: emoji }),
            message: '',
            randomId: BigInt(Math.floor(Math.random() * 1e15)),
          })
        );
        break;
      }

      case /^dice[1-6]$/.test(cmd): {
        const idx = parseInt(cmd.replace('dice', ''), 10) - 1;
        const emoji = DICE_EMOJIS[idx];
        await msg.delete({ revoke: true });
        await client.invoke(
          new Api.messages.SendMedia({
            peer: msg.peerId,
            media: new Api.InputMediaDice({ emoticon: emoji }),
            message: '',
            randomId: BigInt(Math.floor(Math.random() * 1e15)),
          })
        );
        break;
      }

      default:
        // Tanilmagan komanda - hech narsa qilmaymiz
        break;
    }
  } catch (err) {
    console.error(`[userbot:${managerChatId}] cmd=${cmd} error:`, err.message);
    try {
      await msg.edit({ text: `❌ Xatolik yuz berdi: ${err.message}` });
    } catch (e) {}
  }
}

async function handleIncomingMessage(client, managerChatId, event) {
  const msg = event.message;
  const text = msg.message || '';
  if (!text || text.startsWith('.')) return; // bo'sh yoki buyruq bo'lsa e'tiborsiz

  const settings = db.getSettings(managerChatId);

  // "Hammaga auto javob berish (ChatGPT)" yoqilgan bo'lsa
  if (settings.auto_reply_all) {
    try {
      if (settings.typing_mode) {
        await client.invoke(
          new Api.messages.SetTyping({ peer: msg.peerId, action: new Api.SendMessageTypingAction() })
        );
      }
      const answer = await askGroq(text, settings.ai_provider);
      await client.sendMessage(msg.peerId, { message: answer, replyTo: settings.reply_mode ? msg.id : undefined });

      if (settings.read_on_reply) {
        try {
          await client.invoke(new Api.messages.ReadHistory({ peer: msg.peerId, maxId: msg.id }));
        } catch (e) {}
      }
    } catch (err) {
      console.error(`[autoReplyAll:${managerChatId}]`, err.message);
    }
    return;
  }

  // Auto xabarlar (agar sozlangan bo'lsa) - hozircha shart-sharoitsiz, xohlasangiz
  // kengaytirib "faqat yangi chatga birinchi xabar kelganda" kabi mantiq qo'shish mumkin.
}

module.exports = {
  startUserbotForUser,
  stopUserbotForUser,
  getClient,
  activeClients,
};
