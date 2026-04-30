'use strict';

// Expectimax solver for 2048 with snake-pattern heuristic.
// Board sizes: 3×3, 4×4, 5×5. Target max tile 512/2048/4096.
// Strategy: deeper search + strong heuristic > extra API round-trips.

const Solver2048 = (() => {

  function cloneBoard(board) {
    return board.map((row) => [...row]);
  }

  function getSize(board) {
    return board.length;
  }

  // Build snake weight matrix for a given corner (cr, cc).
  // Snake path: start at corner, go horizontal, then zigzag rows.
  // Higher weight = earlier in snake = this position should have bigger tile.
  function snakeWeights(size, cr, cc) {
    const w = Array.from({ length: size }, () => Array(size).fill(0));
    const dcSign = cc === 0 ? 1 : -1;
    const drSign = cr === 0 ? 1 : -1;
    let pos = size * size;
    for (let r = 0; r < size; r++) {
      const rr = cr + r * drSign;
      for (let c = 0; c < size; c++) {
        const cc2 = r % 2 === 0 ? cc + c * dcSign : cc + (size - 1 - c) * dcSign;
        w[rr][cc2] = pos--;
      }
    }
    return w;
  }

  // Slide a single line (row or col) and return { line, score, changed }
  function slideLine(line) {
    const arr = line.filter((v) => v !== 0);
    let score = 0;
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] === arr[i + 1]) {
        arr[i] *= 2;
        score += arr[i];
        arr[i + 1] = 0;
        i++;
      }
    }
    const newLine = arr.filter((v) => v !== 0);
    return { line: newLine, score };
  }

  function moveBoard(board, direction) {
    const size = getSize(board);
    const newBoard = Array.from({ length: size }, () => Array(size).fill(0));
    let totalScore = 0;

    if (direction === 'left') {
      for (let r = 0; r < size; r++) {
        const res = slideLine(board[r]);
        for (let c = 0; c < res.line.length; c++) newBoard[r][c] = res.line[c];
        totalScore += res.score;
      }
    } else if (direction === 'right') {
      for (let r = 0; r < size; r++) {
        const res = slideLine([...board[r]].reverse());
        for (let c = 0; c < res.line.length; c++) newBoard[r][size - 1 - c] = res.line[c];
        totalScore += res.score;
      }
    } else if (direction === 'up') {
      for (let c = 0; c < size; c++) {
        const col = board.map((row) => row[c]);
        const res = slideLine(col);
        for (let r = 0; r < res.line.length; r++) newBoard[r][c] = res.line[r];
        totalScore += res.score;
      }
    } else if (direction === 'down') {
      for (let c = 0; c < size; c++) {
        const col = board.map((row) => row[c]).reverse();
        const res = slideLine(col);
        for (let r = 0; r < res.line.length; r++) newBoard[size - 1 - r][c] = res.line[r];
        totalScore += res.score;
      }
    }

    // Check if board actually changed
    let changed = false;
    for (let r = 0; r < size && !changed; r++) {
      for (let c = 0; c < size && !changed; c++) {
        if (newBoard[r][c] !== board[r][c]) changed = true;
      }
    }

    return { board: newBoard, score: totalScore, changed };
  }

  function emptyCells(board) {
    const cells = [];
    const size = getSize(board);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (board[r][c] === 0) cells.push({ r, c });
    return cells;
  }

  // Evaluate board by finding the best corner strategy.
  // Key insights from 2048EndgameTablebase:
  // 1. Don't enforce strict monotonicity — allow flexible formations
  // 2. Anchor the max tile in a corner
  // 3. Empty cells have diminishing returns (too many = harder to control spawns)
  // 4. Extreme value gaps between adjacent tiles indicate structural problems
  function evaluate(board) {
    const size = getSize(board);
    const corners = [[0, 0], [0, size - 1], [size - 1, 0], [size - 1, size - 1]];
    let bestScore = -Infinity;

    // Find max tile for anchoring
    let maxTile = 0, maxR = 0, maxC = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] > maxTile) { maxTile = board[r][c]; maxR = r; maxC = c; }
      }
    }

    for (const [cr, cc] of corners) {
      const weights = snakeWeights(size, cr, cc);
      let score = 0;
      let emptyCount = 0;

      // Snake weight score
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const v = board[r][c];
          if (v === 0) { emptyCount++; continue; }
          score += weights[r][c] * Math.log2(v);
        }
      }

      // Empty cells: high bonus but with diminishing returns
      // More empties is good up to ~4-6, beyond that extra value tapers
      const emptyBonus = Math.min(emptyCount, size <= 3 ? 3 : 5) * 400 +
                         Math.min(Math.max(0, emptyCount - (size <= 3 ? 3 : 5)), 3) * 100;
      score += emptyBonus;

      // Corner anchor bonus: max tile should be at a corner
      const maxCornerDist = Math.abs(maxR - cr) + Math.abs(maxC - cc);
      score += maxTile > 0 ? (size * 2 - maxCornerDist) * Math.log2(maxTile) * 20 : 0;

      // Monotonicity: reward decreasing sequence away from corner
      const totalCells = size * size;
      let monoScore = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (board[r][c] === 0) continue;
          const pos = weights[r][c];
          // Tiles at earlier snake positions should be larger
          const idealOrder = (totalCells - pos) / totalCells;
          monoScore += idealOrder * Math.log2(board[r][c]) * 10;
        }
      }
      score += monoScore;

      // Smoothness: penalize large adjacent value jumps
      // But only for tiles that are "close" — distant tiles can be different
      let smoothPenalty = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size - 1; c++) {
          if (board[r][c] !== 0 && board[r][c + 1] !== 0) {
            const diff = Math.abs(Math.log2(board[r][c]) - Math.log2(board[r][c + 1]));
            // Small differences (1-2 powers) are acceptable, large ones are bad
            if (diff > 2) smoothPenalty += (diff - 1) * 20;
            else smoothPenalty += diff * 5;
          }
        }
      }
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size; c++) {
          if (board[r][c] !== 0 && board[r + 1][c] !== 0) {
            const diff = Math.abs(Math.log2(board[r][c]) - Math.log2(board[r + 1][c]));
            if (diff > 2) smoothPenalty += (diff - 1) * 20;
            else smoothPenalty += diff * 5;
          }
        }
      }
      score -= smoothPenalty;

      if (score > bestScore) bestScore = score;
    }

    return bestScore;
  }

  function expectimax(board, depth, isPlayer) {
    const size = getSize(board);
    const dirs = ['up', 'down', 'left', 'right'];

    if (depth === 0) {
      return { score: evaluate(board) };
    }

    if (isPlayer) {
      let bestDir = null;
      let bestScore = -Infinity;

      for (const dir of dirs) {
        const { board: newBoard, changed } = moveBoard(board, dir);
        if (!changed) continue;
        const result = expectimax(newBoard, depth - 1, false);
        if (result.score > bestScore) {
          bestScore = result.score;
          bestDir = dir;
        }
      }

      if (bestDir === null) return { score: -1e9 };
      return { direction: bestDir, score: bestScore };
    } else {
      const empties = emptyCells(board);
      if (empties.length === 0) return { score: evaluate(board) };

      // For small boards or few empties, evaluate all cells
      // For large boards with many empties, sample
      let sampleCount;
      if (size <= 3) sampleCount = empties.length; // 3x3: evaluate all
      else if (size === 4) sampleCount = Math.min(empties.length, 6);
      else sampleCount = Math.min(empties.length, 8);

      const sampled = empties.sort(() => Math.random() - 0.5).slice(0, sampleCount);

      let totalScore = 0;
      for (const pos of sampled) {
        // 2 (p=0.9)
        const b2 = cloneBoard(board); b2[pos.r][pos.c] = 2;
        totalScore += 0.9 * expectimax(b2, depth - 1, true).score;

        // 4 (p=0.1)
        const b4 = cloneBoard(board); b4[pos.r][pos.c] = 4;
        totalScore += 0.1 * expectimax(b4, depth - 1, true).score;
      }

      return { score: totalScore / sampleCount };
    }
  }

  function getBestMove(board, depth) {
    const size = getSize(board);
    const baseDepth = Math.max(1, Math.min(depth || 3, 5));

    // Adaptive depth: safer boards can search shallower
    const empties = emptyCells(board).length;
    const totalCells = size * size;
    let d = baseDepth;
    if (empties >= totalCells * 0.6) d = Math.max(1, baseDepth - 1); // very open: save compute
    else if (empties <= 2 && size <= 4) d = Math.min(5, baseDepth + 1); // endgame: search deeper

    const result = expectimax(board, d, true);
    if (!result.direction) return null;
    return { direction: result.direction, score: result.score, depth: d };
  }

  return { getBestMove, evaluate, moveBoard };
})();
