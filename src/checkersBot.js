const crypto = require('crypto');
const engine = require('./features/checkersEngine');

// gameId -> { board, turn, whitePlayerId, blackPlayerId, whiteName, blackName, chatId, messageId, vsAi, selected }
const games = new Map();

function newGameId() {
  return crypto.randomBytes(4).toString('hex');
}

function gameStatusText(game) {
  const whiteLabel = game.whiteName ? `${game.whiteName} ⚪️` : '⚪️ (bo\'sh)';
  const blackLabel = game.blackName ? `${game.blackName} ⚫️` : '⚫️ (bo\'sh)';
  const turnLabel = game.turn === 1 ? `${game.whiteName || '⚪️'} (oq)` : `${game.blackName || '⚫️'} (qora)`;
  return `🎲 Шашки\n\nИграют: ${blackLabel}, ${whiteLabel}\n\nХодит: ${turnLabel}`;
}

/**
 * Inline query handler: "@bot_username shashka" yozilganda ishga tushadi.
 */
async function handleInlineQuery(bot, query) {
  const text = (query.query || '').trim().toLowerCase();
  if (text !== 'shashka' && text !== 'шашки' && text !== '') return;

  const results = [
    {
      type: 'article',
      id: 'new_checkers_game',
      title: "♟ Shashka o'yinini boshlash",
      description: "Yangi shashka o'yini yaratish uchun bosing",
      input_message_content: {
        message_text: "🎲 Шашки\n\nЧтобы создать игру нажмите кнопку",
      },
      reply_markup: {
        inline_keyboard: [[{ text: "🎮 Bellashish", callback_data: 'sh_join_placeholder' }]],
      },
    },
  ];

  try {
    await bot.answerInlineQuery(query.id, results, { cache_time: 0 });
  } catch (err) {
    console.error('[inlineQuery]', err.message);
  }
}

/**
 * "chosen_inline_result" - foydalanuvchi natijani tanlaganda keladi, shu yerda
 * haqiqiy gameId yaratamiz va xabarni to'g'ri tugmalar bilan edit qilamiz.
 */
async function handleChosenInlineResult(bot, result) {
  if (result.result_id !== 'new_checkers_game') return;
  const inlineMessageId = result.inline_message_id;
  if (!inlineMessageId) return;

  const gameId = newGameId();
  const creator = result.from;

  games.set(gameId, {
    board: engine.createInitialBoard(),
    turn: 1,
    whitePlayerId: null,
    blackPlayerId: creator.id,
    whiteName: null,
    blackName: creator.first_name || creator.username || 'Player',
    inlineMessageId,
    vsAi: false,
    selected: null,
  });

  try {
    await bot.editMessageText(gameStatusText(games.get(gameId)), {
      inline_message_id: inlineMessageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🎮 Bellashish (⚪️ bo\'lib qo\'shilish)', callback_data: `sh_join:${gameId}` }]],
      },
    });
  } catch (err) {
    console.error('[chosenInlineResult]', err.message);
  }
}

/**
 * Barcha "sh:" prefiksli callback_query larni boshqaradi (qo'shilish, yurish, taslim bo'lish).
 */
async function handleCallbackQuery(bot, query) {
  const data = query.data;
  const userId = query.from.id;
  const userName = query.from.first_name || query.from.username || 'Player';

  if (data.startsWith('sh_join:')) {
    const gameId = data.replace('sh_join:', '');
    const game = games.get(gameId);
    if (!game) {
      await bot.answerCallbackQuery(query.id, { text: "O'yin topilmadi yoki eskirgan." });
      return;
    }
    if (game.whitePlayerId) {
      await bot.answerCallbackQuery(query.id, { text: 'Bu o\'yinga allaqachon qo\'shilishgan.' });
      return;
    }
    if (game.blackPlayerId === userId) {
      await bot.answerCallbackQuery(query.id, { text: "O'zingiz bilan o'ynay olmaysiz." });
      return;
    }
    game.whitePlayerId = userId;
    game.whiteName = userName;

    await bot.answerCallbackQuery(query.id, { text: "Qo'shildingiz! Sizning navbatingiz (oq)." });
    await renderGame(bot, gameId);
    return;
  }

  if (data.startsWith('sh_resign:')) {
    const gameId = data.replace('sh_resign:', '');
    const game = games.get(gameId);
    if (!game) {
      await bot.answerCallbackQuery(query.id, { text: "O'yin topilmadi." });
      return;
    }
    if (userId !== game.whitePlayerId && userId !== game.blackPlayerId) {
      await bot.answerCallbackQuery(query.id, { text: "Siz bu o'yinda emassiz." });
      return;
    }
    const winner = userId === game.whitePlayerId ? game.blackName : game.whiteName;
    await bot.answerCallbackQuery(query.id, { text: 'Taslim bo\'ldingiz.' });
    await editGameMessage(bot, game, `🏁 O'yin tugadi.\n\n🎉 G'olib: ${winner}`, { inline_keyboard: [] });
    games.delete(gameId);
    return;
  }

  if (data.startsWith('sh:')) {
    const [, gameId, rowStr, colStr] = data.split(':');
    const game = games.get(gameId);
    if (!game) {
      await bot.answerCallbackQuery(query.id, { text: "O'yin topilmadi yoki eskirgan." });
      return;
    }
    if (userId !== game.whitePlayerId && userId !== game.blackPlayerId) {
      await bot.answerCallbackQuery(query.id, { text: "Siz bu o'yinda ishtirokchi emassiz." });
      return;
    }

    const myPiece = userId === game.whitePlayerId ? 1 : 2;
    if (game.turn !== myPiece) {
      await bot.answerCallbackQuery(query.id, { text: 'Sizning navbatingiz emas.' });
      return;
    }

    const row = parseInt(rowStr, 10);
    const col = parseInt(colStr, 10);
    const clickedPiece = game.board[row][col];

    if (!game.selected) {
      if (clickedPiece !== myPiece) {
        await bot.answerCallbackQuery(query.id, { text: "Bu sizning donangiz emas." });
        return;
      }
      const moves = engine.possibleMoves(game.board, row, col);
      if (moves.length === 0) {
        await bot.answerCallbackQuery(query.id, { text: 'Bu dona uchun mumkin bo\'lgan yurish yo\'q.' });
        return;
      }
      game.selected = { row, col };
      await bot.answerCallbackQuery(query.id, { text: 'Dona tanlandi. Endi borar joyingizni bosing.' });
      await renderGame(bot, gameId);
      return;
    }

    // Ikkinchi bosish - agar o'sha donani qayta bossa, tanlovni bekor qiladi
    if (game.selected.row === row && game.selected.col === col) {
      game.selected = null;
      await bot.answerCallbackQuery(query.id, { text: 'Tanlov bekor qilindi.' });
      await renderGame(bot, gameId);
      return;
    }

    const moves = engine.possibleMoves(game.board, game.selected.row, game.selected.col);
    const chosen = moves.find((m) => m.row === row && m.col === col);
    if (!chosen) {
      await bot.answerCallbackQuery(query.id, { text: "Noto'g'ri yurish." });
      return;
    }

    engine.applyMove(game.board, game.selected, { row, col });
    game.selected = null;
    game.turn = game.turn === 1 ? 2 : 1;

    await bot.answerCallbackQuery(query.id);

    // G'alaba tekshiruvi
    const opponentPiece = myPiece === 1 ? 2 : 1;
    if (!engine.hasAnyPiece(game.board, opponentPiece)) {
      const winnerName = myPiece === 1 ? game.whiteName : game.blackName;
      await editGameMessage(bot, game, `🏁 O'yin tugadi!\n\n🎉 G'olib: ${winnerName}`, { inline_keyboard: [] });
      games.delete(gameId);
      return;
    }

    await renderGame(bot, gameId);

    // AI rejimida, navbat AI'ga o'tsa avtomatik yuradi
    if (game.vsAi && game.turn === 2) {
      setTimeout(() => makeAiMove(bot, gameId), 700);
    }
    return;
  }

  if (data === 'sh_join_placeholder') {
    await bot.answerCallbackQuery(query.id, { text: "O'yin hali yuklanmoqda, biroz kuting va qayta urinib ko'ring." });
    return;
  }
}

async function renderGame(bot, gameId) {
  const game = games.get(gameId);
  if (!game) return;
  const keyboard = engine.buildBoardKeyboard(gameId, game.board, game.selected);
  await editGameMessage(bot, game, gameStatusText(game), keyboard);
}

async function editGameMessage(bot, game, text, keyboard) {
  try {
    if (game.inlineMessageId) {
      await bot.editMessageText(text, { inline_message_id: game.inlineMessageId, reply_markup: keyboard });
    } else {
      await bot.editMessageText(text, { chat_id: game.chatId, message_id: game.messageId, reply_markup: keyboard });
    }
  } catch (err) {
    console.error('[editGameMessage]', err.message);
  }
}

/**
 * DM rejimi: /shashka - bot bilan (AI) o'ynash uchun oddiy xabar yuboradi (inline emas).
 */
async function startAiGame(bot, chatId, userId, userName) {
  const gameId = newGameId();
  const game = {
    board: engine.createInitialBoard(),
    turn: 1,
    whitePlayerId: userId,
    blackPlayerId: 'AI',
    whiteName: userName,
    blackName: '🤖 Bot',
    chatId,
    messageId: null,
    vsAi: true,
    selected: null,
  };
  games.set(gameId, game);

  const sent = await bot.sendMessage(chatId, gameStatusText(game), {
    reply_markup: engine.buildBoardKeyboard(gameId, game.board, null),
  });
  game.messageId = sent.message_id;
}

async function makeAiMove(bot, gameId) {
  const game = games.get(gameId);
  if (!game) return;
  const move = engine.pickAiMove(game.board, 2);
  if (!move) {
    await editGameMessage(bot, game, `🏁 O'yin tugadi!\n\n🎉 G'olib: ${game.whiteName}`, { inline_keyboard: [] });
    games.delete(gameId);
    return;
  }
  engine.applyMove(game.board, move.from, move.to);
  game.turn = 1;

  if (!engine.hasAnyPiece(game.board, 1)) {
    await editGameMessage(bot, game, `🏁 O'yin tugadi!\n\n🎉 G'olib: ${game.blackName}`, { inline_keyboard: [] });
    games.delete(gameId);
    return;
  }

  await renderGame(bot, gameId);
}

module.exports = {
  handleInlineQuery,
  handleChosenInlineResult,
  handleCallbackQuery,
  startAiGame,
};
