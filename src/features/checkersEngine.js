// Sof shashka o'yin dvigateli (game engine) - Bot API orqali ishlatiladi.
// 1 = oq (⚪️), 2 = qora (⚫️), 0 = bo'sh katak.

function createInitialBoard() {
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

function cellSymbol(v) {
  return v === 1 ? '⚪️' : v === 2 ? '⚫️' : '⬛️';
}

function renderBoardText(board) {
  return board.map((row) => row.map(cellSymbol).join('')).join('\n');
}

/**
 * Inline keyboard uchun 8x8 tugmalar matritsasini quradi.
 * callback_data formati: "sh:<gameId>:<row>:<col>"
 */
function buildBoardKeyboard(gameId, board, selected) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    const buttonRow = [];
    for (let c = 0; c < 8; c++) {
      let label = cellSymbol(board[r][c]);
      if (selected && selected.row === r && selected.col === c) label = '🔸';
      buttonRow.push({ text: label, callback_data: `sh:${gameId}:${r}:${c}` });
    }
    rows.push(buttonRow);
  }
  rows.push([
    { text: '🏳 Taslim bo\'lish', callback_data: `sh_resign:${gameId}` },
  ]);
  return { inline_keyboard: rows };
}

function possibleMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const direction = piece === 1 ? -1 : 1;
  const moves = [];

  // Oddiy yurishlar
  for (const dc of [-1, 1]) {
    const nr = row + direction;
    const nc = col + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === 0) {
      moves.push({ row: nr, col: nc, capture: null });
    }
  }

  // Yeyish (jump) - ikkala yo'nalishda ham (orqaga yeyish odatiy shashkada ruxsat etiladi)
  for (const dr of [-1, 1]) {
    for (const dc of [-1, 1]) {
      const midR = row + dr;
      const midC = col + dc;
      const nr = row + dr * 2;
      const nc = col + dc * 2;
      if (
        nr >= 0 && nr < 8 && nc >= 0 && nc < 8 &&
        midR >= 0 && midR < 8 && midC >= 0 && midC < 8 &&
        board[nr][nc] === 0 &&
        board[midR][midC] !== 0 &&
        board[midR][midC] !== piece
      ) {
        moves.push({ row: nr, col: nc, capture: { row: midR, col: midC } });
      }
    }
  }

  return moves;
}

function applyMove(board, from, to) {
  const piece = board[from.row][from.col];
  board[to.row][to.col] = piece;
  board[from.row][from.col] = 0;
  const rowDiff = Math.abs(to.row - from.row);
  if (rowDiff === 2) {
    const midRow = (from.row + to.row) / 2;
    const midCol = (from.col + to.col) / 2;
    board[midRow][midCol] = 0;
  }
}

function hasAnyPiece(board, playerPiece) {
  return board.some((row) => row.some((c) => c === playerPiece));
}

/**
 * Berilgan o'yinchi (piece) uchun barcha mumkin bo'lgan yurishlarni topadi.
 * Qaytadi: [{ from: {row,col}, to: {row,col}, capture }]
 */
function allMovesForPlayer(board, piece) {
  const all = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === piece) {
        const moves = possibleMoves(board, r, c);
        for (const m of moves) {
          all.push({ from: { row: r, col: c }, to: { row: m.row, col: m.col }, capture: m.capture });
        }
      }
    }
  }
  return all;
}

/**
 * Juda oddiy AI: agar yeyish imkoni bo'lsa shuni bajaradi, aks holda random yurish.
 */
function pickAiMove(board, piece) {
  const moves = allMovesForPlayer(board, piece);
  if (moves.length === 0) return null;
  const captures = moves.filter((m) => m.capture);
  const pool = captures.length > 0 ? captures : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  createInitialBoard,
  renderBoardText,
  buildBoardKeyboard,
  possibleMoves,
  applyMove,
  hasAnyPiece,
  allMovesForPlayer,
  pickAiMove,
};
