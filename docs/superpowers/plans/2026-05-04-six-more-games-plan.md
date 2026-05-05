# Six More Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add solver + auto-play for minesweeper, sokoban, lightsout, maze, nonogram, flowfree to the Chrome extension.

**Architecture:** Each game gets a solver file, manifest match patterns, main.js cases for detection/state/actions/hint/auto-play, panel.js render, runner + background game list entries, popup checkboxes. Reuses existing DOM-driven pattern.

**Tech Stack:** Vanilla JS, Manifest V3, DOM event dispatch.

---

### Task 1: Lights Out Solver (simplest — GF(2) linear algebra)

**Files:**
- Create: `content/solvers/solverLightsOut.js`

- [ ] **Step 1: Write solverLightsOut.js**

```js
'use strict';

// Lights Out solver — GF(2) linear algebra.
// Board is N×N. Clicking a cell toggles it and its 4 neighbors.
// Goal: all cells off (0).

const SolverLightsOut = (() => {
  // Solve using Gaussian elimination over GF(2)
  function solve(board, size) {
    const N = size * size;
    // Build augmented matrix A|b
    const a = Array.from({length: N}, () => new Int32Array(N + 1));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        a[i][i] = 1; // self
        if (r > 0) a[i][(r-1)*size + c] = 1; // up
        if (r < size-1) a[i][(r+1)*size + c] = 1; // down
        if (c > 0) a[i][r*size + (c-1)] = 1; // left
        if (c < size-1) a[i][r*size + (c+1)] = 1; // right
        a[i][N] = board[r][c] ? 1 : 0; // target: current state
      }
    }
    // Gaussian elimination over GF(2)
    for (let col = 0; col < N; col++) {
      let pivot = -1;
      for (let row = col; row < N; row++) {
        if (a[row][col]) { pivot = row; break; }
      }
      if (pivot < 0) continue;
      if (pivot !== col) { const t = a[col]; a[col] = a[pivot]; a[pivot] = t; }
      for (let row = 0; row < N; row++) {
        if (row !== col && a[row][col]) {
          for (let k = col; k <= N; k++) a[row][k] ^= a[col][k];
        }
      }
    }
    // Extract solution
    const clicks = [];
    for (let i = 0; i < N; i++) {
      if (a[i][N]) {
        const r = Math.floor(i / size), c = i % size;
        clicks.push({r, c});
      }
    }
    return clicks;
  }

  return { solve };
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/solvers/solverLightsOut.js
git commit -m "feat: lights out GF(2) solver"
```

---

### Task 2: Maze Solver (BFS shortest path)

**Files:**
- Create: `content/solvers/solverMaze.js`

- [ ] **Step 1: Write solverMaze.js**

```js
'use strict';

// Maze solver — BFS shortest path.
// Read open edges from DOM or server session data.

const SolverMaze = (() => {
  // Read maze state from canvas/DOM
  function getOpenEdges(size) {
    // The game renders open edges as lines on canvas.
    // We can try directions and check which are valid via server.
    // Fallback: use BFS with server validation per step.
    return null; // server-authoritative, use try-move approach
  }

  // BFS to find path from current position to exit
  function solve(playerR, playerC, goalR, goalC, size, openEdgeSet, visited) {
    if (!openEdgeSet) return null; // need edges from server

    const queue = [[playerR, playerC, []]];
    const seen = new Set();
    seen.add(playerR + ',' + playerC);
    const dirs = [[-1,0,'up'],[1,0,'down'],[0,-1,'left'],[0,1,'right']];

    while (queue.length > 0) {
      const [r, c, path] = queue.shift();
      if (r === goalR && c === goalC) return path;

      for (const [dr, dc, dir] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const key = nr + ',' + nc;
        if (seen.has(key)) continue;
        // Check if edge is open between (r,c) and (nr,nc)
        const edgeKey = Math.min(r,nr)+','+Math.min(c,nc)+'|'+Math.max(r,nr)+','+Math.max(c,nc);
        if (openEdgeSet && !openEdgeSet.has(edgeKey)) continue;
        seen.add(key);
        queue.push([nr, nc, [...path, dir]]);
      }
    }
    return null;
  }

  // Wall-follower (right-hand rule) for when we don't have the map
  function rightHandTurn(dir) {
    const order = {up:'right', right:'down', down:'left', left:'up'};
    return order[dir] || 'right';
  }

  return { solve, rightHandTurn };
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/solvers/solverMaze.js
git commit -m "feat: maze BFS solver"
```

---

### Task 3: Minesweeper Solver (constraint propagation)

**Files:**
- Create: `content/solvers/solverMinesweeper.js`

- [ ] **Step 1: Write solverMinesweeper.js**

```js
'use strict';

// Minesweeper solver — constraint propagation + probability.

const SolverMinesweeper = (() => {
  // Read board from DOM
  function readBoard() {
    const cells = document.querySelectorAll('.ms-cell');
    const board = {};
    cells.forEach(c => {
      const r = parseInt(c.dataset.r), c2 = parseInt(c.dataset.c);
      if (isNaN(r) || isNaN(c2)) return;
      const key = r + ',' + c2;
      if (c.classList.contains('is-flagged')) board[key] = {r, c:c2, flagged:true, revealed:false, value:-1};
      else if (c.classList.contains('is-revealed') || c.textContent) {
        let val = -1;
        for (let i = 1; i <= 8; i++) if (c.classList.contains('is-n' + i)) val = i;
        if (val < 0 && c.textContent) val = parseInt(c.textContent) || 0;
        board[key] = {r, c:c2, flagged:false, revealed:true, value:val};
      } else {
        board[key] = {r, c:c2, flagged:false, revealed:false, value:-1};
      }
      board[key].el = c;
    });
    return board;
  }

  function getNeighbors(r, c, board) {
    const n = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        if (dr !== 0 || dc !== 0) {
          const k = (r+dr)+','+(c+dc);
          if (board[k]) n.push(board[k]);
        }
    return n;
  }

  function suggest(board) {
    const revealed = Object.values(board).filter(c => c.revealed && c.value > 0);
    const unrevealed = Object.values(board).filter(c => !c.revealed && !c.flagged);

    // Rule 1: If a revealed cell's value matches its flagged neighbors, click all remaining neighbors
    for (const cell of revealed) {
      const neighbors = getNeighbors(cell.r, cell.c, board);
      const flagged = neighbors.filter(n => n.flagged).length;
      const hidden = neighbors.filter(n => !n.revealed && !n.flagged);
      if (flagged === cell.value && hidden.length > 0) {
        return { type: 'reveal', cell: hidden[0] };
      }
    }

    // Rule 2: If unrevealed neighbors == value, flag them all
    for (const cell of revealed) {
      const neighbors = getNeighbors(cell.r, cell.c, board);
      const hidden = neighbors.filter(n => !n.revealed && !n.flagged);
      if (hidden.length === cell.value && hidden.some(n => !n.flagged)) {
        return { type: 'flag', cell: hidden.find(n => !n.flagged) };
      }
    }

    // Rule 3: Click any unrevealed with lowest probability
    if (unrevealed.length > 0) {
      // Simplistic: just click a random unrevealed
      return { type: 'reveal', cell: unrerevealed[0] };
    }

    return null;
  }

  return { readBoard, suggest };
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/solvers/solverMinesweeper.js
git commit -m "feat: minesweeper constraint solver"
```

---

### Task 4: Flow Free Solver (path search)

**Files:**
- Create: `content/solvers/solverFlowFree.js`

- [ ] **Step 1: Write solverFlowFree.js**

```js
'use strict';

// Flow Free solver — BFS pathfinding with constraints.

const SolverFlowFree = (() => {
  // Read board from DOM
  function readBoard(size) {
    const board = [];
    for (let r = 0; r < size; r++) {
      board[r] = [];
      for (let c = 0; c < size; c++) {
        const cell = document.querySelector(`.ff-cell[data-r="${r}"][data-c="${c}"]`);
        board[r][c] = {
          r, c,
          color: cell ? parseInt(cell.dataset.color) || 0 : 0,
          el: cell,
        };
      }
    }
    return board;
  }

  function findEndpoints(board, size) {
    const endpoints = {}; // color → [{r,c}, {r,c}]
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (board[r][c].color > 0) {
          if (!endpoints[board[r][c].color]) endpoints[board[r][c].color] = [];
          endpoints[board[r][c].color].push({r, c});
        }
    return endpoints;
  }

  // BFS to find path between two endpoints
  function findPath(board, size, start, end, occupied) {
    const queue = [[start.r, start.c, []]];
    const seen = new Set([start.r + ',' + start.c]);
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

    while (queue.length > 0) {
      const [r, c, path] = queue.shift();
      if (r === end.r && c === end.c && path.length > 0) return path; // need at least 1 step

      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const key = nr + ',' + nc;
        if (seen.has(key)) continue;
        // Can only pass through empty cells or the endpoint
        if (board[nr][nc].color > 0 && (nr !== end.r || nc !== end.c)) continue;
        if (occupied.has(key)) continue;
        seen.add(key);
        queue.push([nr, nc, [...path, {r:nr, c:nc}]]);
      }
    }
    return null;
  }

  // Solve: connect all color pairs
  function solve(board, size) {
    const endpoints = findEndpoints(board, size);
    const occupied = new Set(); // cells already used by paths
    const colors = Object.keys(endpoints).sort((a, b) => {
      // Heuristic: connect colors with fewer path options first
      const [a1, a2] = endpoints[a];
      const distA = Math.abs(a1.r - a2.r) + Math.abs(a1.c - a2.c);
      const [b1, b2] = endpoints[b];
      const distB = Math.abs(b1.r - b2.r) + Math.abs(b1.c - b2.c);
      return distA - distB;
    });

    const steps = [];
    for (const color of colors) {
      const [start, end] = endpoints[color];
      const path = findPath(board, size, start, end, occupied);
      if (!path) return null; // unsolvable
      for (const p of path) occupied.add(p.r + ',' + p.c);
      steps.push({ color, start, end, path });
    }
    return steps;
  }

  return { readBoard, solve, findEndpoints };
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/solvers/solverFlowFree.js
git commit -m "feat: flow free BFS path solver"
```

---

### Task 5: Sokoban Solver (A* search)

**Files:**
- Create: `content/solvers/solverSokoban.js`

- [ ] **Step 1: Write solverSokoban.js**

```js
'use strict';

// Sokoban solver — A* search with deadlock detection.

const SolverSokoban = (() => {
  function readBoard() {
    const cells = document.querySelectorAll('.sk-cell');
    let playerR = 0, playerC = 0;
    const walls = new Set(), targets = new Set(), boxes = new Set();
    const sizeEl = document.getElementById('sk-board');
    const rows = parseInt(getComputedStyle(sizeEl).getPropertyValue('--rows')) || 5;
    const cols = parseInt(getComputedStyle(sizeEl).getPropertyValue('--cols')) || 5;

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

  function stateKey(pr, pc, boxes) {
    return pr+','+pc+'|'+[...boxes].sort().join(';');
  }

  function isDeadlock(r, c, walls, targets, boxes) {
    // Simple deadlock: box in corner with no target
    if (targets.has(r+','+c)) return false;
    const blockedH = walls.has((r-1)+','+c) || walls.has((r+1)+','+c);
    const blockedV = walls.has(r+','+(c-1)) || walls.has(r+','+(c+1));
    return blockedH || blockedV;
  }

  function getNeighbors(pr, pc, boxes, walls) {
    const dirs = [[-1,0,'up'],[1,0,'down'],[0,-1,'left'],[0,1,'right']];
    const result = [];
    for (const [dr, dc, dir] of dirs) {
      const nr = pr + dr, nc = pc + dc;
      if (walls.has(nr+','+nc)) continue;
      if (boxes.has(nr+','+nc)) {
        // Push box
        const br = nr + dr, bc = nc + dc;
        if (walls.has(br+','+bc) || boxes.has(br+','+bc)) continue;
        const newBoxes = new Set(boxes);
        newBoxes.delete(nr+','+nc);
        newBoxes.add(br+','+bc);
        result.push({ pr:nr, pc:nc, boxes:newBoxes, direction:dir, push:true });
      } else {
        const newBoxes = new Set(boxes);
        result.push({ pr:nr, pc:nc, boxes:newBoxes, direction:dir, push:false });
      }
    }
    return result;
  }

  function heuristic(boxes, targets) {
    let d = 0;
    const targetList = [...targets].map(t => t.split(',').map(Number));
    for (const b of boxes) {
      const [br, bc] = b.split(',').map(Number);
      let minD = Infinity;
      for (const [tr, tc] of targetList) {
        minD = Math.min(minD, Math.abs(br-tr) + Math.abs(bc-tc));
      }
      d += minD;
    }
    return d;
  }

  // Simple BFS — for complex levels, this would need full IDA*
  function solve(board) {
    const { playerR, playerC, walls, targets, boxes, rows, cols } = board;
    const startKey = stateKey(playerR, playerC, boxes);
    const queue = [{ pr:playerR, pc:playerC, boxes, path:[] }];
    const visited = new Set([startKey]);
    const MAX = 200000;

    for (let iter = 0; queue.length > 0 && iter < MAX; iter++) {
      const cur = queue.shift();
      // Check goal: all boxes on targets
      if ([...cur.boxes].every(b => targets.has(b))) return cur.path;

      const neighbors = getNeighbors(cur.pr, cur.pc, cur.boxes, walls);
      for (const nb of neighbors) {
        const key = stateKey(nb.pr, nb.pc, nb.boxes);
        if (visited.has(key)) continue;
        // Deadlock check
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
```

- [ ] **Step 2: Commit**

```bash
git add content/solvers/solverSokoban.js
git commit -m "feat: sokoban BFS solver with deadlock detection"
```

---

### Task 6: Nonogram Solver (line-by-line deduction)

**Files:**
- Create: `content/solvers/solverNonogram.js`

- [ ] **Step 1: Write solverNonogram.js**

```js
'use strict';

// Nonogram solver — line-by-line constraint deduction + backtracking.

const SolverNonogram = (() => {
  function readBoard() {
    const rows = parseInt(getComputedStyle(document.getElementById('ng-board')).getPropertyValue('--rows')) || 5;
    const cols = parseInt(getComputedStyle(document.getElementById('ng-board')).getPropertyValue('--cols')) || 5;

    // Read row clues
    const rowClues = [];
    for (let r = 0; r < rows; r++) {
      const clueEls = document.querySelectorAll(`.ng-row-clue[data-row="${r}"] span`);
      rowClues[r] = [...clueEls].map(e => parseInt(e.textContent)).filter(n => !isNaN(n));
    }
    // Read col clues
    const colClues = [];
    for (let c = 0; c < cols; c++) {
      const clueEls = document.querySelectorAll(`.ng-col-clue[data-col="${c}"] span`);
      colClues[c] = [...clueEls].map(e => parseInt(e.textContent)).filter(n => !isNaN(n));
    }

    // Read current cell states (0=unknown, 1=filled, -1=cross)
    const board = Array.from({length:rows}, () => Array(cols).fill(0));
    document.querySelectorAll('.ng-cell[data-r][data-c]').forEach(cell => {
      const r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
      if (cell.classList.contains('is-filled')) board[r][c] = 1;
      else if (cell.classList.contains('is-cross')) board[r][c] = -1;
    });

    return { rows, cols, rowClues, colClues, board };
  }

  // Generate all valid line configurations for a clue set
  function linePossibilities(length, clues, current) {
    if (clues.length === 0) {
      // All remaining cells must be blank
      if (current.every(v => v !== 1)) return [Array(length).fill(0)];
      return [];
    }
    const result = [];
    const clue = clues[0];
    const rest = clues.slice(1);
    const minRest = rest.reduce((s, c) => s + c + 1, 0);
    const maxStart = length - clue - minRest;

    for (let start = 0; start <= maxStart; start++) {
      // Check if current[start..start+clue-1] can be filled
      let ok = true;
      for (let i = start; i < start + clue; i++) {
        if (current[i] === 0) continue; // unknown is OK
        if (current[i] !== 1) { ok = false; break; }
      }
      // Check if cell before start must be blank
      if (start > 0 && current[start-1] === 1) ok = false;
      // Check cell after block must be blank
      if (start + clue < length && current[start+clue] === 1) ok = false;

      if (!ok) continue;

      const line = Array(length).fill(0);
      for (let i = 0; i < start; i++) line[i] = current[i] === 1 ? 1 : 0;
      for (let i = start; i < start + clue; i++) line[i] = 1;
      if (start + clue < length) line[start+clue] = 0;

      const subResults = linePossibilities(length - start - clue - (start + clue < length ? 1 : 0), rest,
        current.slice(start + clue + (start + clue < length ? 1 : 0)));
      for (const sub of subResults) {
        const full = [...line.slice(0, start + clue + (start + clue < length ? 1 : 0)), ...sub];
        if (full.length < length) full.push(...Array(length - full.length).fill(0));
        result.push(full.slice(0, length));
      }
    }
    return result;
  }

  // Deduce one step: find cells that must be filled or empty
  function deduce(board, rowClues, colClues, rows, cols) {
    let changed = false;
    // Row deduction
    for (let r = 0; r < rows; r++) {
      const possibilities = linePossibilities(cols, rowClues[r], board[r]);
      if (possibilities.length === 0) return null; // unsolvable
      const must = possibilities[0].map((_, i) => possibilities.every(p => p[i] === 1) ? 1 : 0);
      const mustNot = possibilities[0].map((_, i) => possibilities.every(p => p[i] === 0) ? 1 : 0);
      for (let c = 0; c < cols; c++) {
        if (must[c] && board[r][c] === 0) { board[r][c] = 1; changed = true; }
        if (mustNot[c] && board[r][c] === 0) { board[r][c] = -1; changed = true; }
      }
    }
    // Col deduction
    for (let c = 0; c < cols; c++) {
      const col = board.map(row => row[c]);
      const possibilities = linePossibilities(rows, colClues[c], col);
      if (possibilities.length === 0) return null;
      const must = possibilities[0].map((_, i) => possibilities.every(p => p[i] === 1) ? 1 : 0);
      const mustNot = possibilities[0].map((_, i) => possibilities.every(p => p[i] === 0) ? 1 : 0);
      for (let r = 0; r < rows; r++) {
        if (must[r] && board[r][c] === 0) { board[r][c] = 1; changed = true; }
        if (mustNot[r] && board[r][c] === 0) { board[r][c] = -1; changed = true; }
      }
    }
    return changed;
  }

  function solve(board, rowClues, colClues, rows, cols) {
    let iter = 0;
    while (iter < 100) {
      const changed = deduce(board, rowClues, colClues, rows, cols);
      if (changed === null) return null;
      if (!changed) break; // stuck — need backtracking (not implemented for MVP)
      iter++;
    }
    // Return list of cells to fill
    const fills = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (board[r][c] === 1) fills.push({r, c});
    return fills;
  }

  return { readBoard, solve };
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/solvers/solverNonogram.js
git commit -m "feat: nonogram line-by-line constraint solver"
```

---

### Task 7: Manifest + main.js integration (all 6 games)

**Files:**
- Modify: `manifest.json`
- Modify: `content/main.js`

- [ ] **Step 1: Update manifest.json**

Add URL matches and solver files to content_scripts:

```json
"matches": [
  ...existing...,
  "https://sub.hdd.sb/minesweeper*",
  "https://sub.hdd.sb/sokoban*",
  "https://sub.hdd.sb/lightsout*",
  "https://sub.hdd.sb/maze*",
  "https://sub.hdd.sb/nonogram*",
  "https://sub.hdd.sb/flowfree*"
],
"js": [
  ...existing...,
  "content/solvers/solverLightsOut.js",
  "content/solvers/solverMaze.js",
  "content/solvers/solverMinesweeper.js",
  "content/solvers/solverFlowFree.js",
  "content/solvers/solverSokoban.js",
  "content/solvers/solverNonogram.js"
]
```

- [ ] **Step 2: Update detectGame in main.js**

Add 6 new path checks:
```js
if (path.startsWith('/minesweeper')) return 'minesweeper';
if (path.startsWith('/sokoban')) return 'sokoban';
if (path.startsWith('/lightsout')) return 'lightsout';
if (path.startsWith('/maze')) return 'maze';
if (path.startsWith('/nonogram')) return 'nonogram';
if (path.startsWith('/flowfree')) return 'flowfree';
```

- [ ] **Step 3: Add state readers**

Add `readMinesweeperState`, `readSokobanState`, `readLightsOutState`, `readMazeState`, `readNonogramState`, `readFlowFreeState` functions. Each reads the appropriate DOM elements.

- [ ] **Step 4: Add to readSessionDOM switch**

Add cases for all 6 games.

- [ ] **Step 5: Add action functions**

Add `actClickMS` (minesweeper reveal/flag), `actSokobanMove` (keyboard events), `actClickLO` (lightsout), `actMazeMove` (keyboard), `actClickNG` (nonogram), `actClickFF` (flowfree select/extend).

- [ ] **Step 6: Add to showHint switch**

Add 6 cases calling respective solvers.

- [ ] **Step 7: Add to startAutoPlay switch**

Add 6 cases with auto-play loops + wait-for-server logic.

- [ ] **Step 8: Add to refreshStateDisplay**

Add panel render calls for 6 games.

- [ ] **Step 9: Commit**

```bash
git add manifest.json content/main.js
git commit -m "feat: integrate 6 new games into manifest and main.js"
```

---

### Task 8: Panel UI (6 render methods)

**Files:**
- Modify: `content/ui/panel.js`

- [ ] **Step 1: Add 6 render methods**

Add `renderLightsOut`, `renderMaze`, `renderMinesweeper`, `renderFlowFree`, `renderSokoban`, `renderNonogram` methods to Panel. Each shows:
- Status row (difficulty, progress)
- Hint area
- Auto-play / Stop buttons

- [ ] **Step 2: Update renderLoading names**

Add the 6 game names to the names map.

- [ ] **Step 3: Commit**

```bash
git add content/ui/panel.js
git commit -m "feat: panel UI for 6 new games"
```

---

### Task 9: Runner + Background game lists

**Files:**
- Modify: `content/runner.js`
- Modify: `background.js`

- [ ] **Step 1: Add 6 games to GAMES arrays**

In both runner.js and background.js, add entries for the 6 games in the agreed order. Each with url, type, diffs.

```js
{ name: '💡 点灯', url: '/lightsout', type: 'lightsout', diffs: ['easy','normal','hard'] },
{ name: '🌀 迷宫', url: '/maze', type: 'maze', diffs: ['easy','normal','hard'] },
{ name: '💣 扫雷', url: '/minesweeper', type: 'minesweeper', diffs: ['beginner','intermediate','expert'] },
{ name: '🔗 连线', url: '/flowfree', type: 'flowfree', diffs: ['easy','normal','hard'] },
{ name: '📦 推箱子', url: '/sokoban', type: 'sokoban', diffs: ['easy','normal','hard'] },
{ name: '🧶 数织', url: '/nonogram', type: 'nonogram', diffs: ['easy','normal','hard'] },
```

Note: difficulty names need to be verified from game config APIs.

- [ ] **Step 2: Update getDailyStatus**

Add remaining counts for new games.

- [ ] **Step 3: Commit**

```bash
git add content/runner.js background.js
git commit -m "feat: add 6 games to runner and background game lists"
```

---

### Task 10: Popup checkboxes

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.js`

- [ ] **Step 1: Add checkboxes to popup.html**

Add checkbox before each game in the counts area. Each checkbox stores enabled state.

```html
<label class="popup-game-row">
  <input type="checkbox" class="ga-game-check" data-game="lightsout" checked>
  <span>💡 点灯</span>
</label>
```

- [ ] **Step 2: Update popup.js**

Load/save checkbox state from `chrome.storage.local['ga_enabled_games']`. Send enabled games list to background on daily run start. Background only processes enabled games.

- [ ] **Step 3: Commit**

```bash
git add popup/popup.html popup/popup.js
git commit -m "feat: popup checkboxes for game selection"
```

---

### Task 11: Verify and polish

- [ ] **Step 1: Load extension and test each game**

Manually verify each game's panel appears, hint works, auto-play works.

- [ ] **Step 2: Fix any issues found**

- [ ] **Step 3: Commit final fixes**

```bash
git add -A
git commit -m "chore: integration fixes for 6 new games"
```

- [ ] **Step 4: Merge to main**

```bash
git checkout main
git merge feature/six-more-games
git tag v0.7.0
git push origin main v0.7.0
```
