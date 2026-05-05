'use strict';

// Maze solver — BFS shortest path.

const SolverMaze = (() => {
  function solve(playerR, playerC, goalR, goalC, size, openEdgeSet) {
    if (!openEdgeSet) return null;

    const queue = [[playerR, playerC, []]];
    const seen = new Set([playerR + ',' + playerC]);
    const dirs = [[-1,0,'up'],[1,0,'down'],[0,-1,'left'],[0,1,'right']];

    while (queue.length > 0) {
      const [r, c, path] = queue.shift();
      if (r === goalR && c === goalC) return path;

      for (const [dr, dc, dir] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const key = nr + ',' + nc;
        if (seen.has(key)) continue;
        const edgeKey = Math.min(r,nr)+','+Math.min(c,nc)+'|'+Math.max(r,nr)+','+Math.max(c,nc);
        if (!openEdgeSet.has(edgeKey)) continue;
        seen.add(key);
        queue.push([nr, nc, [...path, dir]]);
      }
    }
    return null;
  }

  return { solve };
})();
