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

  // ---- Backtracking solver ----
  function solve() {
    const { tiles, byId } = buildGraph();
    if (tiles.length === 0) return null;

    // Count each pattern's total occurrences
    const totalCounts = {};
    for (const t of tiles) {
      totalCounts[t.pattern] = (totalCounts[t.pattern] || 0) + 1;
    }
    // Verify each pattern appears in multiples of 3
    for (const [p, c] of Object.entries(totalCounts)) {
      if (c % 3 !== 0) {
        console.warn('[tile] pattern', p, 'count', c, 'not multiple of 3');
      }
    }

    const solution = [];
    const MAX_DEPTH = tiles.length;
    const stateCache = new Set(); // cache failed states

    function makeStateKey(remainingIds, slot) {
      return [...remainingIds].sort().join(',') + '|' + slot.join(',');
    }

    function search(remaining, slot, depth) {
      if (remaining.size === 0 && slot.length === 0) return true; // SOLVED!
      if (depth > MAX_DEPTH) return false;

      // Check for dead end: slot has >7 unique patterns that can't be matched
      if (slot.length >= 7) return false;

      const stateKey = makeStateKey(remaining, slot);
      if (stateCache.has(stateKey)) return false;

      // Find uncovered tiles among remaining
      const uncovered = [];
      for (const id of remaining) {
        const t = byId[id];
        // Check if all covering tiles have been removed
        const stillCovered = t.coveredBy.some(cid => remaining.has(cid));
        if (!stillCovered) uncovered.push(id);
      }
      if (uncovered.length === 0) { stateCache.add(stateKey); return false; }

      // Sort uncovered: prioritize tiles that complete a set of 3
      const slotCounts = {};
      for (const p of slot) slotCounts[p] = (slotCounts[p] || 0) + 1;

      uncovered.sort((a, b) => {
        const ca = slotCounts[byId[a].pattern] || 0;
        const cb = slotCounts[byId[b].pattern] || 0;
        if (ca === 2 && cb !== 2) return -1;
        if (cb === 2 && ca !== 2) return 1;
        return (ca || 0) - (cb || 0);
      });

      for (const id of uncovered) {
        const t = byId[id];
        const newRemaining = new Set(remaining);
        newRemaining.delete(id);

        const newSlot = [...slot, t.pattern];
        // Check for 3-match elimination
        const patternCount = {};
        for (const p of newSlot) patternCount[p] = (patternCount[p] || 0) + 1;
        const finalSlot = newSlot.filter(p => {
          if (patternCount[p] >= 3) { patternCount[p] -= 3; return false; }
          return true;
        });

        if (finalSlot.length > 7) continue;

        solution.push(id);
        if (search(newRemaining, finalSlot, depth + 1)) return true;
        solution.pop();
      }

      stateCache.add(stateKey);
      return false;
    }

    const allIds = new Set(tiles.map(t => t.id));
    if (search(allIds, [], 0)) {
      return solution.map(id => ({
        id,
        pattern: patName(byId[id].pattern),
      }));
    }
    return null;
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
