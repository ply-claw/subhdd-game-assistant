'use strict';

// Expectimax solver for 2048.
// Configurable depth (1–5). Board sizes: 3×3, 4×4, 5×5.
// Strategy: think more, execute less — deeper search beats extra API round-trips.

const Solver2048 = (() => {
  // Corner bias weight matrix (size-adaptive)
  function getWeightMatrix(size) {
    const m = [];
    for (let r = 0; r < size; r++) {
      m[r] = [];
      for (let c = 0; c < size; c++) {
        // Higher weight toward bottom-left corner
        m[r][c] = (size - r) * (size - c) * (size - c);
      }
    }
    return m;
  }

  function cloneBoard(board) {
    return board.map((row) => [...row]);
  }

  function getSize(board) {
    return board.length;
  }

  // Slide a single line (row or col) and return { line, score, changed }
  function slideLine(line) {
    let arr = line.filter((v) => v !== 0);
    let score = 0;
    let changed = false;

    // Merge adjacent equal tiles
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] === arr[i + 1]) {
        arr[i] *= 2;
        score += arr[i];
        arr[i + 1] = 0;
        i++; // skip merged tile
        changed = true;
      }
    }

    const newLine = arr.filter((v) => v !== 0);
    if (newLine.length !== line.filter((v) => v !== 0).length) changed = true;
    // Check if positions changed
    let ri = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== 0) {
        if (line[i] !== (ri < newLine.length ? newLine[ri] : 0)) changed = true;
        ri++;
      }
    }

    return { line: newLine, score, changed };
  }

  function moveBoard(board, direction) {
    const size = getSize(board);
    const newBoard = Array.from({ length: size }, () => Array(size).fill(0));
    let totalScore = 0;
    let changed = false;

    if (direction === 'left') {
      for (let r = 0; r < size; r++) {
        const res = slideLine(board[r]);
        for (let c = 0; c < res.line.length; c++) newBoard[r][c] = res.line[c];
        totalScore += res.score;
        if (res.changed) changed = true;
      }
    } else if (direction === 'right') {
      for (let r = 0; r < size; r++) {
        const reversed = [...board[r]].reverse();
        const res = slideLine(reversed);
        for (let c = 0; c < res.line.length; c++) newBoard[r][size - 1 - c] = res.line[c];
        totalScore += res.score;
        if (res.changed) changed = true;
      }
    } else if (direction === 'up') {
      for (let c = 0; c < size; c++) {
        const col = board.map((row) => row[c]);
        const res = slideLine(col);
        for (let r = 0; r < res.line.length; r++) newBoard[r][c] = res.line[r];
        totalScore += res.score;
        if (res.changed) changed = true;
      }
    } else if (direction === 'down') {
      for (let c = 0; c < size; c++) {
        const col = board.map((row) => row[c]).reverse();
        const res = slideLine(col);
        for (let r = 0; r < res.line.length; r++) newBoard[size - 1 - r][c] = res.line[r];
        totalScore += res.score;
        if (res.changed) changed = true;
      }
    }

    // Verify board actually changed by comparing cells
    if (!changed) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (newBoard[r][c] !== board[r][c]) { changed = true; break; }
        }
        if (changed) break;
      }
    }

    return { board: newBoard, score: totalScore, changed };
  }

  function emptyCells(board) {
    const cells = [];
    const size = getSize(board);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] === 0) cells.push({ r, c });
      }
    }
    return cells;
  }

  // Evaluation heuristic: weighted sum + monotonicity + empty bonus
  function evaluate(board) {
    const size = getSize(board);
    const weights = getWeightMatrix(size);

    let score = 0;
    let emptyCount = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const v = board[r][c];
        if (v === 0) { emptyCount++; continue; }
        score += weights[r][c] * Math.log2(v);
      }
    }

    score += emptyCount * 500; // Heavy bonus for empty cells

    return score;
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

      if (bestDir === null) {
        return { score: -1e9 }; // No valid moves
      }
      return { direction: bestDir, score: bestScore };
    } else {
      // Chance node: average over possible spawns
      const empties = emptyCells(board);
      if (empties.length === 0) {
        return { score: evaluate(board) };
      }

      // Sample up to 6 empty cells for performance (5×5 has many empties)
      const sampleCount = Math.min(empties.length, size <= 4 ? 4 : 6);
      const sampled = empties.sort(() => Math.random() - 0.5).slice(0, sampleCount);

      let totalScore = 0;
      for (const pos of sampled) {
        // Place a 2 (p=0.9)
        const b2 = cloneBoard(board);
        b2[pos.r][pos.c] = 2;
        totalScore += 0.9 * expectimax(b2, depth - 1, true).score;

        // Place a 4 (p=0.1)
        const b4 = cloneBoard(board);
        b4[pos.r][pos.c] = 4;
        totalScore += 0.1 * expectimax(b4, depth - 1, true).score;
      }

      return { score: totalScore / sampleCount };
    }
  }

  function getBestMove(board, depth) {
    const d = Math.max(1, Math.min(depth || 3, 5));
    const result = expectimax(board, d, true);
    if (!result.direction) return null; // no valid moves
    return {
      direction: result.direction,
      score: result.score,
      depth: d,
    };
  }

  return { getBestMove, evaluate, moveBoard };
})();
