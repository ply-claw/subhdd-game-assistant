'use strict';

// 3×3 2048 Solver — heavy positional evaluation + expectimax with sampling
// State space is small (9 cells × ~10 values), but branching is high.
// Strategy: strong heuristic makes up for shallower search.

// ============== Board encoding (36-bit integer, perfect for 3x3) ============
function encode3x3(board) {
  let v = 0n;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const tile = board[r][c];
      const bits = tile === 0 ? 0n : BigInt(Math.round(Math.log2(tile)));
      v |= bits << BigInt((r * 3 + c) * 4);
    }
  return v;
}

// ============== Game engine ================================================
function createBoard() { return Array.from({length:3}, ()=>Array(3).fill(0)); }
function cloneBoard(b) { return b.map(r=>[...r]); }

function addTile(board) {
  const e = []; for (let r=0;r<3;r++) for (let c=0;c<3;c++) if (board[r][c]===0) e.push({r,c});
  if (!e.length) return false;
  const p = e[Math.floor(Math.random()*e.length)];
  board[p.r][p.c] = Math.random()<0.9 ? 2 : 4;
  return true;
}
function initBoard() { const b = createBoard(); addTile(b); addTile(b); return b; }

function slide(line) {
  let a = line.filter(v=>v!==0), s = 0;
  for (let i=0;i<a.length-1;i++) { if (a[i]===a[i+1]) { a[i]*=2; s+=a[i]; a[i+1]=0; i++; } }
  return { l: a.filter(v=>v!==0), s };
}

function applyMove(board, dir) {
  const nb = createBoard(); let score = 0;
  for (let r=0;r<3;r++) {
    let line;
    if (dir==='left') line = board[r];
    else if (dir==='right') { line = [...board[r]].reverse(); }
    else if (dir==='up') { line = [board[0][r],board[1][r],board[2][r]]; }
    else { line = [board[2][r],board[1][r],board[0][r]]; }
    const res = slide(line);
    for (let i=0;i<res.l.length;i++) {
      if (dir==='left') nb[r][i]=res.l[i];
      else if (dir==='right') nb[r][2-i]=res.l[i];
      else if (dir==='up') nb[i][r]=res.l[i];
      else nb[2-i][r]=res.l[i];
    }
    score += res.s;
  }
  let changed = false;
  for (let r=0;r<3;r++) for (let c=0;c<3;c++) if (nb[r][c]!==board[r][c]) changed=true;
  return {board:nb, score, changed};
}

function emptyCells(board) {
  const e = []; for (let r=0;r<3;r++) for (let c=0;c<3;c++) if (board[r][c]===0) e.push({r,c}); return e;
}
function isGameOver(board) { return ['up','down','left','right'].every(d=>!applyMove(board,d).changed); }
function hasWon(board,target) { return board.some(r=>r.some(v=>v>=target)); }

// ============== Evaluation (tuned for 3x3) ==================================
// Key principles for 3x3 with limited space:
// 1. Max tile MUST be in a corner
// 2. Snake pattern from the corner is critical
// 3. Empty cells are extremely valuable (diminishing returns after 3-4)
// 4. Large adjacent value gaps are dangerous (can't merge)
// 5. Arrange tiles so same-value pairs are adjacent (merge potential)

function evaluate3x3(board) {
  const W = [ // snake weight matrix from corner (2,2) going left-then-up
    [1, 2, 3],
    [6, 5, 4],
    [7, 8, 9],
  ];

  const corners = [[0,0],[0,2],[2,0],[2,2]];

  // Find max tile
  let maxV=0, maxR=0, maxC=0;
  for (let r=0;r<3;r++) for (let c=0;c<3;c++) if (board[r][c]>maxV) {maxV=board[r][c];maxR=r;maxC=c;}

  let bestScore = -Infinity;

  // Try each corner as the anchor
  for (const [cr, cc] of corners) {
    let score = 0;
    let emptyCount = 0;

    // Position-weighted tile scoring
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const v = board[r][c];
        if (v === 0) { emptyCount++; continue; }
        // Weight by snake position from corner
        const dr = Math.abs(r - cr), dc = Math.abs(c - cc);
        const snakePos = dr * 3 + (dr % 2 === 0 ? dc : 2 - dc);
        const weight = (9 - snakePos) * (9 - snakePos);
        score += weight * Math.log2(v) * 50;
      }
    }

    // Empty cells: critical for survival
    // 0 empties = usually dead, 1-2 = tight, 3+ = comfortable
    if (emptyCount === 0) score -= 50000;
    else if (emptyCount === 1) score -= 10000;
    else score += emptyCount * 3000; // caps at ~9000 for 3 empty

    // Corner anchor: max tile position matters enormously
    const cornerDist = Math.abs(maxR - cr) + Math.abs(maxC - cc);
    if (cornerDist === 0) score += Math.log2(maxV) * 500;  // perfect
    else if (cornerDist === 1) score -= Math.log2(maxV) * 200; // one off
    else score -= Math.log2(maxV) * 1000; // opposite corner

    // Monotonicity: tiles should decrease from corner
    // Check rows and columns
    let monoBonus = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        const a = board[r][c], b = board[r][c + 1];
        if (a === 0 || b === 0) continue;
        // Penalize when smaller tile is closer to corner
        const da = Math.abs(r-cr)+Math.abs(c-cc), db = Math.abs(r-cr)+Math.abs(c+1-cc);
        if (da < db && a < b) monoBonus -= Math.log2(b/a) * 100;
        if (da > db && a > b) monoBonus -= Math.log2(a/b) * 100;
        if (da < db && a >= b) monoBonus += Math.log2(a/b) * 80;
      }
    }
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 2; r++) {
        const a = board[r][c], b = board[r + 1][c];
        if (a === 0 || b === 0) continue;
        const da = Math.abs(r-cr)+Math.abs(c-cc), db = Math.abs(r+1-cr)+Math.abs(c-cc);
        if (da < db && a < b) monoBonus -= Math.log2(b/a) * 100;
        if (da > db && a > b) monoBonus -= Math.log2(a/b) * 100;
        if (da < db && a >= b) monoBonus += Math.log2(a/b) * 80;
      }
    }
    score += monoBonus;

    // Merge potential: adjacent equal tiles
    let mergeScore = 0;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++)
        if (board[r][c] !== 0 && board[r][c] === board[r][c + 1])
          mergeScore += Math.log2(board[r][c]) * 200;
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 2; r++)
        if (board[r][c] !== 0 && board[r][c] === board[r + 1][c])
          mergeScore += Math.log2(board[r][c]) * 200;
    score += mergeScore;

    // Smoothness: penalize extreme value gaps (makes merging impossible)
    let smoothPenalty = 0;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++)
        if (board[r][c] !== 0 && board[r][c+1] !== 0) {
          const diff = Math.abs(Math.log2(board[r][c]) - Math.log2(board[r][c+1]));
          smoothPenalty += diff * diff * 30;
        }
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 2; r++)
        if (board[r][c] !== 0 && board[r+1][c] !== 0) {
          const diff = Math.abs(Math.log2(board[r][c]) - Math.log2(board[r+1][c]));
          smoothPenalty += diff * diff * 30;
        }
    score -= smoothPenalty;

    if (score > bestScore) bestScore = score;
  }

  return Math.round(bestScore);
}

// ============== Search =====================================================
function processScore(s) {
  if (s < 200) return Math.max(0, (s>>2)-10);
  if (s < 500) return (s>>1)-12;
  if (s < 1000) return (s>>1)+144;
  if (s < 2000) return s+600;
  return 3000;
}

function search0(board) {
  let best = -1e9;
  for (const d of ['up','down','left','right']) {
    const {board:nb, changed, score} = applyMove(board, d);
    if (!changed) continue;
    const v = evaluate3x3(nb) + processScore(score);
    if (v > best) best = v;
  }
  return best;
}

// Transposition table: Map<BigInt_key, {depth, score}>
let gCache = new Map();
let gCacheHits = 0, gCacheMisses = 0;

function keyForCache(board, depth) {
  return (encode3x3(board) << 8n) | BigInt(depth);
}

function searchChance(board, depth) {
  if (depth <= 0) return search0(board);
  const empties = emptyCells(board);
  if (empties.length === 0) return evaluate3x3(board);

  const key = keyForCache(board, depth);
  if (gCache.has(key)) { gCacheHits++; return gCache.get(key); }
  gCacheMisses++;

  // For 3x3, sampling is necessary at higher empty counts
  // but we can afford all cells when there are few empties
  const sampleN = empties.length <= 4 ? empties.length : Math.min(empties.length, 4);
  const sampled = empties;
  if (sampleN < empties.length) {
    // Strategic sampling: prioritize cells near large tiles
    let maxT = 0; for (const p of empties) {
      for (const p2 of empties) {
        // not applicable here, just random shuffle
      }
    }
    // Shuffle and take first sampleN
    for (let i = sampled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sampled[i], sampled[j]] = [sampled[j], sampled[i]];
    }
  }
  const iter = sampled.slice(0, sampleN);

  let total = 0;
  for (const p of iter) {
    const b2 = cloneBoard(board); b2[p.r][p.c] = 2;
    total += 0.9 * searchPlayer(b2, depth - 1);
    const b4 = cloneBoard(board); b4[p.r][p.c] = 4;
    total += 0.1 * searchPlayer(b4, depth - 1);
  }

  const result = Math.round(total / iter.length);
  gCache.set(key, result);
  return result;
}

function searchPlayer(board, depth) {
  if (depth <= 0) return search0(board);
  let best = -1e9;
  for (const d of ['up','down','left','right']) {
    const {board:nb, changed, score} = applyMove(board, d);
    if (!changed) continue;
    const v = searchChance(nb, depth) + processScore(score);
    if (v > best) best = v;
  }
  return best === -1e9 ? -1e9 : best;
}

function getBestMove(board, depth) {
  gCache = new Map(); gCacheHits = 0; gCacheMisses = 0;
  const d = Math.max(1, Math.min(depth || 3, 6));
  let bestDir = null, bestScore = -1e9;
  for (const dir of ['up','down','left','right']) {
    const {board:nb, changed, score} = applyMove(board, dir);
    if (!changed) continue;
    const v = searchChance(nb, d) + processScore(score);
    if (v > bestScore) { bestScore = v; bestDir = dir; }
  }
  return bestDir ? {direction:bestDir, score:bestScore, depth:d} : null;
}

// ============== Game runner ================================================
function playGame(depth) {
  const board = initBoard();
  let score=0, moves=0;
  const start = process.hrtime.bigint();
  while(true) {
    const best = getBestMove(board, depth);
    if (!best||!best.direction) break;
    const {board:nb, score:s, changed} = applyMove(board, best.direction);
    if (!changed) break;
    for (let r=0;r<3;r++) for (let c=0;c<3;c++) board[r][c]=nb[r][c];
    score+=s; moves++; addTile(board);
    if (hasWon(board, 512)) return {won:true, score, moves, maxTile:512, ms:Number((process.hrtime.bigint()-start)/1000000n)};
    if (isGameOver(board)) {
      let mt=0; for (let r=0;r<3;r++) for (let c=0;c<3;c++) if (board[r][c]>mt) mt=board[r][c];
      return {won:false, score, moves, maxTile:mt, ms:Number((process.hrtime.bigint()-start)/1000000n)};
    }
  }
  let mt=0; for (let r=0;r<3;r++) for (let c=0;c<3;c++) if (board[r][c]>mt) mt=board[r][c];
  return {won:false, score, moves, maxTile:mt, ms:Number((process.hrtime.bigint()-start)/1000000n)};
}

// ============== Batch ======================================================
const DEPTH = parseInt(process.argv[2]||'3');
const GAMES = parseInt(process.argv[3]||'100');
console.log(`\n=== 3x3 2048 Solver Test (depth=${DEPTH}, games=${GAMES}) ===\n`);

let won=0, ts=0, tm=0, tmt=0, tms=0;
const dist = {};
const t0 = process.hrtime.bigint();
const report = Math.max(1,Math.floor(GAMES/10));

for (let i=0;i<GAMES;i++) {
  const r = playGame(DEPTH);
  ts+=r.score; tm+=r.moves; tmt+=r.maxTile; tms+=r.ms;
  dist[r.maxTile] = (dist[r.maxTile]||0)+1;
  if (r.won) won++;
  if ((i+1)%report===0||i===GAMES-1) {
    const n=i+1;
    console.log(`[${String(n).padStart(4)}/${GAMES}] win:${(won/n*100).toFixed(1)}% avg_s:${Math.round(ts/n)} avg_m:${Math.round(tm/n)} avg_ms:${Math.round(tms/n)}`);
  }
}

console.log(`\n--- Results depth=${DEPTH} ---`);
console.log(`Won:     ${won}/${GAMES} (${(won/GAMES*100).toFixed(1)}%)`);
console.log(`Avg s:   ${Math.round(ts/GAMES)}`);
console.log(`Avg m:   ${Math.round(tm/GAMES)}`);
console.log(`Avg max: ${Math.round(tmt/GAMES)}`);
console.log(`Avg ms:  ${Math.round(tms/GAMES)}`);
console.log(`Total:   ${(Number((process.hrtime.bigint()-t0)/1000000000n)).toFixed(1)}s`);
console.log(`Tiles:   ${Object.entries(dist).sort((a,b)=>+a[0]-+b[0]).map(([k,v])=>k+':'+v).join(' ')}`);
