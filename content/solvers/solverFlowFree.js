'use strict';

// Flow Free solver — BFS pathfinding with constraints.

const SolverFlowFree = (() => {
  function readBoard(size) {
    const board = [];
    for (let r = 0; r < size; r++) {
      board[r] = [];
      for (let c = 0; c < size; c++) {
        const cell = document.querySelector(`.ff-cell[data-r="${r}"][data-c="${c}"]`);
        board[r][c] = {
          r, c,
          color: cell ? parseInt(cell.dataset.color) || 0 : 0,
          el: cell,
        };
      }
    }
    return board;
  }

  function findEndpoints(board, size) {
    const endpoints = {};
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (board[r][c].color > 0) {
          const col = board[r][c].color;
          if (!endpoints[col]) endpoints[col] = [];
          endpoints[col].push({r, c});
        }
    return endpoints;
  }

  function findPath(board, size, start, end, occupied) {
    const queue = [[start.r, start.c, []]];
    const seen = new Set([start.r + ',' + start.c]);
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

    while (queue.length > 0) {
      const [r, c, path] = queue.shift();
      if (r === end.r && c === end.c && path.length > 0) return path;

      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const key = nr + ',' + nc;
        if (seen.has(key)) continue;
        if (board[nr][nc].color > 0 && (nr !== end.r || nc !== end.c)) continue;
        if (occupied && occupied.has(key)) continue;
        seen.add(key);
        queue.push([nr, nc, [...path, {r:nr, c:nc}]]);
      }
    }
    return null;
  }

  function solve(board, size) {
    const endpoints = findEndpoints(board, size);
    const occupied = new Set();
    const colors = Object.keys(endpoints).sort((a, b) => {
      const [a1, a2] = endpoints[a];
      const distA = Math.abs(a1.r - a2.r) + Math.abs(a1.c - a2.c);
      const [b1, b2] = endpoints[b];
      const distB = Math.abs(b1.r - b2.r) + Math.abs(b1.c - b2.c);
      return distA - distB;
    });

    const steps = [];
    for (const color of colors) {
      const [start, end] = endpoints[color];
      const path = findPath(board, size, start, end, occupied);
      if (!path) return null;
      for (const p of path) occupied.add(p.r + ',' + p.c);
      steps.push({ color, start, end, path });
    }
    return steps;
  }

  return { readBoard, solve, findEndpoints };
})();
