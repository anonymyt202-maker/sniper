const db = require('./db');

function buildSettingsKeyboard(managerChatId) {
  const s = db.getSettings(managerChatId);
  const on = (v) => (v ? 'on ✅' : 'off ❌');

  return {
    inline_keyboard: [
      [
        { text: "📝 Tahrirlanish | 🔕", callback_data: 'noop' },
        { text: "🗑 O'chirishlar | 🔕", callback_data: 'noop' },
      ],
      [
        { text: `↩️ Reply qilish | ${on(s.reply_mode)}`, callback_data: 'toggle:reply_mode' },
        { text: `✍️ Yozmoqda | ${on(s.typing_mode)}`, callback_data: 'toggle:typing_mode' },
      ],
      [
        { text: `✉️ Auto javob o'qilgan qilish | ${on(s.read_on_reply)}`, callback_data: 'toggle:read_on_reply' },
      ],
      [
        { text: `🌟 Auto status | ${on(s.auto_status_running)}`, callback_data: 'toggle:auto_status_running' },
        { text: `🌀 AI | ${s.ai_provider === 'grok' ? 'Grok' : 'ChatGPT'}`, callback_data: 'toggle:ai_provider' },
      ],
      [
        { text: `⏰ Profilga soat | ${on(s.profile_clock)}`, callback_data: 'toggle:profile_clock' },
        { text: `🟢 24/7 online | ${on(s.online_247)}`, callback_data: 'toggle:online_247' },
      ],
      [
        { text: `💬 Hammaga auto javob | ${on(s.auto_reply_all)}`, callback_data: 'toggle:auto_reply_all' },
      ],
      [
        { text: `🔤 Avto-emoji | ${on(s.auto_emoji_running)}`, callback_data: 'toggle:auto_emoji_running' },
      ],
      [
        { text: '📨 Auto xabarlar ro\'yxati', callback_data: 'list_auto_messages' },
      ],
      [
        { text: '🚪 Akkauntdan chiqish (Logout)', callback_data: 'logout' },
      ],
    ],
  };
}

module.exports = { buildSettingsKeyboard };
