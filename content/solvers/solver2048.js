'use strict';

// 2048 AI Solver — Port from 2048EndgameTablebase C++ algorithm
// Supports 3×3, 4×4, 5×5 boards.

const Solver2048 = (() => {

  // ---- TILE_WEIGHT_MAP (exact port) ---------------------------------------
  const TILE_WEIGHT_MAP = new Int32Array([
    0, 2, 4, 8, 16, 32, 64, 128, 248, 388, 488, 518, 519, 519, 519, 520,
  ]);

  // ---- Row evaluation (generalized from diffs_evaluation_func) -------------
  function evaluateRow(line) {
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
          if (x < N - 2 && line[x + 2] < line[x + 1] && line[x + 1] > 30) {
            score_dpdf -= Math.max(80, line[x + 1]);
          }
        }
      } else if (x < N - 2) {
        score_dpdf += line[x + 1] + line[x];
      } else {
        score_dpdf += (line[x + 1] + line[x]) * 0.5;
      }
    }
    if (N >= 4 && line[0] > 400 && line[1] > 300 && line[2] > 200 &&
        line[2] > line[3] && line[3] < 300) {
      score_dpdf += line[3] >> 2;
    }

    let score_t;
    const minEdges = Math.min(line[0], line[N - 1]);
    if (minEdges < 32) {
      score_t = -16384;
    } else if ((line[0] < line[1] && line[0] < 400) ||
               (line[N - 1] < line[N - 2] && line[N - 1] < 400)) {
      const maxMid = N > 2 ? Math.max(...line.slice(1, N - 1)) : 0;
      score_t = -(maxMid * 10);
    } else {
      const maxMid = N > 2 ? Math.max(...line.slice(1, N - 1)) : 0;
      const minMid = N > 2 ? Math.min(...line.slice(1, N - 1)) : 160;
      score_t = (line[0] * 1.8 + line[N - 1] * 1.8) + maxMid * 1.5 +
                 Math.min(160, minMid) * 2.5;
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

  // ---- Precomputed row eval for 4-tile rows (matching C++ _diffs_merged) ---
  const diffs4 = new Int32Array(65536 * 2);
  (function init() {
    const line = new Int32Array(4), lineRev = new Int32Array(4);
    for (let i = 0; i < 65536; i++) {
      for (let j = 0; j < 4; j++) {
        const exp = (i >> (j * 4)) & 0xF;
        line[j] = TILE_WEIGHT_MAP[exp];
        lineRev[3 - j] = TILE_WEIGHT_MAP[exp];
      }
      diffs4[i * 2] = Math.round(evaluateRow(line));
      diffs4[i * 2 + 1] = Math.round(evaluateRow(lineRev));
    }
  })();

  // ---- Board utilities ----------------------------------------------------
  function getSize(board) { return board.length; }
  function cloneBoard(board) { return board.map(r => [...r]); }

  function emptyCells(board) {
    const e = [];
    for (let r = 0; r < board.length; r++)
      for (let c = 0; c < board[r].length; c++)
        if (board[r][c] === 0) e.push({ r, c });
    return e;
  }

  // ---- Moves --------------------------------------------------------------
  function slide(line) {
    let a = []; for (const v of line) if (v !== 0) a.push(v);
    let s = 0;
    for (let i = 0; i < a.length - 1; i++) {
      if (a[i] === a[i + 1]) { a[i] *= 2; s += a[i]; a[i + 1] = 0; i++; }
    }
    return { l: a.filter(v => v !== 0), s };
  }

  function moveBoard(board, direction) {
    const size = getSize(board);
    const nb = Array.from({ length: size }, () => Array(size).fill(0));
    let score = 0;
    for (let r = 0; r < size; r++) {
      let line;
      if (direction === 'left') line = board[r];
      else if (direction === 'right') line = [...board[r]].reverse();
      else if (direction === 'up') line = board.map(row => row[r]);
      else line = board.map(row => row[r]).reverse();
      const res = slide(line);
      for (let i = 0; i < res.l.length; i++) {
        if (direction === 'left') nb[r][i] = res.l[i];
        else if (direction === 'right') nb[r][size - 1 - i] = res.l[i];
        else if (direction === 'up') nb[i][r] = res.l[i];
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

  // ---- Board encoding (for 4x4 precomputed table) -------------------------
  function encodeBoard4x4(board) {
    const size = getSize(board);
    const e = new Uint8Array(16);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        e[r * 4 + c] = board[r][c] === 0 ? 0 : Math.round(Math.log2(board[r][c]));
    return e;
  }

  function packRows4(enc) {
    const rows = new Uint16Array(4);
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let c = 0; c < 4; c++) v |= (enc[r * 4 + c] & 0xF) << (c * 4);
      rows[r] = v;
    }
    return rows;
  }

  function reverseRows4(rows) {
    const rev = new Uint16Array(4);
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let c = 0; c < 4; c++) v |= ((rows[r] >> (c * 4)) & 0xF) << ((3 - c) * 4);
      rev[3 - r] = v;
    }
    return rev;
  }

  // ---- 0xF masking (simplified from C++ apply_dynamic_mask) ---------------
  function maskEncoded(enc, threshold) {
    const out = new Uint8Array(enc);
    for (let i = 0; i < 16; i++)
      if (out[i] >= threshold) out[i] = 0xF;
    return out;
  }

  // ---- Evaluation ---------------------------------------------------------
  function evaluate4x4(board) {
    const enc = encodeBoard4x4(board);
    // Mask large tiles: use threshold based on board sum
    const size = getSize(board);
    let boardSum = 0;
    for (let i = 0; i < 16; i++)
      if (enc[i] > 0) boardSum += (1 << enc[i]);
    const rem = boardSum % 1024;

    let masked;
    if (rem > 1000) masked = maskEncoded(enc, 11);
    else if (rem >= 48 || rem < 6) masked = maskEncoded(enc, 9);
    else masked = maskEncoded(enc, 12);

    const rows = packRows4(masked);
    const rev = reverseRows4(rows);
    let sx1 = 0, sx2 = 0, sy1 = 0, sy2 = 0;
    for (let i = 0; i < 4; i++) {
      sx1 += diffs4[rows[i] * 2];
      sx2 += diffs4[rows[i] * 2 + 1];
      sy1 += diffs4[rev[i] * 2];
      sy2 += diffs4[rev[i] * 2 + 1];
    }
    return Math.max(sx1, sx2) + Math.max(sy1, sy2);
  }

  // Native evaluation for 3×3 and 5×5 (uses generalized evaluateRow directly)
  function evaluateNxN(board) {
    const size = getSize(board);
    const w = Array.from({ length: size }, () => Array(size).fill(0));
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        w[r][c] = board[r][c] === 0 ? 0 : TILE_WEIGHT_MAP[Math.round(Math.log2(board[r][c]))];

    let sx1 = 0, sx2 = 0, sy1 = 0, sy2 = 0;
    for (let r = 0; r < size; r++) {
      const row = w[r].slice();
      sx1 += evaluateRow(row);
      sx2 += evaluateRow([...row].reverse());
    }
    for (let c = 0; c < size; c++) {
      const col = [];
      for (let r = 0; r < size; r++) col.push(w[r][c]);
      sy1 += evaluateRow(col);
      sy2 += evaluateRow([...col].reverse());
    }
    return Math.max(sx1, sx2) + Math.max(sy1, sy2);
  }

  function evaluate(board) {
    const size = getSize(board);
    if (size === 4) return evaluate4x4(board); // precomputed 65536-row table (matching C++)
    return evaluateNxN(board); // 3×3 and 5×5: generalized evaluateRow
  }

  function processScore(s) {
    if (s < 200) return Math.max(0, (s >> 2) - 10);
    if (s < 500) return (s >> 1) - 12;
    if (s < 1000) return (s >> 1) + 144;
    if (s < 2000) return s + 600;
    return 3000;
  }

  // ---- Board key for cache ------------------------------------------------
  function boardKey(board) {
    let h = 0;
    for (let r = 0; r < board.length; r++)
      for (let c = 0; c < board[r].length; c++) {
        const v = board[r][c];
        h = ((h * 31) | 0) + (v === 0 ? 0 : Math.round(Math.log2(v)));
      }
    return h >>> 0;
  }

  // ---- Search (matching C++ structure) ------------------------------------
  function search0(board) {
    const dirs = ['up', 'down', 'left', 'right'];
    let best = -1e9;
    for (const d of dirs) {
      const { board: nb, changed, score } = moveBoard(board, d);
      if (!changed) continue;
      const v = evaluate(nb) + processScore(score);
      if (v > best) best = v;
    }
    return best;
  }

  // chance node: iterate ALL empty cells (matching C++ search_branch)
  function searchChance(board, depth, cache) {
    if (depth <= 0) return search0(board);
    const empties = emptyCells(board);
    if (empties.length === 0) return evaluate(board);

    // Adaptive depth (matching C++ dynamic depth reduction)
    const size = getSize(board);
    let effDepth = depth;
    if (empties.length > 5) effDepth = Math.min(effDepth, 3);
    else if (empties.length > 4 && size >= 4) effDepth = Math.min(effDepth, 4);

    // Cache lookup
    const key = (boardKey(board) * 31 + effDepth) >>> 0;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    // Iterate ALL empty cells (matching C++ behavior)
    let total = 0;
    for (const p of empties) {
      const b2 = cloneBoard(board); b2[p.r][p.c] = 2;
      total += 0.9 * searchPlayer(b2, effDepth - 1, cache);
      const b4 = cloneBoard(board); b4[p.r][p.c] = 4;
      total += 0.1 * searchPlayer(b4, effDepth - 1, cache);
    }

    const result = Math.round(total / empties.length);
    cache.set(key, result);
    return result;
  }

  // player node: try all 4 moves
  function searchPlayer(board, depth, cache) {
    if (depth <= 0) return search0(board);
    const dirs = ['up', 'down', 'left', 'right'];
    let best = -1e9;
    for (const d of dirs) {
      const { board: nb, changed, score } = moveBoard(board, d);
      if (!changed) continue;
      const v = searchChance(nb, depth, cache) + processScore(score);
      if (v > best) best = v;
    }
    return best === -1e9 ? -1e9 : best;
  }

  // ---- Public API ---------------------------------------------------------
  function getBestMove(board, depth) {
    const size = getSize(board);
    const baseDepth = Math.max(1, Math.min(depth || 3, 5));
    const empties = emptyCells(board).length;
    const total = size * size;

    let d = baseDepth;
    if (empties >= total * 0.6) d = Math.max(1, baseDepth - 1);
    else if (empties <= 2 && size <= 4) d = Math.min(5, baseDepth + 1);

    const cache = new Map();
    const dirs = ['up', 'down', 'left', 'right'];
    let bestDir = null, bestScore = -1e9;

    for (const dir of dirs) {
      const { board: nb, changed, score } = moveBoard(board, dir);
      if (!changed) continue;
      const v = searchChance(nb, d, cache) + processScore(score);
      if (v > bestScore) { bestScore = v; bestDir = dir; }
    }

    if (!bestDir) return null;
    return { direction: bestDir, score: bestScore, depth: d };
  }

  return { getBestMove, evaluate, moveBoard };
})();
