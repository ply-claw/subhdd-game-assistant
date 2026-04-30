'use strict';

// Tile (羊了个羊) solver — greedy matching strategy.
// Find uncovered tiles, prioritize completing sets of 3.

const SolverTile = (() => {

  // Read all uncovered tiles from the DOM
  function getUncoveredTiles() {
    const tiles = [];
    document.querySelectorAll('#tile-stage [data-id]').forEach((el) => {
      if (!isTileClickable(el)) return;
      const id = el.dataset.id;
      const pattern = el.dataset.pattern;
      const layer = parseInt(el.dataset.layer) || 0;
      tiles.push({ id, pattern, layer, el });
    });
    return tiles;
  }

  // Check if a tile is completely uncovered (no higher-layer tile overlaps its rect)
  function isTileClickable(el) {
    const rect = el.getBoundingClientRect();
    const elLayer = parseInt(el.dataset.layer) || 0;
    // Get all tiles with higher layer
    const allTiles = document.querySelectorAll('#tile-stage [data-id][data-layer]');
    for (const other of allTiles) {
      if (other === el) continue;
      const otherLayer = parseInt(other.dataset.layer) || 0;
      if (otherLayer <= elLayer) continue;
      const otherRect = other.getBoundingClientRect();
      // Check if the two rects overlap
      if (rect.left < otherRect.right && rect.right > otherRect.left &&
          rect.top < otherRect.bottom && rect.bottom > otherRect.top) {
        return false; // covered by a higher-layer tile
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
