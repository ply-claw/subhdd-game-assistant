'use strict';

// Memory pairs tracker.
// Records seen card symbols and suggests next flip.
// Flip limit = 2×pairs, so perfect memory guarantees win.

const SolverMemory = (() => {
  function createTracker() {
    return {
      knownCards: new Map(),   // index → symbol
      matchedIndices: new Set(),
      totalCards: 0,
    };
  }

  function update(tracker, index, symbol, isMatch) {
    tracker.knownCards.set(index, symbol);
    if (isMatch) {
      tracker.matchedIndices.add(index);
    }
  }

  // Suggest next index to flip. Returns { index, reason } or null.
  function suggestNext(tracker) {
    const known = tracker.knownCards;
    const matched = tracker.matchedIndices;

    // Check if we know a pair: two unmatched cards with same symbol
    const symbolToIndices = new Map();
    for (const [idx, sym] of known) {
      if (matched.has(idx)) continue;
      if (!symbolToIndices.has(sym)) symbolToIndices.set(sym, []);
      symbolToIndices.get(sym).push(idx);
    }

    for (const [sym, indices] of symbolToIndices) {
      if (indices.length >= 2) {
        // Found a known pair! Flip one of them.
        for (const idx of indices) {
          // If this card is currently face-down, flip it
          return { index: idx, reason: 'match known pair', pairIndex: indices.find((i) => i !== idx) };
        }
      }
    }

    // No known pairs. Flip any unknown card.
    for (let i = 0; i < tracker.totalCards; i++) {
      if (matched.has(i)) continue;
      if (!known.has(i)) return { index: i, reason: 'explore unknown' };
    }

    // All cards known but no pairs found (shouldn't happen if game is solvable)
    // Return first unmatched known card
    for (let i = 0; i < tracker.totalCards; i++) {
      if (matched.has(i)) continue;
      return { index: i, reason: 'all known, try' };
    }

    return null; // All matched
  }

  return { createTracker, update, suggestNext };
})();
