'use strict';

// Tile (羊了个羊) solver — precompute complete solution via backtracking.
// Since ALL tiles are known upfront, we can find the exact winning sequence.

const SolverTile = (() => {

  const PATTERNS = ["🍎","🍊","🥭","🍇","🍉","🍓","🥝","🍑","🍒","🥥","🍍","🥑","🥕","🌽"];
  function patName(p) {
    if (p && p.startsWith('P')) { const i = parseInt(p.substring(1)); return PATTERNS[i] || p; }
    return p || '?';
  }

  // ---- Read all tiles from DOM ----
  function getAllTiles() {
    const tiles = [];
    document.querySelectorAll('#tile-stage [data-id]').forEach((el) => {
      const r = el.getBoundingClientRect();
      tiles.push({
        id: el.dataset.id,
        pattern: el.dataset.pattern,
        layer: parseInt(el.dataset.layer) || 0,
        z: parseInt(getComputedStyle(el).zIndex) || 0,
        rect: { l: r.left, r: r.right, t: r.top, b: r.bottom },
        el,
      });
    });
    return tiles;
  }

  function covers(a, b) {
    if (a.z <= b.z) return false;
    return a.rect.l < b.rect.r && a.rect.r > b.rect.l &&
           a.rect.t < b.rect.b && a.rect.b > b.rect.t;
  }

  // ---- Build tile graph with cover relationships ----
  function buildGraph() {
    const tiles = getAllTiles();
    const byId = {};
    for (const t of tiles) {
      t.covers = [];
      t.coveredBy = [];
      byId[t.id] = t;
    }
    for (const a of tiles) {
      for (const b of tiles) {
        if (a.id === b.id) continue;
        if (covers(a, b)) {
          a.covers.push(b.id);
          b.coveredBy.push(a.id);
        }
      }
    }
    return { tiles, byId };
  }

  function getUncovered(tiles) {
    return tiles.filter(t => t.coveredBy.length === 0);
  }

  // For display only
  function getUncoveredTiles() {
    return getUncovered(getAllTiles().map(t => {
      t.covers = []; t.coveredBy = [];
      return t;
    }));
  }

  function getSlotContents() {
    const slots = [];
    document.querySelectorAll('#slots-row [data-pattern]').forEach(el => slots.push(el.dataset.pattern));
    return slots;
  }

  // ---- Greedy solver with shallow backtracking ----
  function solve() {
    const { tiles, byId } = buildGraph();
    if (tiles.length === 0) return null;

    let remaining = new Set(tiles.map(t => t.id));
    let slot = [];
    let solution = [];

    // Cache failed states with limited depth (avoid infinite loops)
    const failCache = new Set();

    function stateKey(rem, sl) {
      return [...rem].sort().join(',') + '|' + sl.sort().join(',');
    }

    function getUncoveredIds(rem) {
      const unc = [];
      for (const id of rem) {
        const t = byId[id];
        if (!t.coveredBy.some(cid => rem.has(cid))) unc.push(id);
      }
      return unc;
    }

    function applySlot(sl, pattern) {
      const ns = [...sl, pattern];
      const cnts = {}; for (const p of ns) cnts[p] = (cnts[p] || 0) + 1;
      return ns.filter(p => { if (cnts[p] >= 3) { cnts[p] -= 3; return false; } return true; });
    }

    // Backtracking helper (limited depth)
    function backtrack(rem, sl, depth, maxDepth, path) {
      if (rem.size === 0 && sl.length === 0) return path;
      if (depth > maxDepth || sl.length >= 7) return null;

      const key = stateKey(rem, sl);
      if (failCache.has(key)) return null;

      const unc = getUncoveredIds(rem);
      if (unc.length === 0) { failCache.add(key); return null; }

      // Prioritize: complete 3-set, then 2-of-3, then expose most
      const slCounts = {}; for (const p of sl) slCounts[p] = (slCounts[p] || 0) + 1;
      unc.sort((a, b) => {
        const ca = slCounts[byId[a].pattern] || 0, cb = slCounts[byId[b].pattern] || 0;
        if (ca >= 2 && cb < 2) return -1;
        if (cb >= 2 && ca < 2) return 1;
        if (ca >= 1 && cb < 1) return -1;
        if (cb >= 1 && ca < 1) return 1;
        // Prefer tiles that expose more
        return byId[b].covers.length - byId[a].covers.length;
      });

      for (const id of unc) {
        const newRem = new Set(rem); newRem.delete(id);
        const newSlot = applySlot(sl, byId[id].pattern);
        if (newSlot.length > 7) continue;
        const result = backtrack(newRem, newSlot, depth + 1, maxDepth, [...path, id]);
        if (result) return result;
      }
      failCache.add(key);
      return null;
    }

    // Main greedy loop: solve in chunks with backtracking lookahead
    let step = 0;
    while (remaining.size > 0 || slot.length > 0) {
      if (step++ > 1000) return null; // safety
      if (remaining.size === 0) {
        // All tiles collected, slot should be empty (all matched)
        if (slot.length === 0) return solution.map(id => ({ id, pattern: patName(byId[id].pattern) }));
        return null; // leftover in slot — shouldn't happen
      }

      // Try backtracking with increasing depth
      let found = false;
      for (let d = 1; d <= 10; d++) {
        const path = backtrack(remaining, slot, 0, d, []);
        if (path) {
          // Execute the first step of the found path
          const nextId = path[0];
          solution.push(nextId);
          slot = applySlot(slot, byId[nextId].pattern);
          remaining.delete(nextId);
          found = true;
          break;
        }
      }

      if (!found) return null; // stuck
    }

    return solution.map(id => ({ id, pattern: patName(byId[id].pattern) }));
  }

  // ---- Simple suggestion (fallback) ----
  function suggestNext() {
    const { tiles, byId } = buildGraph();
    const uncovered = getUncovered(tiles);
    const slot = getSlotContents();

    if (uncovered.length === 0) return null;

    const slotCounts = {};
    for (const p of slot) slotCounts[p] = (slotCounts[p] || 0) + 1;

    // Complete a set of 3
    for (const t of uncovered) {
      if ((slotCounts[t.pattern] || 0) >= 2) {
        return { tile: t, reason: '完成3连', score: 1000 };
      }
    }

    // Best: click tile that exposes most matching tiles
    let best = null, bestScore = -1;
    for (const t of uncovered) {
      let score = 0;
      const newlyUncovered = [];
      for (const cid of t.covers) {
        const ct = byId[cid];
        // Check if this is the ONLY tile covering ct
        const stillCovered = ct.coveredBy.filter(c => c !== t.id).some(c => {
          // Is c still in the remaining tiles?
          return true; // all tiles are still present at this point
        });
        // Simple heuristic: this tile exposes something
        newlyUncovered.push(ct);
      }

      for (const nt of newlyUncovered) {
        const cnt = (slotCounts[nt.pattern] || 0) + (t.pattern === nt.pattern ? 1 : 0);
        if (cnt === 2) score += 3;
        else if (cnt === 1) score += 1;
      }
      if (score === 0) score = newlyUncovered.length;
      if (score > bestScore) { bestScore = score; best = t; }
    }

    if (best) return { tile: best, reason: `露${bestScore}`, score: bestScore };
    return { tile: uncovered[0], reason: '无更好', score: 0 };
  }

  return { getUncoveredTiles, getSlotContents, suggestNext, solve, getAllTiles, buildGraph };
})();
