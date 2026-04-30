'use strict';

// Sliding puzzle solver.
// ≤4×4: IDA* directly.
// 5×5: classic row-by-column reduction — move empty next to tile, push toward goal.

const SolverPuzzle15 = (() => {

  function boardToKey(b) { return b.join(','); }

  function manhattan(board, size) {
    let d = 0;
    for (let i = 0; i < board.length; i++) {
      const v = board[i]; if (v === 0) continue;
      const tr = Math.floor((v - 1) / size), tc = (v - 1) % size;
      d += Math.abs(Math.floor(i / size) - tr) + Math.abs((i % size) - tc);
    }
    return d;
  }

  function linearConflict(board, size) {
    let c = 0;
    for (let r = 0; r < size; r++)
      for (let c1 = 0; c1 < size; c1++) {
        const v1 = board[r*size+c1]; if (v1===0) continue;
        if (Math.floor((v1-1)/size)!==r) continue;
        for (let c2=c1+1;c2<size;c2++) {
          const v2=board[r*size+c2]; if(v2===0) continue;
          if(Math.floor((v2-1)/size)!==r) continue;
          if((v1-1)%size>(v2-1)%size) c+=2;
        }
      }
    for (let cc = 0; cc < size; cc++)
      for (let r1 = 0; r1 < size; r1++) {
        const v1 = board[r1*size+cc]; if (v1===0) continue;
        if ((v1-1)%size!==cc) continue;
        for (let r2=r1+1;r2<size;r2++) {
          const v2=board[r2*size+cc]; if(v2===0) continue;
          if((v2-1)%size!==cc) continue;
          if(Math.floor((v1-1)/size)>Math.floor((v2-1)/size)) c+=2;
        }
      }
    return c;
  }

  function heuristic(board, size) { return manhattan(board, size) + linearConflict(board, size); }

  function getNeighbors(board, size, locked) {
    const z = board.indexOf(0), r = Math.floor(z/size), c = z%size;
    const n = []; const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr,dc] of dirs) {
      const nr=r+dr, nc=c+dc; if (nr<0||nr>=size||nc<0||nc>=size) continue;
      const ni=nr*size+nc;
      if (locked && locked.has(ni)) continue;
      const nb=board.slice();
      [nb[z],nb[ni]]=[nb[ni],nb[z]]; n.push({board:nb,tile:board[ni]});
    }
    return n;
  }

  // ---- Classic tile placement: move empty next to tile, push toward goal ----
  function getEmptyPath(board, size, targetR, targetC, locked) {
    // BFS to find shortest path for EMPTY to reach (targetR, targetC)
    // State is just empty position. Locked tiles are obstacles.
    const startZ = board.indexOf(0);
    const startKey = String(startZ);
    const goalKey = String(targetR*size+targetC);
    if (startKey === goalKey) return [];

    const queue = [{ pos: startZ, path: [] }];
    const visited = new Set([startKey]);
    let head = 0;

    while (head < queue.length) {
      const cur = queue[head++];
      const r = Math.floor(cur.pos / size), c = cur.pos % size;
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr, dc] of dirs) {
        const nr = r+dr, nc = c+dc;
        if (nr<0||nr>=size||nc<0||nc>=size) continue;
        const ni = nr*size+nc;
        if (locked && locked.has(ni)) continue; // can't go through locked cells
        const key = String(ni);
        if (visited.has(key)) continue;
        visited.add(key);
        const newPath = [...cur.path, ni];
        if (key === goalKey) return newPath; // sequence of positions for empty
        queue.push({ pos: ni, path: newPath });
      }
    }
    return null; // no path
  }

  // Execute a sequence of empty moves on the board, returning the tile moved at each step
  function executeEmptyPath(board, size, path, locked) {
    const moves = [];
    for (const nextZ of path) {
      const curZ = board.indexOf(0);
      if (locked && locked.has(nextZ)) {
        // This shouldn't happen because we filter in BFS
        return null;
      }
      const tile = board[nextZ];
      [board[curZ], board[nextZ]] = [board[nextZ], board[curZ]];
      moves.push({ tile });
    }
    return moves;
  }

  function placeTileClassic(board, size, value, tr, tc, locked) {
    const allMoves = [];
    const goalIdx = tr*size+tc;
    const MAX_STEPS = 5000;

    for (let step = 0; step < MAX_STEPS; step++) {
      if (board[goalIdx] === value) return allMoves;

      const tileIdx = board.indexOf(value);
      if (tileIdx < 0) { console.error('[p15] tile', value, 'not found on board'); return null; }
      const tileR = Math.floor(tileIdx / size), tileC = tileIdx % size;

      // Determine push direction: which way to push the tile toward goal
      let pushDR = 0, pushDC = 0;
      if (tileR < tr) pushDR = 1;  // need to push tile DOWN
      else if (tileR > tr) pushDR = -1; // push UP
      else if (tileC < tc) pushDC = 1;  // push RIGHT
      else if (tileC > tc) pushDC = -1; // push LEFT

      // The empty must be at (tileR + pushDR, tileC + pushDC) to push the tile
      const emptyTargetR = tileR + pushDR;
      const emptyTargetC = tileC + pushDC;

      if (emptyTargetR < 0 || emptyTargetR >= size || emptyTargetC < 0 || emptyTargetC >= size) {
        // Edge case: tile at edge but needs to go further — push perpendicular first
        // Try pushing in the perpendicular direction
        if (pushDR !== 0) {
          // Pushing vertically, try horizontal
          if (tileC > 0 && !(locked && locked.has(tileR*size + tileC - 1))) {
            pushDR = 0; pushDC = -1;
          } else if (tileC < size-1 && !(locked && locked.has(tileR*size + tileC + 1))) {
            pushDR = 0; pushDC = 1;
          }
        } else {
          if (tileR > 0 && !(locked && locked.has((tileR-1)*size + tileC))) {
            pushDC = 0; pushDR = -1;
          } else if (tileR < size-1 && !(locked && locked.has((tileR+1)*size + tileC))) {
            pushDC = 0; pushDR = 1;
          }
        }
      }

      const etR = tileR + pushDR;
      const etC = tileC + pushDC;

      // If push target is out of bounds or locked, try alternative direction
      if (etR < 0 || etR >= size || etC < 0 || etC >= size || (locked && locked.has(etR*size+etC))) {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        let found = false;
        for (const [dr, dc] of dirs) {
          const nr = tileR+dr, nc = tileC+dc;
          if (nr>=0 && nr<size && nc>=0 && nc<size && !(locked && locked.has(nr*size+nc))) {
            const tileLock = new Set(locked); tileLock.add(tileIdx);
            const path = getEmptyPath(board, size, nr, nc, tileLock);
            if (path) {
              const moves = executeEmptyPath(board, size, path, locked);
              if (moves) allMoves.push(...moves);
              const curZ = board.indexOf(0);
              if (curZ === nr*size+nc) {
                [board[curZ], board[tileIdx]] = [board[tileIdx], board[curZ]];
                allMoves.push({ tile: value });
              }
              found = true;
              break;
            }
          }
        }
        if (!found) { console.error('[p15] no valid push dir for tile', value, 'at', tileR, tileC); return null; }
      } else {
        // Lock target tile position so BFS doesn't displace it
        const tileLock = new Set(locked);
        tileLock.add(tileIdx);
        const path = getEmptyPath(board, size, etR, etC, tileLock);
        if (!path) { console.error('[p15] no path for empty to', etR, etC, 'locked:', [...tileLock]); return null; }
        const moves = executeEmptyPath(board, size, path, locked);
        if (!moves) return null;
        allMoves.push(...moves);

        // Now empty is at push position — push the tile
        const curZ = board.indexOf(0);
        const pushIdx = etR*size+etC;
        if (curZ === pushIdx && board[tileIdx] === value) {
          [board[curZ], board[tileIdx]] = [board[tileIdx], board[curZ]];
          allMoves.push({ tile: value });
        }
      }
    }
    console.error('[p15] MAX_STEPS for tile', value); return null;
  }

  // ---- IDA* for ≤4×4 ----
  async function idaSearch(board, size, g, bound, path, visited, bestNextBound, iterCounter, deadline, locked) {
    iterCounter.val++;
    if (iterCounter.val % 2000 === 0) {
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise(r => setTimeout(r, 0));
    }
    const f = g + heuristic(board, size);
    if (f > bound) { bestNextBound.val = Math.min(bestNextBound.val, f); return null; }
    let done = true;
    for (let i = 0; i < size*size; i++) {
      const expected = i < size*size-1 ? i+1 : 0;
      if (board[i] !== expected) { done = false; break; }
    }
    if (done) return path;

    const key = boardToKey(board);
    if (visited.has(key) && visited.get(key) <= g) return null;
    visited.set(key, g);

    const neighbors = getNeighbors(board, size, locked);
    neighbors.sort((a, b) => heuristic(a.board, size) - heuristic(b.board, size));
    for (const nb of neighbors) {
      const r = await idaSearch(nb.board, size, g+1, bound,
        [...path, {tile:nb.tile}], visited, bestNextBound, iterCounter, deadline, locked);
      if (r) return r;
    }
    return null;
  }

  async function solveIDA(board, size) {
    let done = true;
    for (let i = 0; i < size*size; i++) {
      const expected = i < size*size-1 ? i+1 : 0;
      if (board[i] !== expected) { done = false; break; }
    }
    if (done) return [];

    let bound = heuristic(board, size);
    const MAX = 80;
    const DEADLINE = Date.now() + 15000;
    const iter = {val:0};
    try {
      while (bound <= MAX) {
        if (Date.now() > DEADLINE) return null;
        const visited = new Map();
        const nxt = {val:Infinity};
        const r = await idaSearch(board, size, 0, bound, [], visited, nxt, iter, DEADLINE, null);
        if (r) return r;
        if (nxt.val===Infinity) return null;
        bound = Math.max(bound+1, nxt.val);
        await new Promise(r=>setTimeout(r,0));
      }
    } catch(e) { if(e.message==='timeout') return null; throw e; }
    return null;
  }

  // ---- Main solve ----
  async function solve(board, size) {
    if (size <= 4) return await solveIDA(board, size);

    // 5×5: classic row+column reduction
    let curBoard = board.slice();
    const allMoves = [];
    const locked = new Set();

    // Place top row tiles 1..size
    for (let c = 0; c < size; c++) {
      const value = c + 1;
      const goalIdx = c;
      if (curBoard[goalIdx] !== value) {
        const moves = placeTileClassic(curBoard, size, value, 0, c, locked);
        if (!moves) { console.error('[p15] FAIL row tile', value, 'board:', curBoard.join(',')); return null; }
        allMoves.push(...moves);
      }
      locked.add(c);
    }

    // Place left column tiles size+1, 2*size+1, ...
    for (let r = 1; r < size; r++) {
      const value = r * size + 1;
      const goalIdx = r * size;
      if (curBoard[goalIdx] !== value) {
        const moves = placeTileClassic(curBoard, size, value, r, 0, locked);
        if (!moves) { console.error('[p15] FAIL col tile', value, 'board:', curBoard.join(',')); return null; }
        allMoves.push(...moves);
      }
      locked.add(r * size);
    }

    // Extract and solve 4×4 sub-puzzle
    const subSize = size - 1;
    const subBoard = [];
    for (let r = 1; r < size; r++)
      for (let c = 1; c < size; c++)
        subBoard.push(curBoard[r*size + c]);

    const valMap = {0: 0};
    for (let r = 1; r < size; r++)
      for (let c = 1; c < size; c++) {
        const ov = r * size + c + 1;
        const si = (r-1) * subSize + (c-1);
        valMap[ov] = si + 1;
      }

    const mapped = subBoard.map(v => (valMap[v] !== undefined ? valMap[v] : 0));
    const subMoves = await solveIDA(mapped, subSize);
    if (!subMoves) return null;

    const vToOv = {};
    for (const [ov, sv] of Object.entries(valMap)) vToOv[sv] = parseInt(ov);
    for (const sm of subMoves) {
      const origTile = vToOv[sm.tile];
      if (origTile === undefined) return null;
      allMoves.push({ tile: origTile });
    }

    return allMoves;
  }

  return { solve };
})();
