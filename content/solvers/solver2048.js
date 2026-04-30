'use strict';

// 2048 AI Solver — Port from 2048EndgameTablebase (game-difficulty)
// Adapted for 3×3 / 4×4 / 5×5 boards with max target 4096.
//
// Core algorithm:
//   1. Bitboard-like array representation (16 tiles, each 4-bit)
//   2. Precomputed row evaluation via TILE_WEIGHT_MAP + diffs_evaluation_func
//   3. 0xF masking for large tiles above dynamic threshold
//   4. Expectimax search with transposition table cache
//   5. Effort-based cache replacement strategy

const Solver2048 = (() => {

  // ---- TILE_WEIGHT_MAP: log2(v) → weight ---------------------------------
  const TILE_WEIGHT_MAP = new Int32Array([
    0,    // 0: empty
    2,    // 1: tile=2
    4,    // 2: tile=4
    8,    // 3: tile=8
    16,   // 4: tile=16
    32,   // 5: tile=32
    64,   // 6: tile=64
    128,  // 7: tile=128
    248,  // 8: tile=256
    388,  // 9: tile=512
    488,  // 10: tile=1024
    518,  // 11: tile=2048
    519,  // 12: tile=4096
    519,  // 13: tile=8192
    519,  // 14: tile=16384
    520,  // 15: tile=32768
  ]);

  // ---- Row evaluation (ported from diffs_evaluation_func) -----------------
  // line_masked: array of 4 weights (from TILE_WEIGHT_MAP)
  function evaluateRow(line) {
    // dpdf calculation
    let score_dpdf = line[0];
    for (let x = 0; x < 3; x++) {
      if (line[x] < line[x + 1]) {
        if (line[x] > 400) {
          score_dpdf += (line[x] << 1) + (line[x + 1] - line[x]) * x;
        } else if (line[x] > 300 && x === 1 && line[0] > line[1]) {
          score_dpdf += (line[x] << 1);
        } else {
          score_dpdf -= (line[x + 1] - line[x]) << 3;
          score_dpdf -= line[x + 1] * 3;
          if (x < 2 && line[x + 2] < line[x + 1] && line[x + 1] > 30) {
            score_dpdf -= Math.max(80, line[x + 1]);
          }
        }
      } else if (x < 2) {
        score_dpdf += line[x + 1] + line[x];
      } else {
        score_dpdf += (line[x + 1] + line[x]) * 0.5;
      }
    }
    if (line[0] > 400 && line[1] > 300 && line[2] > 200 &&
        line[2] > line[3] && line[3] < 300) {
      score_dpdf += line[3] >> 2;
    }

    // t calculation
    let score_t;
    const min_03 = Math.min(line[0], line[3]);
    if (min_03 < 32) {
      score_t = -16384;
    } else if ((line[0] < line[1] && line[0] < 400) ||
               (line[3] < line[2] && line[3] < 400)) {
      score_t = -(Math.max(line[1], line[2]) * 10);
    } else {
      score_t = (line[0] * 1.8 + line[3] * 1.8) +
                 Math.max(line[1], line[2]) * 1.5 +
                 Math.min(160, Math.min(line[1], line[2])) * 2.5;
      if (Math.min(line[1], line[2]) < 8) score_t -= 60;
    }

    let zeroCount = 0;
    for (let k = 0; k < 4; k++) if (line[k] === 0) zeroCount++;

    const sum_123 = line[1] + line[2] + line[3];
    let penalty = 0;
    if (line[0] > 100 && ((zeroCount > 1 && sum_123 < 32) || sum_123 < 12)) {
      penalty = 4;
    }

    return Math.max(score_dpdf, score_t) / 4 - penalty;
  }

  // ---- Precomputed row evaluation table (65536 entries) -------------------
  const diffsMerged = new Int32Array(65536 * 2); // [d1, d2] pairs
  (function initDiffs() {
    for (let i = 0; i < 65536; i++) {
      const line = new Int32Array(4);
      const lineRev = new Int32Array(4);
      for (let j = 0; j < 4; j++) {
        const exponent = (i >> (j * 4)) & 0xF;
        line[j] = TILE_WEIGHT_MAP[exponent];
        lineRev[3 - j] = TILE_WEIGHT_MAP[exponent];
      }
      diffsMerged[i * 2] = Math.round(evaluateRow(line));
      diffsMerged[i * 2 + 1] = Math.round(evaluateRow(lineRev));
    }
  })();

  // ---- Board utilities ----------------------------------------------------
  function getSize(board) { return board.length; }

  function cloneBoard(board) {
    return board.map((row) => [...row]);
  }

  // Convert 2D board → encoded 16-element array (0-F per tile)
  function encodeBoard(board) {
    const arr = new Uint8Array(16);
    const size = getSize(board);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const v = board[r][c];
        arr[r * 4 + c] = v === 0 ? 0 : Math.round(Math.log2(v));
      }
    }
    return arr;
  }

  // Pack encoded board into 4 row values (16-bit each, left-to-right)
  function packRows(encoded) {
    const rows = new Uint16Array(4);
    for (let r = 0; r < 4; r++) {
      let val = 0;
      for (let c = 0; c < 4; c++) {
        val |= (encoded[r * 4 + c] & 0xF) << (c * 4);
      }
      rows[r] = val;
    }
    return rows;
  }

  // Reverse board (for vertical evaluation)
  function reverseRows(rows) {
    const rev = new Uint16Array(4);
    for (let r = 0; r < 4; r++) {
      let val = 0;
      for (let c = 0; c < 4; c++) {
        val |= ((rows[r] >> (c * 4)) & 0xF) << ((3 - c) * 4);
      }
      rev[3 - r] = val;
    }
    return rev;
  }

  // ---- Board moves --------------------------------------------------------
  function slideLine(line) {
    const arr = [];
    for (let i = 0; i < line.length; i++) if (line[i] !== 0) arr.push(line[i]);
    let score = 0;
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] === arr[i + 1]) {
        arr[i] *= 2; score += arr[i]; arr[i + 1] = 0; i++;
      }
    }
    return { line: arr.filter((v) => v !== 0), score };
  }

  function moveBoard(board, direction) {
    const size = getSize(board);
    const nb = Array.from({ length: size }, () => Array(size).fill(0));
    let score = 0;

    if (direction === 'left') {
      for (let r = 0; r < size; r++) {
        const res = slideLine(board[r]);
        for (let c = 0; c < res.line.length; c++) nb[r][c] = res.line[c];
        score += res.score;
      }
    } else if (direction === 'right') {
      for (let r = 0; r < size; r++) {
        const res = slideLine([...board[r]].reverse());
        for (let c = 0; c < res.line.length; c++) nb[r][size - 1 - c] = res.line[c];
        score += res.score;
      }
    } else if (direction === 'up') {
      for (let c = 0; c < size; c++) {
        const col = board.map((row) => row[c]);
        const res = slideLine(col);
        for (let r = 0; r < res.line.length; r++) nb[r][c] = res.line[r];
        score += res.score;
      }
    } else if (direction === 'down') {
      for (let c = 0; c < size; c++) {
        const col = board.map((row) => row[c]).reverse();
        const res = slideLine(col);
        for (let r = 0; r < res.line.length; r++) nb[size - 1 - r][c] = res.line[r];
        score += res.score;
      }
    }

    // Detect if board changed
    let changed = false;
    for (let r = 0; r < size && !changed; r++)
      for (let c = 0; c < size && !changed; c++)
        if (nb[r][c] !== board[r][c]) changed = true;

    return { board: nb, score, changed };
  }

  function emptyCells(board) {
    const cells = [];
    const size = getSize(board);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (board[r][c] === 0) cells.push({ r, c });
    return cells;
  }

  // ---- 0xF Masking (ported from mask()) ------------------------------------
  // Replace tiles >= threshold_value with 0xF in an encoded board
  function maskLargeTiles(encoded, threshold) {
    for (let i = 0; i < 16; i++) {
      if (encoded[i] >= threshold) encoded[i] = 0xF;
    }
    return encoded;
  }

  function applyDynamicMask(board, encoded) {
    const size = getSize(board);
    const targetTile = size === 3 ? 512 : size === 4 ? 2048 : 4096;

    // Count tile frequencies and board sum
    const counts = new Uint8Array(16);
    let boardSum = 0, smallSum = 0;
    for (let i = 0; i < 16; i++) {
      const tile = encoded[i];
      counts[tile]++;
      if (tile > 0) {
        boardSum += (1 << tile);
        if (tile < 9) smallSum += (1 << tile);
      }
    }

    const rem = boardSum % 1024;
    const smallRem = smallSum;

    // Mask threshold decision
    if ((rem >= 48 || (rem > 12 && smallRem === rem)) && rem <= 512 && counts[9] === 0) {
      maskLargeTiles(encoded, 9);
    } else if (rem >= 512 || rem < 6) {
      if (rem > 1000) maskLargeTiles(encoded, 11);
      else maskLargeTiles(encoded, 9);
    } else {
      maskLargeTiles(encoded, 12);
    }

    // Count 0xF tiles
    let maskedCount = 0;
    for (let i = 0; i < 16; i++) if (encoded[i] === 0xF) maskedCount++;

    return { encoded, maskedCount, boardSum, rem };
  }

  // ---- Evaluation (ported from AIPlayer::evaluate) -------------------------
  function evaluate(board) {
    const size = getSize(board);
    const encoded = encodeBoard(board);

    // Apply dynamic masking for large tiles
    const { encoded: masked } = applyDynamicMask(board, encoded);

    const rows = packRows(masked);
    const rowsRev = reverseRows(rows);

    let sum_x1 = 0, sum_x2 = 0, sum_y1 = 0, sum_y2 = 0;
    for (let i = 0; i < 4; i++) {
      const l1 = rows[i];
      const l2 = rowsRev[i];
      sum_x1 += diffsMerged[l1 * 2];
      sum_x2 += diffsMerged[l1 * 2 + 1];
      sum_y1 += diffsMerged[l2 * 2];
      sum_y2 += diffsMerged[l2 * 2 + 1];
    }

    return Math.max(sum_x1, sum_x2) + Math.max(sum_y1, sum_y2);
  }

  function processScore(score) {
    if (score < 200) return Math.max(0, (score >> 2) - 10);
    if (score < 500) return (score >> 1) - 12;
    if (score < 1000) return (score >> 1) + 144;
    if (score < 2000) return score + 600;
    return 3000;
  }

  // ---- Cache (Transposition Table) ----------------------------------------
  class TranspositionCache {
    constructor(numBuckets) {
      this.buckets = new BigUint64Array(numBuckets * 8);
      this.mask = numBuckets - 1;
      this.numBuckets = numBuckets;
    }

    hash(board, encoded) {
      // Simple fast hash of encoded board
      let h = 0;
      for (let i = 0; i < 16; i += 2) {
        h = ((h * 0x1A85EC53) + (encoded[i] | (encoded[i + 1] << 4))) | 0;
      }
      h = ((h * 0x1A85EC53) + (h >> 23) + h) | 0;
      return (h >>> 0) & this.mask;
    }

    getSignature(encoded) {
      let sig = 0;
      for (let i = 0; i < 8; i++) {
        sig = ((sig * 31) | 0) + (encoded[i * 2] | (encoded[i * 2 + 1] << 4));
      }
      return sig >>> 0;
    }

    lookup(bucketIdx, encoded, depth) {
      const sig = this.getSignature(encoded);
      const base = bucketIdx * 8;
      for (let i = 0; i < 8; i++) {
        const entry = Number(this.buckets[base + i]);
        if (entry === 0) continue;
        const cachedSig = (entry >> 32) & 0xFFFFFFFF;
        if (cachedSig === sig) {
          const cachedDepth = (entry >> 6) & 0x3F;
          if (cachedDepth >= depth) {
            const packedScore = (entry >> 12) & 0xFFFFF;
            return packedScore - 524288; // un-offset
          }
        }
      }
      return null;
    }

    update(bucketIdx, encoded, depth, score) {
      const sig = this.getSignature(encoded);
      const base = bucketIdx * 8;
      const packedScore = (score + 524288) & 0xFFFFF;
      const packDepth = Math.min(depth, 63);
      const newEntry = (BigInt(sig) << 32n) | (BigInt(packedScore) << 12n) | (BigInt(packDepth) << 6n);

      let minIdx = 0, minEffort = 255;
      for (let i = 0; i < 8; i++) {
        const entry = this.buckets[base + i];
        if (entry === 0n) { minIdx = i; minEffort = 0; continue; }
        const cachedSig = Number((entry >> 32n) & 0xFFFFFFFFn);
        if (cachedSig === sig) {
          const cachedDepth = Number((entry >> 6n) & 0x3Fn);
          if (depth > cachedDepth) this.buckets[base + i] = newEntry;
          return;
        }
        const effort = Number(entry & 0x3Fn);
        if (effort < minEffort) { minEffort = effort; minIdx = i; }
      }
      this.buckets[base + minIdx] = newEntry;
    }
  }

  // ---- Search -------------------------------------------------------------
  let searchCache = new TranspositionCache(65536);

  function search0(board) {
    const size = getSize(board);
    const dirs = ['up', 'down', 'left', 'right'];
    let best = -Infinity;
    for (const dir of dirs) {
      const { board: nb, changed, score } = moveBoard(board, dir);
      if (!changed) continue;
      const val = evaluate(nb) + processScore(score);
      if (val > best) best = val;
    }
    return best;
  }

  function searchBranch(board, depth, sumIncrement, encoded, maxLayer) {
    const size = getSize(board);
    if (depth <= 0) return search0(board);

    const empties = emptyCells(board);
    if (empties.length === 0) return evaluate(board);

    // Dynamic depth reduction: if board is very open, reduce search depth
    let effectiveDepth = depth;
    if (empties.length > 5) effectiveDepth = Math.min(effectiveDepth, 3);
    else if (empties.length > 4 && size === 4) effectiveDepth = Math.min(effectiveDepth, 4);

    // Try cache
    const enc = encodeBoard(board);
    const { encoded: masked } = applyDynamicMask(board, enc);
    const cacheIdx = searchCache.hash(board, masked);
    const cached = searchCache.lookup(cacheIdx, masked, effectiveDepth);
    if (cached !== null) return cached;

    // Sample empty cells (limit for performance)
    const sampleCount = Math.min(empties.length, size <= 3 ? empties.length : size <= 4 ? 6 : 8);
    const sampled = empties.sort(() => Math.random() - 0.5).slice(0, sampleCount);

    let totalScore = 0;
    for (const pos of sampled) {
      // Spawn 2 (p=0.9)
      const b2 = cloneBoard(board); b2[pos.r][pos.c] = 2;
      const s2 = searchAI(b2, effectiveDepth - 1, sumIncrement + 1);

      // Spawn 4 (p=0.1)
      const b4 = cloneBoard(board); b4[pos.r][pos.c] = 4;
      const s4 = searchAI(b4, effectiveDepth - 1, sumIncrement + 2);

      totalScore += (s2 * 0.9 + s4 * 0.1);
    }

    const result = Math.round(totalScore / sampleCount);
    searchCache.update(cacheIdx, masked, effectiveDepth, result);
    return result;
  }

  function searchAI(board, depth, sumIncrement) {
    if (depth <= 0) return search0(board);

    const size = getSize(board);
    const dirs = ['up', 'down', 'left', 'right'];
    let best = -1e9;
    let bestDir = null;

    for (const dir of dirs) {
      const { board: nb, changed, score } = moveBoard(board, dir);
      if (!changed) continue;
      const processed = processScore(score);
      const val = searchBranch(nb, depth, sumIncrement, encodeBoard(nb), 5) + processed;
      if (val > best) { best = val; bestDir = dir; }
    }

    if (bestDir === null) return -1e9;
    return best;
  }

  // ---- Public API ---------------------------------------------------------
  function getBestMove(board, depth) {
    const size = getSize(board);
    const baseDepth = Math.max(1, Math.min(depth || 3, 5));
    const empties = emptyCells(board).length;

    // Adaptive depth
    let d = baseDepth;
    if (empties >= size * size * 0.6) d = Math.max(1, baseDepth - 1);
    else if (empties <= 2 && size <= 4) d = Math.min(5, baseDepth + 1);

    // Reset cache for each search
    const cacheBuckets = d < 3 ? 4096 : d < 4 ? 16384 : d < 5 ? 65536 : 262144;
    searchCache = new TranspositionCache(Math.min(cacheBuckets, 65536));

    // Search all 4 moves from root
    const dirs = ['up', 'down', 'left', 'right'];
    let bestDir = null, bestScore = -Infinity;
    const scores = [];

    for (const dir of dirs) {
      const { board: nb, changed, score } = moveBoard(board, dir);
      if (!changed) { scores.push(-1e9); continue; }
      const processed = processScore(score);
      const val = searchBranch(nb, d, 1, encodeBoard(nb), 5) + processed;
      scores.push(val);
      if (val > bestScore) { bestScore = val; bestDir = dir; }
    }

    if (!bestDir) return null;
    return { direction: bestDir, score: bestScore, depth: d, scores };
  }

  return { getBestMove, evaluate, moveBoard };
})();
