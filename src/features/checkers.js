// Oddiy 8x8 shashka (checkers) o'yini - inline tugmalar orqali.
// Diqqat: bu GramJS userbot xabarlarida ishlaydi (Api.messages.SendMedia/EditMessage
// orqali emas, chat.sendMessage bilan callback-style tugmalar), lekin GramJS'da
// callback_query eventlari asosan botlar uchun ishlaydi. Userbot hisoblarida
// tugmalarni faqat KO'RISH mumkin, lekin userbot ularni "bosish" imkoniyatiga
// egaligini o'zi bildirmaydi (mijoz kliklaganda BotCallback keladi, buni faqat
// bot akkauntlar to'liq ishlata oladi). Shu sabab, shashka o'yini uchun eng
// ishonchli yechim - o'yin taklifini oddiy inline tugma (URL yoki callback)
// bilan yuborish va harakatlarni "." buyruqlari orqali qabul qilish
// (masalan .shashka_move a3 b4). Quyida taklif xabari va state saqlash mantiqi bor.

const { Api } = require('telegram');

// gameId -> { board, turn, playerWhite, playerBlack, chatId }
const games = new Map();

function createInitialBoard() {
  // 8x8, 0 = bo'sh, 1 = oq (⚪️), 2 = qora (⚫️)
  const board = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = 2; // qora yuqorida
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = 1; // oq pastda
    }
  }
  return board;
}

function renderBoard(board) {
  const symbols = { 0: '⬛️', 1: '⚪️', 2: '⚫️' };
  return board.map((row) => row.map((cell) => symbols[cell]).join('')).join('\n');
}

/**
 * Yangi shashka taklifini yuboradi. So'rovda ko'rsatilgandek matn formatida.
 */
async function sendChallenge(client, msg, opponentMention) {
  const me = await client.getMe();
  const gameId = `${msg.chatId}_${Date.now()}`;

  games.set(gameId, {
    board: createInitialBoard(),
    turn: 1, // 1 = oq boshlaydi
    challenger: me.id.toString(),
    opponent: null,
    chatId: msg.chatId.toString(),
  });

  const text =
    `🎲 @${me.username || me.firstName} shashka o'ynamoqchi. Sherik kutilmoqda...\n\n` +
    renderBoard(games.get(gameId).board) +
    `\n\n♟ Harakat qilish uchun: \`.shashka_move ${gameId} d3 c4\` (qatordan-ustunga format bilan)`;

  await client.sendMessage(msg.peerId, {
    message: text,
    buttons: undefined, // GramJS userbot uchun haqiqiy inline callback tugmalari cheklangan,
    // shuning uchun "Bellashish" harakati alohida buyruq orqali amalga oshiriladi.
  });

  return gameId;
}

/**
 * O'yinga qo'shilish (ikkinchi o'yinchi).
 */
function joinGame(gameId, playerId) {
  const game = games.get(gameId);
  if (!game) return null;
  if (game.opponent && game.opponent !== playerId) return null;
  game.opponent = playerId;
  return game;
}

function getGame(gameId) {
  return games.get(gameId);
}

/**
 * Oddiy yurish: from/to koordinatalar "a1"-"h8" formatida.
 * Faqat bitta katakka diagonal siljish yoki oddiy "olib ketish" (jump) tekshiriladi.
 * To'liq shashka qoidalari (majburiy yeyish, damka va h.k.) soddalashtirilgan.
 */
function parsePos(pos) {
  const col = pos.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = 8 - parseInt(pos[1], 10);
  return { row, col };
}

function move(gameId, fromStr, toStr) {
  const game = games.get(gameId);
  if (!game) return { ok: false, error: "O'yin topilmadi." };

  const from = parsePos(fromStr);
  const to = parsePos(toStr);
  const piece = game.board[from.row]?.[from.col];

  if (!piece) return { ok: false, error: "Boshlang'ich katakda dona yo'q." };
  if (piece !== game.turn) return { ok: false, error: "Bu sizning donangiz emas yoki navbat sizda emas." };
  if (game.board[to.row]?.[to.col] !== 0) return { ok: false, error: 'Maqsad katak bo\'sh emas.' };

  const rowDiff = to.row - from.row;
  const colDiff = Math.abs(to.col - from.col);
  const direction = piece === 1 ? -1 : 1; // oq yuqoriga, qora pastga yuradi

  if (Math.abs(rowDiff) === 1 && colDiff === 1 && Math.sign(rowDiff) === direction) {
    // oddiy yurish
    game.board[to.row][to.col] = piece;
    game.board[from.row][from.col] = 0;
  } else if (Math.abs(rowDiff) === 2 && colDiff === 2 && Math.sign(rowDiff) === direction) {
    // olib ketish (jump)
    const midRow = (from.row + to.row) / 2;
    const midCol = (from.col + to.col) / 2;
    const midPiece = game.board[midRow][midCol];
    if (midPiece === 0 || midPiece === piece) {
      return { ok: false, error: "Bu yo'nalishda yeb bo'lmaydi." };
    }
    game.board[to.row][to.col] = piece;
    game.board[from.row][from.col] = 0;
    game.board[midRow][midCol] = 0;
  } else {
    return { ok: false, error: "Noto'g'ri yurish." };
  }

  game.turn = game.turn === 1 ? 2 : 1;
  return { ok: true, board: game.board, turn: game.turn };
}

module.exports = { sendChallenge, joinGame, getGame, move, renderBoard };
