'use strict';

// Sokoban solver — BFS with deadlock detection.

const SolverSokoban = (() => {
  function readBoard() {
    const cells = document.querySelectorAll('.sk-cell');
    let playerR = 0, playerC = 0;
    const walls = new Set(), targets = new Set(), boxes = new Set();
    const sizeEl = document.getElementById('sk-board');
    const rows = sizeEl ? parseInt(getComputedStyle(sizeEl).getPropertyValue('--rows')) || 5 : 5;
    const cols = sizeEl ? parseInt(getComputedStyle(sizeEl).getPropertyValue('--cols')) || 5 : 5;

    cells.forEach(c => {
      const r = parseInt(c.dataset.row), col = parseInt(c.dataset.col);
      if (isNaN(r) || isNaN(col)) return;
      if (c.classList.contains('is-wall')) walls.add(r+','+col);
      else if (c.classList.contains('is-target')) targets.add(r+','+col);
      if (c.classList.contains('is-player')) { playerR = r; playerC = col; }
      if (c.classList.contains('is-box')) boxes.add(r+','+col);
    });
    return { playerR, playerC, walls, targets, boxes, rows, cols };
  }

  function getNeighbors(pr, pc, boxes, walls) {
    const dirs = [[-1,0,'up'],[1,0,'down'],[0,-1,'left'],[0,1,'right']];
    const result = [];
    for (const [dr, dc, dir] of dirs) {
      const nr = pr + dr, nc = pc + dc;
      if (walls.has(nr+','+nc)) continue;
      if (boxes.has(nr+','+nc)) {
        const br = nr + dr, bc = nc + dc;
        if (walls.has(br+','+bc) || boxes.has(br+','+bc)) continue;
        const newBoxes = new Set(boxes);
        newBoxes.delete(nr+','+nc);
        newBoxes.add(br+','+bc);
        result.push({ pr:nr, pc:nc, boxes:newBoxes, direction:dir });
      } else {
        result.push({ pr:nr, pc:nc, boxes:new Set(boxes), direction:dir });
      }
    }
    return result;
  }

  function isDeadlock(r, c, walls, targets, boxes) {
    if (targets.has(r+','+c)) return false;
    const blockedH = walls.has((r-1)+','+c) || walls.has((r+1)+','+c);
    const blockedV = walls.has(r+','+(c-1)) || walls.has(r+','+(c+1));
    return blockedH || blockedV;
  }

  function solve(board) {
    const { playerR, playerC, walls, targets, boxes, rows, cols } = board;
    const startKey = playerR+','+playerC+'|'+[...boxes].sort().join(';');
    const queue = [{ pr:playerR, pc:playerC, boxes, path:[] }];
    const visited = new Set([startKey]);
    const MAX = 200000;

    for (let iter = 0; queue.length > 0 && iter < MAX; iter++) {
      const cur = queue.shift();
      if ([...cur.boxes].every(b => targets.has(b))) return cur.path;

      const neighbors = getNeighbors(cur.pr, cur.pc, cur.boxes, walls);
      for (const nb of neighbors) {
        const key = nb.pr+','+nb.pc+'|'+[...nb.boxes].sort().join(';');
        if (visited.has(key)) continue;
        let dead = false;
        for (const b of nb.boxes) {
          const [br, bc] = b.split(',').map(Number);
          if (isDeadlock(br, bc, walls, targets, nb.boxes)) { dead = true; break; }
        }
        if (dead) continue;
        visited.add(key);
        queue.push({ pr:nb.pr, pc:nb.pc, boxes:nb.boxes, path:[...cur.path, nb.direction] });
      }
    }
    return null;
  }

  return { readBoard, solve };
})();
