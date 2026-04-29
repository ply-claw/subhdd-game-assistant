'use strict';

// Sudoku solver using AC-3 constraint propagation + backtracking with MRV.
// Input: givens (81-element 1D array, 0 = empty). Row-major order.

const SolverSudoku = (() => {
  // Precomputed peer indices for all 81 cells
  function buildPeers() {
    const peers = Array.from({ length: 81 }, () => new Set());
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9);
      const c = i % 9;
      // Row
      for (let j = 0; j < 9; j++) peers[i].add(r * 9 + j);
      // Col
      for (let j = 0; j < 9; j++) peers[i].add(j * 9 + c);
      // Box
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          peers[i].add((br + dr) * 9 + (bc + dc));
        }
      }
      peers[i].delete(i);
    }
    return peers;
  }

  const PEERS = buildPeers();

  function initDomains(givens) {
    const domains = [];
    for (let i = 0; i < 81; i++) {
      if (givens[i] !== 0) {
        domains[i] = new Set([givens[i]]);
      } else {
        domains[i] = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      }
    }
    return domains;
  }

  function cloneDomains(domains) {
    return domains.map((d) => new Set(d));
  }

  // AC-3: enforce arc consistency
  function ac3(domains) {
    const queue = [];
    for (let i = 0; i < 81; i++) {
      for (const j of PEERS[i]) {
        queue.push([i, j]);
      }
    }

    while (queue.length > 0) {
      const [xi, xj] = queue.pop();
      if (revise(domains, xi, xj)) {
        if (domains[xi].size === 0) return false;
        for (const xk of PEERS[xi]) {
          if (xk !== xj) queue.push([xk, xi]);
        }
      }
    }
    return true;
  }

  function revise(domains, xi, xj) {
    let revised = false;
    const toRemove = [];
    for (const v of domains[xi]) {
      let hasSupport = false;
      for (const w of domains[xj]) {
        if (w !== v) { hasSupport = true; break; }
      }
      if (!hasSupport) {
        toRemove.push(v);
        revised = true;
      }
    }
    for (const v of toRemove) domains[xi].delete(v);
    return revised;
  }

  function isComplete(domains) {
    for (let i = 0; i < 81; i++) {
      if (domains[i].size !== 1) return false;
    }
    return true;
  }

  // Select unassigned variable with Minimum Remaining Values
  function selectMRV(domains) {
    let best = -1;
    let bestSize = Infinity;
    for (let i = 0; i < 81; i++) {
      const sz = domains[i].size;
      if (sz > 1 && sz < bestSize) {
        bestSize = sz;
        best = i;
      }
    }
    return best;
  }

  function backtrack(domains) {
    if (isComplete(domains)) {
      return domains.map((d) => [...d][0]);
    }

    const idx = selectMRV(domains);
    if (idx === -1) return null;

    // Try values in order (smallest first)
    const values = [...domains[idx]].sort((a, b) => a - b);
    for (const val of values) {
      const newDomains = cloneDomains(domains);
      newDomains[idx] = new Set([val]);
      if (ac3(newDomains)) {
        const result = backtrack(newDomains);
        if (result) return result;
      }
    }
    return null;
  }

  function solve(givens) {
    const domains = initDomains(givens);
    if (!ac3(domains)) return null; // Unsolvable puzzle
    return backtrack(domains);
  }

  return { solve };
})();
