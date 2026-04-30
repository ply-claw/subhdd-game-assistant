'use strict';

// Tile (羊了个羊) solver — greedy matching strategy.
// Find uncovered tiles, prioritize completing sets of 3.

const SolverTile = (() => {

  // Read all uncovered tiles from the DOM
  function getUncoveredTiles() {
    const tiles = [];
    document.querySelectorAll('#tile-stage [data-id]').forEach((el) => {
      const id = el.dataset.id;
      const pattern = el.dataset.pattern;
      const layer = parseInt(el.dataset.layer) || 0;
      // Check if this tile is covered by another tile
      if (!isTileClickable(el)) return;
      tiles.push({ id, pattern, layer, el });
    });
    return tiles;
  }

  // Check if a tile can be clicked (not covered by another tile)
  function isTileClickable(el) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Check if any higher-layer tile covers this point
    const elLayer = parseInt(el.dataset.layer) || 0;
    const above = document.elementsFromPoint(cx, cy);
    for (const e of above) {
      if (e === el) break; // reached our tile
      if (e.dataset && e.dataset.id && e.dataset.layer) {
        const l = parseInt(e.dataset.layer);
        if (l > elLayer) return false;
      }
    }
    return true;
  }

  // Read current slot contents
  function getSlotContents() {
    const slots = [];
    document.querySelectorAll('#slots-row [data-pattern]').forEach((el) => {
      slots.push(el.dataset.pattern);
    });
    return slots;
  }

  // Suggest next tile to click.
  // Strategy: if we can complete a set of 3, click that tile.
  // Otherwise click an uncovered tile that's NOT already in the slot (to avoid duplicates).
  // If slot is getting full, prioritize clearing.
  function suggestNext(uncovered, slot) {
    if (uncovered.length === 0) return null;

    // Count patterns in slot
    const slotCounts = {};
    for (const p of slot) slotCounts[p] = (slotCounts[p] || 0) + 1;

    // Priority 1: complete a set (already 2 in slot, find matching uncovered)
    for (const t of uncovered) {
      const count = slotCounts[t.pattern] || 0;
      if (count === 2) return { tile: t, reason: 'complete set of 3' };
    }

    // Priority 2: if slot has 5-6, prioritize tiles already in slot (to clear space)
    if (slot.length >= 5) {
      for (const t of uncovered) {
        if (slotCounts[t.pattern] >= 1) return { tile: t, reason: 'clear slot space' };
      }
      // Desperate: click any tile
      return { tile: uncovered[0], reason: 'slot nearly full' };
    }

    // Priority 3: prefer tiles NOT in slot (avoid duplicates)
    for (const t of uncovered) {
      if (!slotCounts[t.pattern]) return { tile: t, reason: 'new pattern' };
    }

    // Priority 4: click any uncovered
    return { tile: uncovered[0], reason: 'any uncovered' };
  }

  return { getUncoveredTiles, getSlotContents, suggestNext, isTileClickable };
})();
