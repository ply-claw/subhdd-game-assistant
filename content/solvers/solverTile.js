'use strict';

// Tile (羊了个羊) solver — precompute complete greedy solution.
// Since ALL tiles are known upfront, we can plan the full sequence.

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
        z: parseInt(getComputedStyle(el).zIndex) || 0,
        rect: { l: r.left, r: r.right, t: r.top, b: r.bottom },
        el,
        isCovered: el.classList.contains('is-covered'),
      });
    });
    return tiles;
  }

  // Use game's own is-covered class (matches server's isCoveredBy check)
  function isUncovered(el) {
    return !el.classList.contains('is-covered');
  }

  function covers(a, b) {
    if (a.z <= b.z) return false;
    return a.rect.l < b.rect.r && a.rect.r > b.rect.l &&
           a.rect.t < b.rect.b && a.rect.b > b.rect.t;
  }

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

  function getUncoveredTiles() {
    // Use game's is-covered class directly from DOM
    const tiles = [];
    document.querySelectorAll('#tile-stage [data-id]:not(.is-covered)').forEach(el => {
      tiles.push({ id: el.dataset.id, pattern: el.dataset.pattern, el });
    });
    return tiles;
  }

  function getSlotContents() {
    const slots = [];
    document.querySelectorAll('#slots-row [data-pattern]').forEach(el => slots.push(el.dataset.pattern));
    return slots;
  }

  // ---- Greedy full-sequence solver ----
  function solve() {
    const { tiles, byId } = buildGraph();
    if (tiles.length === 0) return null;

    let remaining = new Set(tiles.map(t => t.id));
    let slot = [];
    let solution = [];
    let step = 0;
    const MAX = tiles.length * 2;

    function getUncoveredIds(rem) {
      const unc = [];
      for (const id of rem) {
        const t = byId[id];
        // Use game's is-covered class (most reliable) OR our z-index overlap check
        if (t.isCovered) continue;
        if (t.coveredBy.some(cid => rem.has(cid))) continue;
        unc.push(id);
      }
      return unc;
    }

    function applySlot(sl, pattern) {
      const ns = [...sl, pattern];
      const cnts = {};
      for (const p of ns) cnts[p] = (cnts[p] || 0) + 1;
      return ns.filter(p => {
        if (cnts[p] >= 3) { cnts[p] -= 3; return false; }
        return true;
      });
    }

    while (remaining.size > 0 || slot.length > 0) {
      if (step++ > MAX) return null;
      if (remaining.size === 0) {
        return slot.length === 0 ? solution.map(id => ({ id, pattern: patName(byId[id].pattern) })) : null;
      }

      const unc = getUncoveredIds(remaining);
      if (unc.length === 0) return null;

      const slCounts = {};
      for (const p of slot) slCounts[p] = (slCounts[p] || 0) + 1;

      let bestId = null, bestScore = -Infinity;

      for (const id of unc) {
        const t = byId[id];
        let score = 0;

        // Complete set of 3 — highest priority
        if ((slCounts[t.pattern] || 0) >= 2) score += 100000;
        // Two of a kind already in slot
        else if ((slCounts[t.pattern] || 0) >= 1) score += 10000;

        // Simulate removal: what becomes uncovered?
        const simRem = new Set(remaining); simRem.delete(id);
        const newUnc = getUncoveredIds(simRem);
        const newlyExposed = newUnc.filter(nid => !unc.includes(nid));

        // Match bonus: newly exposed tiles that match slot patterns
        for (const nid of newlyExposed) {
          const cnt = slCounts[byId[nid].pattern] || 0;
          if (cnt >= 2) score += 5000;
          else if (cnt >= 1) score += 2000;
        }

        // Raw exposure count
        score += newlyExposed.length * 100;

        // Penalty: if slot is nearly full, avoid adding NEW patterns
        if (slot.length >= 5 && (slCounts[t.pattern] || 0) === 0) score -= 50000;
        if (slot.length >= 6 && (slCounts[t.pattern] || 0) < 1) score -= 100000;

        // Bonus: patterns that have 2 in slot and this tile makes 3
        const newSlot = applySlot(slot, t.pattern);
        if (newSlot.length < slot.length) score += 50000; // elimination happened!

        if (score > bestScore) { bestScore = score; bestId = id; }
      }

      if (!bestId) return null;

      solution.push(bestId);
      slot = applySlot(slot, byId[bestId].pattern);
      remaining.delete(bestId);
    }

    return solution.map(id => ({ id, pattern: patName(byId[id].pattern) }));
  }

  // ---- Simple suggestion (for hint button) ----
  function suggestNext() {
    const uncovered = getUncoveredTiles();
    const slot = getSlotContents();

    if (uncovered.length === 0) return null;

    const slCounts = {};
    for (const p of slot) slCounts[p] = (slCounts[p] || 0) + 1;

    // Complete set of 3
    for (const t of uncovered) {
      if ((slCounts[t.pattern] || 0) >= 2) return { tile: t, reason: '完成3连' };
    }

    // Best exposure
    let best = null, bestScore = -1;
    for (const t of uncovered) {
      const score = t.covers.length * 10 + ((slCounts[t.pattern] || 0) >= 1 ? 100 : 0);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best ? { tile: best, reason: '贪心最优' } : { tile: uncovered[0], reason: '唯一可选' };
  }

  return { getUncoveredTiles, getSlotContents, suggestNext, solve };
})();
