// Turli "premium emoji" uslubidagi matn transformerlari.
// Haqiqiy Telegram custom-emoji (premium) qo'yish uchun MessageEntityCustomEmoji
// va tegishli document_id kerak - bu yerda 6 xil unicode-based stilizatsiya beramiz,
// ular chatUtils.js da MessageEntityCustomEmoji sifatida emas, oddiy matn sifatida yuboriladi.
// Agar sizda custom emoji pack document_id lari bo'lsa, ularni EMOJI_MAP ga qo'shishingiz mumkin.

const FULLWIDTH_MAP = {};
'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => {
  FULLWIDTH_MAP[c] = String.fromCodePoint(0xff41 + i);
});
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => {
  FULLWIDTH_MAP[c] = String.fromCodePoint(0xff21 + i);
});
'0123456789'.split('').forEach((c, i) => {
  FULLWIDTH_MAP[c] = String.fromCodePoint(0xff10 + i);
});

const BOLD_MAP = {};
'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => {
  BOLD_MAP[c] = String.fromCodePoint(0x1d41a + i);
});
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => {
  BOLD_MAP[c] = String.fromCodePoint(0x1d400 + i);
});

const SCRIPT_MAP = {};
'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => {
  SCRIPT_MAP[c] = String.fromCodePoint(0x1d4ea + i);
});
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => {
  SCRIPT_MAP[c] = String.fromCodePoint(0x1d4d0 + i);
});

const DOUBLE_MAP = {};
'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => {
  DOUBLE_MAP[c] = String.fromCodePoint(0x1d552 + i);
});
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => {
  DOUBLE_MAP[c] = String.fromCodePoint(0x1d538 + i);
});

function mapText(text, map) {
  return text
    .split('')
    .map((c) => map[c] || c)
    .join('');
}

function circledText(text) {
  const map = {};
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => (map[c] = String.fromCodePoint(0x24d0 + i)));
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => (map[c] = String.fromCodePoint(0x24b6 + i)));
  return mapText(text, map);
}

function squaredText(text) {
  return text.toUpperCase().split('').map((c) => (/[A-Z]/.test(c) ? `🔲${c}` : c)).join('');
}

function frozenText(text) {
  // "🥶" uslubi - random muzlash effekti kabi harflar orasiga belgi qo'shish
  return text.split('').map((c) => (c === ' ' ? ' ' : `${c}\u0330`)).join('');
}

const styles = {
  1: (t) => mapText(t, FULLWIDTH_MAP), // .emoji1
  2: (t) => mapText(t, BOLD_MAP),       // .emoji2
  3: (t) => mapText(t, SCRIPT_MAP),     // .emoji3
  4: (t) => mapText(t, DOUBLE_MAP),     // .emoji4
  5: (t) => frozenText(t),              // .emoji5 (🥶)
  6: (t) => circledText(t),             // .emoji6
};

function applyStyle(styleNumber, text) {
  const fn = styles[styleNumber];
  if (!fn) throw new Error("Noto'g'ri stil raqami (1-6 oralig'ida bo'lishi kerak)");
  return fn(text);
}

// .emoji (raqamsiz) - random stil tanlaydi
function randomStyle(text) {
  const keys = Object.keys(styles);
  const pick = keys[Math.floor(Math.random() * keys.length)];
  return styles[pick](text);
}

module.exports = { applyStyle, randomStyle, squaredText };
