'use strict';

// ============================================================
// 2048 Solver — 3×3 native row evaluation (ported from C++)
// ============================================================

const TILE_WEIGHT_MAP = [0, 2, 4, 8, 16, 32, 64, 128, 248, 388, 488, 518, 519, 519, 519, 520];

// -------- Row evaluation for N-tile rows (generalized from diffs_evaluation_func) --------
// Original function evaluates 4-tile rows. This generalizes to N tiles.
function evaluateRowN(line) {
  const N = line.length;
  let score_dpdf = line[0];
  for (let x = 0; x < N - 1; x++) {
    if (line[x] < line[x + 1]) {
      if (line[x] > 400) {
        score_dpdf += (line[x] << 1) + (line[x + 1] - line[x]) * x;
      } else if (line[x] > 300 && x === 1 && line[0] > line[1]) {
        score_dpdf += (line[x] << 1);
      } else {
        score_dpdf -= (line[x + 1] - line[x]) << 3;
        score_dpdf -= line[x + 1] * 3;
        if (x < N - 2 && line[x + 2] !== undefined && line[x + 2] < line[x + 1] && line[x + 1] > 30) {
          score_dpdf -= Math.max(80, line[x + 1]);
        }
      }
    } else if (x < N - 2) {
      score_dpdf += line[x + 1] + line[x];
    } else {
      score_dpdf += (line[x + 1] + line[x]) * 0.5;
    }
  }
  // Bonus for large tile patterns (adapted: first tile huge, ordered well)
  if (N >= 4 && line[0] > 400 && line[1] > 300 && line[2] > 200 &&
      line[2] > line[3] && line[3] < 300) {
    score_dpdf += line[3] >> 2;
  }

  // t calculation (adapted: edges should be bigger than the gap)
  const minEdges = Math.min(line[0], line[N - 1]);
  let score_t;
  if (minEdges < 32) {
    score_t = -16384;
  } else if ((line[0] < line[1] && line[0] < 400) ||
             (line[N - 1] < line[N - 2] && line[N - 1] < 400)) {
    const maxMid = N > 2 ? Math.max(...line.slice(1, N - 1)) : 0;
    score_t = -(maxMid * 10);
  } else {
    const maxMid = N > 2 ? Math.max(...line.slice(1, N - 1)) : 0;
    const minMid = N > 2 ? Math.min(...line.slice(1, N - 1)) : 160;
    score_t = (line[0] * 1.8 + line[N - 1] * 1.8) + maxMid * 1.5 + Math.min(160, minMid) * 2.5;
    if (minMid < 8) score_t -= 60;
  }

  let zeroCount = 0;
  for (let k = 0; k < N; k++) if (line[k] === 0) zeroCount++;

  let penalty = 0;
  if (line[0] > 100) {
    const sumRest = line.slice(1).reduce((a, b) => a + b, 0);
    if ((zeroCount > 1 && sumRest < 32) || sumRest < 12) penalty = 4;
  }

  return Math.max(score_dpdf, score_t) / 4 - penalty;
}

// -------- Evaluate entire board (ported from AIPlayer::evaluate) --------
function evaluateBoard(board, size) {
  // Build weight-mapped board
  const w = Array.from({ length: size }, () => Array(size).fill(0));
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      w[r][c] = board[r][c] === 0 ? 0 : TILE_WEIGHT_MAP[Math.round(Math.log2(board[r][c]))];

  // Score rows (forward)
  let score_x1 = 0, score_x2 = 0;
  for (let r = 0; r < size; r++) {
    const row = w[r].slice();
    score_x1 += evaluateRowN(row);
    score_x2 += evaluateRowN(row.reverse());
  }

  // Score columns by transposing
  let score_y1 = 0, score_y2 = 0;
  for (let c = 0; c < size; c++) {
    const col = [];
    for (let r = 0; r < size; r++) col.push(w[r][c]);
    score_y1 += evaluateRowN(col);
    score_y2 += evaluateRowN(col.reverse());
  }

  return Math.max(score_x1, score_x2) + Math.max(score_y1, score_y2);
}

// ============================================================
// 2048 Game Engine
// ============================================================
function createBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function cloneBoard(board) {
  return board.map(r => [...r]);
}

function addRandomTile(board) {
  const e = [];
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board[r].length; c++)
      if (board[r][c] === 0) e.push({ r, c });
  if (e.length === 0) return false;
  const p = e[Math.floor(Math.random() * e.length)];
  board[p.r][p.c] = Math.random() < 0.9 ? 2 : 4;
  return true;
}

function initBoard(size) {
  const b = createBoard(size);
  addRandomTile(b); addRandomTile(b);
  return b;
}

function slide(line) {
  let a = line.filter(v => v !== 0);
  let s = 0;
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] === a[i + 1]) { a[i] *= 2; s += a[i]; a[i + 1] = 0; i++; }
  }
  return { l: a.filter(v => v !== 0), s };
}

function applyMove(board, dir) {
  const size = board.length;
  const nb = createBoard(size);
  let score = 0;
  for (let r = 0; r < size; r++) {
    let line;
    if (dir === 'left') line = board[r];
    else if (dir === 'right') line = [...board[r]].reverse();
    else if (dir === 'up') line = board.map(row => row[r]);
    else line = board.map(row => row[r]).reverse();
    const res = slide(line);
    for (let i = 0; i < res.l.length; i++) {
      if (dir === 'left') nb[r][i] = res.l[i];
      else if (dir === 'right') nb[r][size - 1 - i] = res.l[i];
      else if (dir === 'up') nb[i][r] = res.l[i];
      else nb[size - 1 - i][r] = res.l[i];
    }
    score += res.s;
  }
  let changed = false;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (nb[r][c] !== board[r][c]) changed = true;
  return { board: nb, score, changed };
}

function isGameOver(board) {
  return ['up','down','left','right'].every(d => !applyMove(board, d).changed);
}

function hasWon(board, target) {
  return board.some(row => row.some(v => v >= target));
}

function emptyCells(board) {
  const e = [];
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board[r].length; c++)
      if (board[r][c] === 0) e.push({ r, c });
  return e;
}

// ============================================================
// Search (Expectimax with Cache)
// ============================================================
function processScore(s) {
  if (s < 200) return Math.max(0, (s >> 2) - 10);
  if (s < 500) return (s >> 1) - 12;
  if (s < 1000) return (s >> 1) + 144;
  if (s < 2000) return s + 600;
  return 3000;
}

function boardKey(board) {
  // Fast hash of board state
  let h = 0;
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board[r].length; c++)
      h = ((h * 31) | 0) + (board[r][c] === 0 ? 0 : Math.round(Math.log2(board[r][c])));
  return h >>> 0;
}

function search0(board, size) {
  const dirs = ['up','down','left','right'];
  let best = -1e9;
  for (const d of dirs) {
    const { board: nb, changed, score } = applyMove(board, d);
    if (!changed) continue;
    const v = evaluateBoard(nb, size) + processScore(score);
    if (v > best) best = v;
  }
  return best;
}

function searchChance(board, depth, size, cache) {
  if (depth <= 0) return search0(board, size);

  const empties = emptyCells(board);
  if (empties.length === 0) return evaluateBoard(board, size);

  // Adaptive depth
  let effDepth = depth;
  if (empties.length > 5) effDepth = Math.min(effDepth, 3);
  else if (empties.length > 4 && size >= 4) effDepth = Math.min(effDepth, 4);

  // Cache
  const key = (boardKey(board) * 31 + effDepth) >>> 0;
  if (cache.has(key)) return cache.get(key);

  // Sample empties (all for small boards)
  const n = size <= 3 ? empties.length : Math.min(empties.length, 6);
  const sampled = empties.sort(() => Math.random() - 0.5).slice(0, n);

  let total = 0;
  for (const p of sampled) {
    const b2 = cloneBoard(board); b2[p.r][p.c] = 2;
    total += 0.9 * searchPlayer(b2, effDepth - 1, size, cache);
    const b4 = cloneBoard(board); b4[p.r][p.c] = 4;
    total += 0.1 * searchPlayer(b4, effDepth - 1, size, cache);
  }

  const result = Math.round(total / n);
  cache.set(key, result);
  return result;
}

function searchPlayer(board, depth, size, cache) {
  if (depth <= 0) return search0(board, size);

  const dirs = ['up','down','left','right'];
  let best = -1e9;
  for (const d of dirs) {
    const { board: nb, changed, score } = applyMove(board, d);
    if (!changed) continue;
    const v = searchChance(nb, depth, size, cache) + processScore(score);
    if (v > best) best = v;
  }
  return best === -1e9 ? -1e9 : best;
}

function getBestMove(board, depth, size) {
  const baseDepth = Math.max(1, Math.min(depth || 3, 5));
  const empties = emptyCells(board).length;
  const total = size * size;
  let d = baseDepth;
  if (empties >= total * 0.6) d = Math.max(1, baseDepth - 1);
  else if (empties <= 2 && size <= 4) d = Math.min(5, baseDepth + 1);

  const cache = new Map();
  const dirs = ['up','down','left','right'];
  let bestDir = null, bestScore = -1e9;

  for (const dir of dirs) {
    const { board: nb, changed, score } = applyMove(board, dir);
    if (!changed) continue;
    const v = searchChance(nb, d, size, cache) + processScore(score);
    if (v > bestScore) { bestScore = v; bestDir = dir; }
  }
  return bestDir ? { direction: bestDir, score: bestScore, depth: d } : null;
}

// ============================================================
// Game runner
// ============================================================
function playGame(size, target, depth) {
  const board = initBoard(size);
  let score = 0, moves = 0;
  const startNs = process.hrtime.bigint();

  while (true) {
    const best = getBestMove(board, depth, size);
    if (!best || !best.direction) break;
    const { board: nb, score: s, changed } = applyMove(board, best.direction);
    if (!changed) break;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        board[r][c] = nb[r][c];
    score += s;
    moves++;
    addRandomTile(board);
    if (hasWon(board, target)) {
      return { won: true, score, moves, maxTile: target,
               ms: Number((process.hrtime.bigint() - startNs) / 1000000n) };
    }
    if (isGameOver(board)) {
      let mt = 0;
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (board[r][c] > mt) mt = board[r][c];
      return { won: false, score, moves, maxTile: mt,
               ms: Number((process.hrtime.bigint() - startNs) / 1000000n) };
    }
  }
  let mt = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (board[r][c] > mt) mt = board[r][c];
  return { won: false, score, moves, maxTile: mt,
           ms: Number((process.hrtime.bigint() - startNs) / 1000000n) };
}

// ============================================================
// Batch test
// ============================================================
function test(args) {
  const size = parseInt(args[0]) || 3;
  const target = parseInt(args[1]) || 512;
  const depth = parseInt(args[2]) || 3;
  const games = parseInt(args[3]) || 100;

  console.log(`\n=== 2048 Solver Test ===`);
  console.log(`Board: ${size}×${size}  Target: ${target}  Depth: ${depth}  Games: ${games}\n`);

  let won = 0, totalScore = 0, totalMoves = 0, totalMaxTile = 0, totalMs = 0;
  const maxTiles = {};
  const totalStart = process.hrtime.bigint();
  const reportEvery = Math.max(1, Math.floor(games / 10));

  for (let i = 0; i < games; i++) {
    const r = playGame(size, target, depth);
    totalScore += r.score; totalMoves += r.moves;
    totalMaxTile += r.maxTile; totalMs += r.ms;
    maxTiles[r.maxTile] = (maxTiles[r.maxTile] || 0) + 1;
    if (r.won) won++;

    if ((i + 1) % reportEvery === 0 || i === games - 1) {
      const n = i + 1;
      console.log(`[${String(n).padStart(4)}/${games}] win:${(won/n*100).toFixed(1)}% avg_s:${Math.round(totalScore/n)} avg_m:${Math.round(totalMoves/n)} avg_ms:${Math.round(totalMs/n)}`);
    }
  }

  const elapsed = (Number((process.hrtime.bigint() - totalStart) / 1000000000n)).toFixed(1);
  console.log(`\n--- Results ---`);
  console.log(`Games:     ${games}`);
  console.log(`Won:       ${won} (${(won/games*100).toFixed(1)}%)`);
  console.log(`Avg score: ${Math.round(totalScore / games)}`);
  console.log(`Avg moves: ${Math.round(totalMoves / games)}`);
  console.log(`Avg max:   ${Math.round(totalMaxTile / games)}`);
  console.log(`Avg ms:    ${Math.round(totalMs / games)}`);
  console.log(`Total:     ${elapsed}s`);
  console.log(`Max tiles: ${Object.entries(maxTiles).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([k,v])=>k+':'+v).join(' ')}`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node solver_test.js <size> <target> <depth> <games>');
  console.log('Defaults: 3 512 3 100');
  console.log('\nRunning with defaults...');
}
test(args.length ? args : ['3', '512', '3', '100']);
