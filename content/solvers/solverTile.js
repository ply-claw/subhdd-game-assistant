'use strict';

// Tile (羊了个羊) solver — one-shot backtracking solution.
// All tiles are known upfront. DFS with slot limit enforcement.

const SolverTile = (() => {
  const PATTERNS = ["🍎","🍊","🥭","🍇","🍉","🍓","🥝","🍑","🍒","🥥","🍍","🥑","🥕","🌽"];
  function patName(p) {
    if (!p) return '?';
    if (p.startsWith('P')) { const i = parseInt(p.substring(1)); return PATTERNS[i] || p; }
    return p;
  }

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
      });
    });
    return tiles;
  }

  function rectsOverlap(a, b) {
    return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  }

  function buildGraph() {
    const tiles = getAllTiles();
    const byId = {};
    for (const t of tiles) { t.covers = []; t.coveredBy = []; byId[t.id] = t; }
    for (const a of tiles) {
      for (const b of tiles) {
        if (a.id === b.id) continue;
        if (a.z > b.z && rectsOverlap(a.rect, b.rect)) {
          a.covers.push(b.id);
          b.coveredBy.push(a.id);
        }
      }
    }
    return { tiles, byId };
  }

  function getUncoveredTiles() {
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

  // ---- One-shot backtracking solver ----
  function solve() {
    let graph = buildGraph();
    // Retry if tiles not yet rendered
    for (let retry = 0; retry < 5 && graph.tiles.length === 0; retry++) {
      console.warn('[tile] no tiles, retry', retry);
      graph = buildGraph();
    }
    const { tiles, byId } = graph;
    console.log('[tile] solve: tiles=', tiles.length, 'uncovered=', tiles.filter(t => !t.el?.classList.contains('is-covered')).length);
    if (tiles.length === 0) return null;
    if (tiles.length % 3 !== 0) { console.warn('[tile] tile count', tiles.length, 'not multiple of 3'); }

    const solution = [];
    const totalTiles = tiles.length;
    const failCache = new Set(); // hash → failed

    function hashState(rem, sl) {
      // Fast 32-bit hash
      let h = sl.length;
      for (const p of sl) h = ((h * 31) | 0) + (p ? p.charCodeAt(1) || 0 : 0);
      // Only hash if remaining count changed significantly
      return (rem.size * 10007 + h) >>> 0;
    }

    function getUncoveredIds(rem) {
      const unc = [];
      for (const id of rem) {
        const t = byId[id];
        // Re-read is-covered from live DOM
        if (t.el && t.el.classList.contains('is-covered')) continue;
        if (t.coveredBy.some(cid => rem.has(cid))) continue;
        unc.push(id);
      }
      return unc;
    }

    function applySlot(sl, pattern) {
      const all = [...sl, pattern];
      const counts = {};
      for (const p of all) counts[p] = (counts[p] || 0) + 1;
      // Keep only the remainder after removing groups of 3 (preserving FIFO order)
      const keep = {};
      for (const [p, c] of Object.entries(counts)) keep[p] = c % 3;
      const result = [];
      const used = {};
      for (const p of all) {
        used[p] = (used[p] || 0) + 1;
        if (used[p] <= keep[p]) result.push(p);
      }
      return result;
    }

    function search(remaining, slot, depth) {
      if (remaining.size === 0 && slot.length === 0) return true;
      if (slot.length >= 7) return false;

      const h = hashState(remaining, slot);
      if (failCache.has(h)) return false;

      const unc = getUncoveredIds(remaining);
      if (unc.length === 0) { failCache.add(h); return false; }

      // Log depth progress intermittently
      if (depth <= 20) {
        console.log('[tile] depth', depth, 'remaining:', remaining.size, 'slot:', slot.length, 'unc:', unc.length, 'patterns:', slot.slice(-3));
      }

      // Prioritize: complete 3-set > 2-of-3 > expose more tiles
      const slCounts = {};
      for (const p of slot) slCounts[p] = (slCounts[p] || 0) + 1;

      unc.sort((a, b) => {
        const ca = slCounts[byId[a].pattern] || 0;
        const cb = slCounts[byId[b].pattern] || 0;
        if (ca >= 2 && cb < 2) return -1;
        if (cb >= 2 && ca < 2) return 1;
        return (byId[b].covers.length) - (byId[a].covers.length);
      });

      let branches = 0;
      for (const id of unc) {
        const newRem = new Set(remaining);
        newRem.delete(id);
        const newSlot = applySlot(slot, byId[id].pattern);
        if (newSlot.length >= 7) continue;

        branches++;
        solution.push(id);
        if (search(newRem, newSlot, depth + 1)) return true;
        solution.pop();
      }

      if (branches === 0 && depth <= 5) {
        console.warn('[tile] all branches blocked at depth', depth, 'slot:', slot, 'unc:', unc.length);
      }

      failCache.add(h);
      return false;
    }

    const allIds = new Set(tiles.map(t => t.id));
    if (search(allIds, [], 0)) {
      return solution.map(id => ({ id, pattern: patName(byId[id].pattern) }));
    }
    return null;
  }

  function suggestNext() {
    const { tiles, byId } = buildGraph();
    const uncovered = tiles.filter(t => !t.el?.classList.contains('is-covered'));
    const slot = getSlotContents();
    if (uncovered.length === 0) return null;
    const sc = {}; for (const p of slot) sc[p] = (sc[p] || 0) + 1;
    for (const t of uncovered) if ((sc[t.pattern] || 0) >= 2) return { tile: t, reason: '完成3连' };
    let best = uncovered[0], bestS = -1;
    for (const t of uncovered) {
      const s = t.covers.length * 10 + ((sc[t.pattern] || 0) >= 1 ? 100 : 0);
      if (s > bestS) { bestS = s; best = t; }
    }
    return { tile: best, reason: bestS > 0 ? '贪心' : '唯一' };
  }

  return { getUncoveredTiles, getSlotContents, suggestNext, solve };
})();
