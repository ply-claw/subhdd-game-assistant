# Chrome Game Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension (MV3) that injects solvers and auto-play into the four puzzle games on sub.hdd.sb

**Architecture:** Content script injects a `<script>` tag into the page context to access game state and API functions. Content script manages a sidebar UI panel. Extension popup provides daily full-clear launcher.

**Tech Stack:** Vanilla JS (no bundler), Manifest V3, CSS custom properties for theming

---

### Task 1: Project scaffolding — manifest, icons, directory structure

**Files:**
- Create: `manifest.json`
- Create: `content/main.js`
- Create: `content/inject.js`
- Create: `content/ui/panel.js`
- Create: `content/ui/panel.css`
- Create: `content/solvers/solver2048.js`
- Create: `content/solvers/solverMemory.js`
- Create: `content/solvers/solverPuzzle15.js`
- Create: `content/solvers/solverSudoku.js`
- Create: `content/runner.js`
- Create: `popup/popup.html`
- Create: `popup/popup.css`
- Create: `popup/popup.js`
- Create: `icons/icon.svg`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "SubHDD Game Assistant",
  "version": "0.1.0",
  "description": "Game assistant for sub.hdd.sb — 2048, memory, puzzle15, sudoku",
  "permissions": ["storage", "notifications"],
  "host_permissions": ["https://sub.hdd.sb/*"],
  "content_scripts": [
    {
      "matches": [
        "https://sub.hdd.sb/puzzle2048*",
        "https://sub.hdd.sb/memory*",
        "https://sub.hdd.sb/puzzle15*",
        "https://sub.hdd.sb/sudoku*"
      ],
      "js": ["content/main.js"],
      "css": ["content/ui/panel.css"]
    }
  ],
  "action": {
    "default_title": "SubHDD Game Assistant",
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon.svg",
      "48": "icons/icon.svg",
      "128": "icons/icon.svg"
    }
  },
  "icons": {
    "16": "icons/icon.svg",
    "48": "icons/icon.svg",
    "128": "icons/icon.svg"
  }
}
```

- [ ] **Step 2: Create SVG icon**

Write `icons/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#6366f1"/>
  <text x="64" y="88" font-size="72" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="bold">A</text>
</svg>
```

- [ ] **Step 3: Create stub files**

Create each of the remaining files with a placeholder comment:

`content/main.js`:
```js
'use strict';
console.log('[GA] content script loaded');
// Load panel after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
function init() {
  // inject bridge script, create panel, start communication
}
```

All other `.js` files: `'use strict';` comment only.
All `.css` files: empty.
`popup/popup.html`: minimal HTML5 document with `<script src="popup.js">`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: scaffold project with manifest, directory structure, stubs"
```

---

### Task 2: Content script entry — panel creation and script injection

**Files:**
- Modify: `content/main.js`
- Modify: `content/inject.js`

- [ ] **Step 1: Write inject.js — bridge that runs in page main world**

```js
'use strict';

// This script runs in the page's main world.
// It listens for commands from the isolated content script and executes them.

(function () {
  const PAGE = window.location.pathname;
  let gameType = null;
  if (PAGE.startsWith('/puzzle2048')) gameType = 'puzzle2048';
  else if (PAGE.startsWith('/memory')) gameType = 'memory';
  else if (PAGE.startsWith('/puzzle15')) gameType = 'puzzle15';
  else if (PAGE.startsWith('/sudoku')) gameType = 'sudoku';

  // Listen for commands from content script (via CustomEvent)
  window.addEventListener('ga-command', (ev) => {
    const { commandId, type, payload } = ev.detail;

    function respond(data) {
      window.postMessage({
        source: 'ga-inject',
        commandId,
        type: type + 'Result',
        data,
      }, '*');
    }

    try {
      switch (type) {
        case 'getState': {
          // Access window.state if the game page exposes it
          const s = window.state;
          if (!s || !s.activeSession) {
            respond({ hasActiveSession: false, gameType });
            break;
          }
          const sess = s.activeSession;
          respond({
            hasActiveSession: true,
            gameType,
            difficulty: sess.difficulty,
            session: {
              session_id: sess.session_id,
              size: sess.size,
              board: sess.board,
              score: sess.score,
              max_tile: sess.max_tile,
              move_count: sess.move_count,
              won: sess.won,
              game_over: sess.game_over,
              // memory-specific
              rows: sess.rows,
              cols: sess.cols,
              pairs: sess.pairs,
              peek_limit: sess.peek_limit,
              matched_indices: sess.matched_indices,
              // sudoku-specific
              givens: sess.givens,
              user_board: sess.user_board,
              conflicts: sess.conflicts,
              // puzzle15
              starting_board: sess.starting_board,
            },
          });
          break;
        }

        case 'startGame': {
          if (gameType === 'puzzle2048') window.startGame(payload.difficulty);
          else if (gameType === 'memory') window.startGame(payload.difficulty);
          else if (gameType === 'puzzle15') window.startGame(payload.difficulty);
          else if (gameType === 'sudoku') window.startGame(payload.difficulty);
          respond({ ok: true });
          break;
        }

        case 'move': {
          if (gameType === 'puzzle2048') window.sendMove(payload.direction);
          else if (gameType === 'puzzle15') window.sendMove(payload);
          respond({ ok: true });
          break;
        }

        case 'flip': {
          if (gameType === 'memory') window.flipCard(payload.index);
          respond({ ok: true });
          break;
        }

        case 'fillCell': {
          if (gameType === 'sudoku') window.fillCell(payload.row, payload.col, payload.value);
          respond({ ok: true });
          break;
        }

        case 'abandon': {
          if (gameType === 'puzzle2048') window.abandonGame();
          else if (gameType === 'memory') window.abandonGame();
          else if (gameType === 'puzzle15') window.abandonGame();
          else if (gameType === 'sudoku') window.abandonGame();
          respond({ ok: true });
          break;
        }

        default:
          respond({ error: 'unknown command: ' + type });
      }
    } catch (e) {
      respond({ error: e.message });
    }
  });

  // Forward API responses from the page back to content script
  // We proxy through because sendMove/flipCard/fillCell update state asynchronously
  // and the page may have result handlers we can intercept
  window.addEventListener('ga-state-change', () => {
    window.postMessage({
      source: 'ga-inject',
      type: 'stateChanged',
      data: { gameType },
    }, '*');
  });

  window.postMessage({ source: 'ga-inject', type: 'ready', data: { gameType } }, '*');
})();
```

- [ ] **Step 2: Write main.js — content script entry**

```js
'use strict';
console.log('[GA] content script loaded');

let commandSeq = 0;

function sendCommand(type, payload) {
  const commandId = ++commandSeq;
  return new Promise((resolve) => {
    const handler = (ev) => {
      if (ev.data.source !== 'ga-inject') return;
      if (ev.data.commandId !== commandId) return;
      window.removeEventListener('message', handler);
      resolve(ev.data.data);
    };
    window.addEventListener('message', handler);
    window.dispatchEvent(new CustomEvent('ga-command', {
      detail: { commandId, type, payload },
    }));
  });
}

function injectBridge() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/inject.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function createPanel() {
  if (document.getElementById('ga-panel-root')) return;
  const root = document.createElement('div');
  root.id = 'ga-panel-root';
  root.innerHTML = `
    <div class="ga-panel">
      <div class="ga-panel-header">
        <span class="ga-panel-title">Game Assistant</span>
        <button class="ga-panel-close" title="收起">✕</button>
      </div>
      <div class="ga-panel-body" id="ga-panel-body">
        <p class="ga-panel-status">等待游戏加载...</p>
      </div>
      <div class="ga-panel-footer" id="ga-panel-footer"></div>
    </div>
    <button class="ga-panel-toggle" id="ga-panel-toggle" title="展开面板">◀</button>
  `;
  document.body.appendChild(root);

  // Toggle behavior
  const panel = root.querySelector('.ga-panel');
  const toggle = root.querySelector('#ga-panel-toggle');
  const close = root.querySelector('.ga-panel-close');

  function collapse() {
    panel.classList.add('ga-collapsed');
    toggle.classList.add('ga-visible');
    toggle.textContent = '▶';
  }
  function expand() {
    panel.classList.remove('ga-collapsed');
    toggle.classList.remove('ga-visible');
    toggle.textContent = '◀';
  }

  close.addEventListener('click', collapse);
  toggle.addEventListener('click', expand);
}

// Listen for state changes from inject script
window.addEventListener('message', (ev) => {
  if (ev.data.source !== 'ga-inject') return;
  if (ev.data.type === 'ready') {
    console.log('[GA] inject bridge ready for', ev.data.data.gameType);
    updatePanelForGame(ev.data.data.gameType);
  }
  if (ev.data.type === 'stateChanged') {
    refreshState();
  }
});

function updatePanelForGame(gameType) {
  // Called after bridge is ready — update panel content
  console.log('[GA] game detected:', gameType);
}

async function refreshState() {
  const state = await sendCommand('getState');
  console.log('[GA] state:', state);
}

function init() {
  injectBridge();
  createPanel();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 3: Register inject.js as web_accessible_resource**

Add to `manifest.json`:
```json
"web_accessible_resources": [
  {
    "resources": ["content/inject.js", "content/solvers/*.js"],
    "matches": ["https://sub.hdd.sb/*"]
  }
]
```

- [ ] **Step 4: Commit**

```bash
git add content/main.js content/inject.js manifest.json
git commit -m "feat: content script entry with bridge injection and panel shell"
```

---

### Task 3: Panel CSS — sidebar styling

**Files:**
- Modify: `content/ui/panel.css`

- [ ] **Step 1: Write panel CSS**

```css
/* ---- Panel Root ---- */
#ga-panel-root {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 99999;
  height: 100vh;
  display: flex;
  flex-direction: row;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  pointer-events: none;
}

.ga-panel {
  width: 280px;
  background: #1e293b;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0,0,0,0.4);
  transition: transform 0.25s ease;
  pointer-events: all;
  height: 100%;
}

.ga-panel.ga-collapsed {
  transform: translateX(280px);
}

/* ---- Header ---- */
.ga-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}

.ga-panel-title {
  font-weight: 700;
  font-size: 14px;
  color: #38bdf8;
}

.ga-panel-close {
  background: none;
  border: none;
  color: #64748b;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.ga-panel-close:hover { color: #e2e8f0; background: #334155; }

/* ---- Body ---- */
.ga-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.ga-panel-body::-webkit-scrollbar { width: 4px; }
.ga-panel-body::-webkit-scrollbar-thumb { background: #475569; border-radius: 2px; }

/* ---- Footer ---- */
.ga-panel-footer {
  padding: 10px 14px;
  border-top: 1px solid #334155;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ---- Toggle Button ---- */
.ga-panel-toggle {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 48px;
  background: #334155;
  color: #94a3b8;
  border: none;
  border-radius: 6px 0 0 6px;
  cursor: pointer;
  font-size: 11px;
  pointer-events: all;
  display: none;
  box-shadow: -2px 0 8px rgba(0,0,0,0.3);
}
.ga-panel-toggle.ga-visible { display: block; }
.ga-panel-toggle:hover { background: #475569; color: #e2e8f0; }

/* ---- Buttons ---- */
.ga-btn {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.ga-btn-auto { background: #166534; color: #fff; }
.ga-btn-auto:hover { background: #15803d; }
.ga-btn-hint { background: #1e40af; color: #fff; }
.ga-btn-hint:hover { background: #1d4ed8; }
.ga-btn-stop { background: #854d0e; color: #fff; }
.ga-btn-stop:hover { background: #a16207; }
.ga-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---- Status row ---- */
.ga-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #334155;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 12px;
}
.ga-status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ga-status-dot.is-waiting { background: #64748b; }
.ga-status-dot.is-ready { background: #22c55e; }
.ga-status-dot.is-busy { background: #eab308; animation: ga-pulse 1s infinite; }
.ga-status-dot.is-win { background: #22c55e; }
.ga-status-dot.is-loss { background: #ef4444; }

@keyframes ga-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ---- Hint text ---- */
.ga-hint {
  padding: 8px 10px;
  background: #312e81;
  border: 1px solid #4338ca;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 15px;
  text-align: center;
  line-height: 1.6;
}

/* ---- Solution grid (sudoku) ---- */
.ga-sudoku-grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 1px;
  background: #475569;
  border: 2px solid #475569;
  border-radius: 4px;
  margin-bottom: 8px;
}
.ga-sudoku-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  background: #1e293b;
  color: #e2e8f0;
}
.ga-sudoku-cell.is-given { color: #38bdf8; font-weight: 700; }
.ga-sudoku-cell.is-solved { color: #4ade80; }

/* ---- Step list (puzzle15) ---- */
.ga-steps {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 8px;
  font-size: 12px;
  line-height: 1.7;
}
.ga-step { padding: 2px 4px; border-radius: 3px; }
.ga-step:nth-child(odd) { background: #334155; }

/* ---- Memory pairs table ---- */
.ga-memory-table {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 11px;
}
.ga-memory-row {
  padding: 4px 6px;
  background: #334155;
  border-radius: 4px;
}
.ga-memory-row.is-matched { background: #14532d; text-decoration: line-through; }

/* ---- Depth slider ---- */
.ga-depth-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}
.ga-depth-row input { flex:1; accent-color: #38bdf8; }

/* ---- Progress bar ---- */
.ga-progress {
  height: 4px;
  background: #334155;
  border-radius: 2px;
  margin-bottom: 8px;
  overflow: hidden;
}
.ga-progress-fill {
  height: 100%;
  background: #22c55e;
  border-radius: 2px;
  transition: width 0.3s;
}

/* ---- Log ---- */
.ga-log {
  font-size: 11px;
  color: #94a3b8;
  max-height: 120px;
  overflow-y: auto;
  line-height: 1.5;
}
.ga-log-entry { padding: 1px 0; }
.ga-log-entry.is-error { color: #fca5a5; }
.ga-log-entry.is-win { color: #86efac; }

/* ---- Speed slider ---- */
.ga-speed-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
}
.ga-speed-row input { flex: 1; accent-color: #38bdf8; }
```

- [ ] **Step 2: Commit**

```bash
git add content/ui/panel.css
git commit -m "feat: panel CSS styling for sidebar overlay"
```

---

### Task 4: Panel logic — game-specific UI and action bindings

**Files:**
- Modify: `content/ui/panel.js`
- Modify: `content/main.js`

- [ ] **Step 1: Write panel.js — UI update functions**

```js
'use strict';

const Panel = {
  el(id) { return document.getElementById(id); },

  setBody(html) {
    const body = this.el('ga-panel-body');
    if (body) body.innerHTML = html;
  },

  setFooter(html) {
    const footer = this.el('ga-panel-footer');
    if (footer) footer.innerHTML = html;
  },

  setStatus(text, kind) {
    const row = this.el('ga-status-row');
    if (row) {
      row.innerHTML = `<span class="ga-status-dot is-${kind}"></span> ${text}`;
    }
  },

  showHint(text) {
    const existing = this.el('ga-hint');
    if (existing) existing.textContent = text;
    else {
      const body = this.el('ga-panel-body');
      if (body) body.insertAdjacentHTML('afterbegin', `<div class="ga-hint" id="ga-hint">${text}</div>`);
    }
  },

  // --- 2048 specific ---
  render2048(state) {
    const sess = state.session;
    this.setBody(`
      <div class="ga-status-row" id="ga-status-row">
        <span class="ga-status-dot is-ready"></span>
        进行中 · ${sess.difficulty}
      </div>
      <div id="ga-hint" class="ga-hint">—</div>
      <div class="ga-depth-row">
        <span>搜索深度:</span>
        <input type="range" id="ga-depth" min="1" max="5" value="3" step="1">
        <span id="ga-depth-val">3</span>
      </div>
      <div style="font-size:12px;color:#94a3b8;line-height:1.6">
        分数: ${sess.score} · 步数: ${sess.move_count} · 最大: ${sess.max_tile}
      </div>
    `);
    this.el('ga-depth').addEventListener('input', () => {
      this.el('ga-depth-val').textContent = this.el('ga-depth').value;
    });
    this.setFooter(`
      <button class="ga-btn ga-btn-hint" id="ga-btn-show-hint">显示推荐方向</button>
      <button class="ga-btn ga-btn-auto" id="ga-btn-auto">自动完成本局</button>
      <button class="ga-btn ga-btn-stop" id="ga-btn-stop">停止</button>
    `);
  },

  // --- Memory specific ---
  renderMemory(state) {
    const sess = state.session;
    this.setBody(`
      <div class="ga-status-row" id="ga-status-row">
        <span class="ga-status-dot is-ready"></span>
        进行中 · ${sess.difficulty}
      </div>
      <div id="ga-hint" class="ga-hint">点击开始追踪配对</div>
      <div style="font-size:12px;color:#94a3b8;line-height:1.6">
        已配对: 0/${sess.pairs}
      </div>
    `);
    this.setFooter(`
      <button class="ga-btn ga-btn-auto" id="ga-btn-auto">自动完成本局</button>
      <button class="ga-btn ga-btn-stop" id="ga-btn-stop">停止</button>
    `);
  },

  // --- Puzzle15 specific ---
  renderPuzzle15(state) {
    const sess = state.session;
    this.setBody(`
      <div class="ga-status-row" id="ga-status-row">
        <span class="ga-status-dot is-ready"></span>
        进行中 · ${sess.difficulty} · ${sess.size}×${sess.size}
      </div>
      <div class="ga-steps" id="ga-steps">计算中...</div>
      <div style="font-size:12px;color:#94a3b8;line-height:1.6">
        步数: ${sess.move_count}
      </div>
    `);
    this.setFooter(`
      <button class="ga-btn ga-btn-hint" id="ga-btn-show-hint">显示解法步骤</button>
      <button class="ga-btn ga-btn-auto" id="ga-btn-auto">自动完成本局</button>
      <button class="ga-btn ga-btn-stop" id="ga-btn-stop">停止</button>
    `);
  },

  // --- Sudoku specific ---
  renderSudoku(state) {
    const sess = state.session;
    this.setBody(`
      <div class="ga-status-row" id="ga-status-row">
        <span class="ga-status-dot is-ready"></span>
        进行中 · ${sess.difficulty}
      </div>
      <div class="ga-sudoku-grid" id="ga-sudoku-grid"></div>
      <div style="font-size:12px;color:#94a3b8;line-height:1.6">
        冲突: ${(sess.conflicts || []).length}
      </div>
    `);
    this.setFooter(`
      <button class="ga-btn ga-btn-hint" id="ga-btn-show-hint">显示完整答案</button>
      <button class="ga-btn ga-btn-auto" id="ga-btn-auto">自动完成本局</button>
      <button class="ga-btn ga-btn-stop" id="ga-btn-stop">停止</button>
    `);
  },

  // --- Common ---
  renderLoading(gameType) {
    const names = { puzzle2048: '2048', memory: '记忆翻牌', puzzle15: '华容道', sudoku: '数独' };
    this.setBody(`
      <div class="ga-status-row" id="ga-status-row">
        <span class="ga-status-dot is-waiting"></span>
        ${names[gameType] || gameType} — 等待开始
      </div>
    `);
  },

  renderDailyRunner(progress) {
    this.setBody(`
      <div style="font-weight:700;margin-bottom:8px;color:#fbbf24">每日一键全通</div>
      <div class="ga-progress">
        <div class="ga-progress-fill" style="width:${progress.percent}%"></div>
      </div>
      <div class="ga-log" id="ga-log">
        ${(progress.log || []).map((e) => `<div class="ga-log-entry ${e.level ? 'is-' + e.level : ''}">${e.text}</div>`).join('')}
      </div>
    `);
    this.setFooter(`
      <button class="ga-btn ga-btn-stop" id="ga-btn-stop">停止</button>
    `);
  },
};
```

- [ ] **Step 2: Integrate panel into main.js**

Replace `updatePanelForGame` and `refreshState` in `content/main.js`:

```js
let currentGameType = null;
let currentState = null;

function updatePanelForGame(gameType) {
  currentGameType = gameType;
  Panel.renderLoading(gameType);
}

async function refreshState() {
  if (!currentGameType) return;
  currentState = await sendCommand('getState');
  if (currentState.hasActiveSession) {
    switch (currentGameType) {
      case 'puzzle2048': Panel.render2048(currentState); break;
      case 'memory': Panel.renderMemory(currentState); break;
      case 'puzzle15': Panel.renderPuzzle15(currentState); break;
      case 'sudoku': Panel.renderSudoku(currentState); break;
    }
    bindButtons();
  } else {
    Panel.renderLoading(currentGameType);
  }
}

function bindButtons() {
  const hintBtn = document.getElementById('ga-btn-show-hint');
  const autoBtn = document.getElementById('ga-btn-auto');
  const stopBtn = document.getElementById('ga-btn-stop');

  if (hintBtn) hintBtn.onclick = showHint;
  if (autoBtn) autoBtn.onclick = startAutoPlay;
  if (stopBtn) stopBtn.onclick = stopAutoPlay;
}

// will be wired to solvers later
function showHint() { console.log('[GA] show hint'); }
async function startAutoPlay() { console.log('[GA] auto play'); }
function stopAutoPlay() { console.log('[GA] stop'); }
```

Call `refreshState()` after bridge ready. Also listen for `stateChanged` messages:
```js
window.addEventListener('message', (ev) => {
  if (ev.data.source !== 'ga-inject') return;
  if (ev.data.type === 'ready') {
    updatePanelForGame(ev.data.data.gameType);
    setTimeout(refreshState, 500);
  }
  if (ev.data.type === 'stateChanged') {
    refreshState();
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add content/ui/panel.js content/main.js
git commit -m "feat: panel logic with game-specific UI rendering"
```

---

### Task 5: 2048 Solver — Expectimax with configurable depth

**Files:**
- Modify: `content/solvers/solver2048.js`

- [ ] **Step 1: Write solver2048.js**

```js
'use strict';

// Expectimax solver for 2048.
// depth: search depth (1–5), higher = better moves but slower
// Strategy: think more, execute less — deeper search is cheaper than extra API round-trips

const Solver2048 = (() => {
  // Corner preference — weight tiles toward bottom-left corner
  const CORNER = { r: 0, c: 0 }; // default corner

  function cloneBoard(board) {
    return board.map((row) => [...row]);
  }

  function getSize(board) {
    return board.length;
  }

  // Slide a row/col in given direction (in-place on a 1D array, returns score)
  function slideLine(line) {
    // Remove zeros
    let arr = line.filter((v) => v !== 0);
    let score = 0;
    // Merge
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] === arr[i + 1]) {
        arr[i] *= 2;
        score += arr[i];
        arr[i + 1] = 0;
        i++; // skip merged
      }
    }
    arr = arr.filter((v) => v !== 0);
    return { line: arr, score };
  }

  function moveBoard(board, direction) {
    const size = getSize(board);
    const newBoard = Array.from({ length: size }, () => Array(size).fill(0));
    let totalScore = 0;
    let changed = false;

    for (let i = 0; i < size; i++) {
      let line;
      if (direction === 'left') {
        line = board[i].slice();
        const res = slideLine(line);
        newBoard[i] = [...res.line, ...Array(size - res.line.length).fill(0)];
        totalScore += res.score;
        if (res.line.some((v, j) => v !== board[i][j])) changed = true;
      } else if (direction === 'right') {
        line = board[i].slice().reverse();
        const res = slideLine(line);
        newBoard[i] = [...Array(size - res.line.length).fill(0), ...res.line.reverse()];
        totalScore += res.score;
        if (res.line.some((v, j) => v !== board[i][size - 1 - j])) changed = true;
      } else if (direction === 'up') {
        line = board.map((row) => row[i]);
        const res = slideLine(line);
        for (let r = 0; r < size; r++) {
          newBoard[r][i] = r < res.line.length ? res.line[r] : 0;
        }
        totalScore += res.score;
        if (res.line.some((v, r) => v !== board[r][i])) changed = true;
      } else if (direction === 'down') {
        line = board.map((row) => row[i]).reverse();
        const res = slideLine(line);
        for (let r = 0; r < size; r++) {
          newBoard[size - 1 - r][i] = r < res.line.length ? res.line[r] : 0;
        }
        totalScore += res.score;
        if (res.line.some((v, r) => v !== board[size - 1 - r][i])) changed = true;
      }
    }
    return { board: newBoard, score: totalScore, changed };
  }

  function emptyCells(board) {
    const cells = [];
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        if (board[r][c] === 0) cells.push({ r, c });
      }
    }
    return cells;
  }

  // Evaluation heuristic
  function evaluate(board) {
    const size = getSize(board);
    const W = [
      [16, 15, 14, 13, 12],
      [9, 10, 11, 12, 11],
      [8, 7, 6, 5, 10],
      [5, 4, 3, 2, 9],
      [4, 3, 2, 1, 8],
    ];

    let score = 0;
    let emptyCount = 0;
    let maxTile = 0;
    let sum = 0;
    let monotonicity = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const v = board[r][c];
        if (v === 0) { emptyCount++; continue; }
        if (v > maxTile) maxTile = v;
        sum += v;
        score += (W[r] && W[r][c] ? W[r][c] : 1) * Math.log2(v);
      }
    }

    // Monotonicity: reward decreasing rows/cols toward corner
    for (let r = 0; r < size; r++) {
      for (let c = 1; c < size; c++) {
        if (board[r][c] !== 0 && board[r][c - 1] !== 0) {
          if (board[r][c] <= board[r][c - 1]) monotonicity += 1;
          else monotonicity -= 2;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      for (let r = 1; r < size; r++) {
        if (board[r][c] !== 0 && board[r - 1][c] !== 0) {
          if (board[r][c] <= board[r - 1][c]) monotonicity += 1;
          else monotonicity -= 2;
        }
      }
    }

    return score + monotonicity * 50 + emptyCount * 200;
  }

  function expectimax(board, depth, isPlayer) {
    if (depth === 0) return { score: evaluate(board) };

    const size = getSize(board);
    const dirs = ['up', 'down', 'left', 'right'];

    if (isPlayer) {
      let best = { direction: null, score: -Infinity };
      for (const dir of dirs) {
        const { board: newBoard, changed } = moveBoard(board, dir);
        if (!changed) continue;
        const { score } = expectimax(newBoard, depth - 1, false);
        if (score > best.score) {
          best = { direction: dir, score };
        }
      }
      if (best.direction === null) return { score: -1e9 }; // no moves
      return best;
    } else {
      const empties = emptyCells(board);
      if (empties.length === 0) return { score: evaluate(board) };

      // Sample: place 2 (90%) and 4 (10%) in each empty cell, average
      let totalScore = 0;
      const sampleCount = Math.min(empties.length, 4); // cap samples for perf
      const shuffled = empties.sort(() => Math.random() - 0.5).slice(0, sampleCount);

      for (const pos of shuffled) {
        // Place a 2 (p=0.9)
        let b2 = cloneBoard(board);
        b2[pos.r][pos.c] = 2;
        const { score: s2 } = expectimax(b2, depth - 1, true);
        totalScore += 0.9 * s2;

        // Place a 4 (p=0.1)
        let b4 = cloneBoard(board);
        b4[pos.r][pos.c] = 4;
        const { score: s4 } = expectimax(b4, depth - 1, true);
        totalScore += 0.1 * s4;
      }
      return { score: totalScore / sampleCount };
    }
  }

  function getBestMove(board, depth) {
    const { direction, score } = expectimax(board, Math.max(1, Math.min(depth || 3, 5)), true);
    return { direction, score };
  }

  return { getBestMove, evaluate };
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/solvers/solver2048.js
git commit -m "feat: 2048 expectimax solver with configurable depth"
```

---

### Task 6: Memory solver — card tracking

**Files:**
- Modify: `content/solvers/solverMemory.js`

- [ ] **Step 1: Write solverMemory.js**

```js
'use strict';

// Memory pairs tracker.
// Records seen card symbols and suggests the next flip.
// Flip limit = 2×pairs, so perfect memory guarantees a win.

const SolverMemory = (() => {
  // knownCards: Map<index, symbol>
  // matchedIndices: Set<index>

  function createTracker() {
    return {
      knownCards: new Map(),   // index → symbol
      matchedIndices: new Set(),
      totalPairs: 0,
      peekLimit: 0,
    };
  }

  function update(tracker, index, symbol, isMatch) {
    tracker.knownCards.set(index, symbol);
    if (isMatch) {
      tracker.matchedIndices.add(index);
    }
  }

  // Suggest the next index to flip
  function suggestNext(tracker) {
    const known = tracker.knownCards;
    const matched = tracker.matchedIndices;

    // If we have a known unmatched card, look for its pair
    const unmatchedKnown = new Map(); // symbol → index
    for (const [idx, sym] of known) {
      if (matched.has(idx)) continue;
      if (unmatchedKnown.has(sym)) {
        // Found a known pair! Flip the other one
        return { index: idx, reason: 'match known', pairIndex: unmatchedKnown.get(sym) };
      }
      unmatchedKnown.set(sym, idx);
    }

    // If one card is currently face-up (known but unmatched is alone),
    // and we know another card with the same symbol, flip the pair
    const upCards = [];
    for (const [idx, sym] of known) {
      if (matched.has(idx)) continue;
      upCards.push({ idx, sym });
    }

    if (upCards.length === 1) {
      // Only one known card waiting — its partner is unknown
      // Flip any unknown card (prefer first row-wise)
      for (let i = 0; i < tracker.totalPairs * 2; i++) {
        if (!known.has(i) || matched.has(i)) continue;
        // Actually we should flip an unknown card
      }
      return null; // need to explore
    }

    // Just return first unknown index
    for (let i = 0; i < tracker.totalPairs * 2; i++) {
      if (matched.has(i)) continue;
      if (!known.has(i)) return { index: i, reason: 'explore' };
    }

    // All cards known — find a known pair
    const seen = new Map();
    for (const [idx, sym] of known) {
      if (matched.has(idx)) continue;
      if (seen.has(sym)) {
        return { index: idx, reason: 'known pair', pairIndex: seen.get(sym) };
      }
      seen.set(sym, idx);
    }

    return null; // no suggestion
  }

  return { createTracker, update, suggestNext };
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/solvers/solverMemory.js
git commit -m "feat: memory pairs card tracking solver"
```

---

### Task 7: Puzzle15 Solver — A* shortest path

**Files:**
- Modify: `content/solvers/solverPuzzle15.js`

- [ ] **Step 1: Write solverPuzzle15.js**

```js
'use strict';

// A* solver for 15-puzzle (sliding number puzzle).
// Board is a 1D array, 0 = empty space.
// Goal: 1, 2, 3, ..., N²-1, 0 (row-major order)

const SolverPuzzle15 = (() => {
  function boardToString(board) {
    return board.join(',');
  }

  function getGoal(size) {
    const goal = [];
    for (let i = 1; i < size * size; i++) goal.push(i);
    goal.push(0);
    return goal;
  }

  // Manhattan distance heuristic
  function heuristic(board, size) {
    let dist = 0;
    for (let i = 0; i < board.length; i++) {
      const v = board[i];
      if (v === 0) continue;
      const targetIdx = v - 1;
      const tr = Math.floor(targetIdx / size);
      const tc = targetIdx % size;
      const r = Math.floor(i / size);
      const c = i % size;
      dist += Math.abs(tr - r) + Math.abs(tc - c);
    }
    return dist;
  }

  // Linear conflict adds 2 for each pair in same row/col that cross
  function linearConflict(board, size) {
    let conflict = 0;
    for (let r = 0; r < size; r++) {
      for (let c1 = 0; c1 < size; c1++) {
        const idx1 = r * size + c1;
        const v1 = board[idx1];
        if (v1 === 0) continue;
        const t1r = Math.floor((v1 - 1) / size);
        const t1c = (v1 - 1) % size;
        if (t1r !== r) continue; // not in goal row
        for (let c2 = c1 + 1; c2 < size; c2++) {
          const idx2 = r * size + c2;
          const v2 = board[idx2];
          if (v2 === 0) continue;
          const t2r = Math.floor((v2 - 1) / size);
          const t2c = (v2 - 1) % size;
          if (t2r !== r) continue;
          if (t1c > t2c) conflict += 2;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      for (let r1 = 0; r1 < size; r1++) {
        const idx1 = r1 * size + c;
        const v1 = board[idx1];
        if (v1 === 0) continue;
        const t1r = Math.floor((v1 - 1) / size);
        const t1c = (v1 - 1) % size;
        if (t1c !== c) continue;
        for (let r2 = r1 + 1; r2 < size; r2++) {
          const idx2 = r2 * size + c;
          const v2 = board[idx2];
          if (v2 === 0) continue;
          const t2r = Math.floor((v2 - 1) / size);
          const t2c = (v2 - 1) % size;
          if (t2c !== c) continue;
          if (t1r > t2r) conflict += 2;
        }
      }
    }
    return conflict;
  }

  function getNeighbors(board, size) {
    const zeroIdx = board.indexOf(0);
    const r = Math.floor(zeroIdx / size);
    const c = zeroIdx % size;
    const neighbors = [];
    const dirs = [[-1, 0, 'up'], [1, 0, 'down'], [0, -1, 'left'], [0, 1, 'right']];

    for (const [dr, dc, name] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const newIdx = nr * size + nc;
      const newBoard = [...board];
      [newBoard[zeroIdx], newBoard[newIdx]] = [newBoard[newIdx], newBoard[zeroIdx]];
      neighbors.push({ board: newBoard, direction: name, tile: board[newIdx] });
    }
    return neighbors;
  }

  // A* search returning array of moves [{tile, direction}, ...]
  function solve(board, size) {
    const start = board.slice();
    const goal = getGoal(size);
    const startStr = boardToString(start);
    const goalStr = boardToString(goal);

    if (startStr === goalStr) return [];

    // Priority queue: [fScore, gScore, board, path]
    const openSet = new Map();
    const startH = heuristic(start, size) + linearConflict(start, size);
    openSet.set(startStr, { board: start, g: 0, f: startH, path: [] });

    // For larger puzzles, use a visited set with best g seen
    const bestG = new Map();
    bestG.set(startStr, 0);

    let iterations = 0;
    const MAX_ITER = 500000;

    while (openSet.size > 0 && iterations < MAX_ITER) {
      iterations++;
      // Pick entry with lowest f
      let minKey = null, minVal = Infinity;
      for (const [key, val] of openSet) {
        if (val.f < minVal) { minVal = val.f; minKey = key; }
      }

      const current = openSet.get(minKey);
      openSet.delete(minKey);

      if (minKey === goalStr) return current.path;

      const neighbors = getNeighbors(current.board, size);
      for (const nb of neighbors) {
        const nbStr = boardToString(nb.board);
        const newG = current.g + 1;
        const prevBest = bestG.get(nbStr);
        if (prevBest !== undefined && prevBest <= newG) continue;

        bestG.set(nbStr, newG);
        const h = heuristic(nb.board, size) + linearConflict(nb.board, size);
        openSet.set(nbStr, {
          board: nb.board,
          g: newG,
          f: newG + h,
          path: [...current.path, { tile: nb.tile, direction: nb.direction }],
        });
      }
    }

    return null; // no solution found within iteration limit
  }

  return { solve };
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/solvers/solverPuzzle15.js
git commit -m "feat: puzzle15 A* solver with Manhattan + linear conflict heuristic"
```

---

### Task 8: Sudoku Solver — Backtracking + AC-3

**Files:**
- Modify: `content/solvers/solverSudoku.js`

- [ ] **Step 1: Write solverSudoku.js**

```js
'use strict';

// Sudoku solver using AC-3 constraint propagation + backtracking with MRV.
// Input: givens (81-element 1D array, 0 = empty)

const SolverSudoku = (() => {
  function getPeers() {
    // Precompute peer indices for all 81 cells
    const peers = Array.from({ length: 81 }, () => new Set());
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9);
      const c = i % 9;
      // Row
      for (let j = 0; j < 9; j++) peers[i].add(r * 9 + j);
      // Col
      for (let j = 0; j < 9; j++) peers[i].add(j * 9 + c);
      // Box
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
          peers[i].add((br + dr) * 9 + (bc + dc));
      peers[i].delete(i);
    }
    return peers;
  }

  const PEERS = getPeers();

  function initDomains(givens) {
    const domains = [];
    for (let i = 0; i < 81; i++) {
      if (givens[i] !== 0) {
        domains[i] = new Set([givens[i]]);
      } else {
        domains[i] = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      }
    }
    return domains;
  }

  // AC-3: enforce arc consistency
  function ac3(domains) {
    const queue = [];
    for (let i = 0; i < 81; i++) {
      for (const j of PEERS[i]) {
        queue.push([i, j]);
      }
    }

    while (queue.length > 0) {
      const [xi, xj] = queue.pop();
      if (revise(domains, xi, xj)) {
        if (domains[xi].size === 0) return false;
        for (const xk of PEERS[xi]) {
          if (xk !== xj) queue.push([xk, xi]);
        }
      }
    }
    return true;
  }

  function revise(domains, xi, xj) {
    let revised = false;
    const toRemove = [];
    for (const v of domains[xi]) {
      // Check if v has support in xj's domain
      const hasSupport = [...domains[xj]].some((w) => w !== v);
      if (!hasSupport) {
        toRemove.push(v);
        revised = true;
      }
    }
    for (const v of toRemove) domains[xi].delete(v);
    return revised;
  }

  function isComplete(domains) {
    for (let i = 0; i < 81; i++) {
      if (domains[i].size !== 1) return false;
    }
    return true;
  }

  function cloneDomains(domains) {
    return domains.map((d) => new Set(d));
  }

  function selectMRV(domains) {
    let best = -1, bestSize = Infinity;
    for (let i = 0; i < 81; i++) {
      const sz = domains[i].size;
      if (sz > 1 && sz < bestSize) {
        bestSize = sz;
        best = i;
      }
    }
    return best;
  }

  function backtrack(domains) {
    if (isComplete(domains)) {
      return domains.map((d) => [...d][0]);
    }

    const idx = selectMRV(domains);
    if (idx === -1) return null;

    for (const val of domains[idx]) {
      const newDomains = cloneDomains(domains);
      newDomains[idx] = new Set([val]);
      if (!ac3(newDomains)) continue;
      const result = backtrack(newDomains);
      if (result) return result;
    }
    return null;
  }

  function solve(givens) {
    const domains = initDomains(givens);
    if (!ac3(domains)) return null;
    return backtrack(domains);
  }

  return { solve };
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/solvers/solverSudoku.js
git commit -m "feat: sudoku AC-3 + backtracking solver"
```

---

### Task 9: Popup — daily runner launcher and settings

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.css`
- Modify: `popup/popup.js`

- [ ] **Step 1: Write popup.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SubHDD Game Assistant</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="popup">
    <div class="popup-header">
      <span class="popup-title">🎮 Game Assistant</span>
    </div>
    <div class="popup-status" id="popup-status">
      检查中...
    </div>
    <div class="popup-counts" id="popup-counts">
    </div>
    <div class="popup-actions">
      <button class="popup-btn popup-btn-primary" id="btn-daily-run" disabled>
        🚀 一键全通
      </button>
      <p class="popup-hint">预计耗时 3-8 分钟，请保持页面打开</p>
    </div>
    <div class="popup-settings">
      <label class="popup-setting">
        <span>2048 搜索深度:</span>
        <input type="range" id="depth-slider" min="1" max="5" value="3" step="1">
        <span id="depth-val">3</span>
      </label>
    </div>
    <div class="popup-footer" id="popup-footer"></div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write popup.css**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  width: 280px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  background: #1e293b;
  color: #e2e8f0;
}

.popup { padding: 14px; }

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.popup-title { font-weight: 700; font-size: 14px; color: #38bdf8; }

.popup-status {
  padding: 6px 10px;
  border-radius: 6px;
  margin-bottom: 10px;
  font-size: 11px;
  background: #334155;
}

.popup-counts {
  margin-bottom: 10px;
  font-size: 11px;
  line-height: 1.8;
}
.popup-counts .count-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.popup-counts .count-check { color: #22c55e; }
.popup-counts .count-remaining { color: #fbbf24; }
.popup-counts .count-zero { color: #64748b; }

.popup-actions { margin-bottom: 12px; }

.popup-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.popup-btn-primary {
  background: #dc2626;
  color: #fff;
}
.popup-btn-primary:hover { background: #b91c1c; }
.popup-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.popup-hint {
  color: #64748b;
  font-size: 10px;
  text-align: center;
  margin-top: 4px;
}

.popup-settings {
  margin-bottom: 10px;
}
.popup-setting {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #94a3b8;
}
.popup-setting input { flex: 1; accent-color: #38bdf8; }

.popup-footer {
  font-size: 10px;
  color: #64748b;
  text-align: center;
  border-top: 1px solid #334155;
  padding-top: 8px;
}
```

- [ ] **Step 3: Write popup.js**

```js
'use strict';

const depthSlider = document.getElementById('depth-slider');
const depthVal = document.getElementById('depth-val');
const dailyBtn = document.getElementById('btn-daily-run');
const statusEl = document.getElementById('popup-status');
const countsEl = document.getElementById('popup-counts');
const footerEl = document.getElementById('popup-footer');

// Load saved depth
chrome.storage.local.get('depth2048', ({ depth2048 }) => {
  const d = depth2048 || 3;
  depthSlider.value = d;
  depthVal.textContent = d;
});

depthSlider.addEventListener('input', () => {
  depthVal.textContent = depthSlider.value;
  chrome.storage.local.set({ depth2048: Number(depthSlider.value) });
});

// Check if we're on sub.hdd.sb
async function checkTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('https://sub.hdd.sb/')) {
    statusEl.textContent = '⚠ 请打开 sub.hdd.sb 网站';
    return null;
  }
  statusEl.textContent = '✅ sub.hdd.sb 已检测';
  return tab;
}

// Send message to content script
async function sendToTab(tab, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, msg, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

// Request daily status from content script
async function refreshStatus() {
  const tab = await checkTab();
  if (!tab) return;

  const resp = await sendToTab(tab, { type: 'getDailyStatus' });
  if (resp && resp.error) {
    statusEl.textContent = '⚠ 请刷新游戏页面后重试';
    return;
  }
  if (resp) {
    renderCounts(resp);
    dailyBtn.disabled = false;
    footerEl.textContent = `余额: $${resp.balance || '—'}`;
  }
}

function renderCounts(status) {
  const games = [
    { key: 'checkin', emoji: '📅', name: '签到' },
    { key: 'puzzle2048', emoji: '🧩', name: '2048' },
    { key: 'memory', emoji: '🃏', name: '记忆翻牌' },
    { key: 'puzzle15', emoji: '🧮', name: '华容道' },
    { key: 'sudoku', emoji: '🔢', name: '数独' },
  ];

  countsEl.innerHTML = games.map((g) => {
    const rem = (status.remaining && status.remaining[g.key]) ?? '—';
    const icon = rem === 0 ? '✅' : rem > 0 ? '⏳' : '❓';
    return `<div class="count-row">${icon} ${g.emoji} ${g.name}: ${rem} 剩余</div>`;
  }).join('');
}

// Daily run
dailyBtn.addEventListener('click', async () => {
  dailyBtn.disabled = true;
  dailyBtn.textContent = '⏳ 执行中...';
  const tab = await checkTab();
  if (!tab) { dailyBtn.disabled = false; dailyBtn.textContent = '🚀 一键全通'; return; }

  const depth = Number(depthSlider.value) || 3;
  const resp = await sendToTab(tab, { type: 'startDailyRun', depth });
  if (resp && resp.error) {
    statusEl.textContent = '⚠ ' + resp.error;
  }
  dailyBtn.disabled = false;
  dailyBtn.textContent = '🚀 一键全通';
});

// Init
checkTab().then((tab) => {
  if (tab) refreshStatus();
});
```

- [ ] **Step 4: Commit**

```bash
git add popup/
git commit -m "feat: popup UI with daily runner launcher and depth settings"
```

---

### Task 10: Runner — daily full-clear coordinator

**Files:**
- Modify: `content/runner.js`
- Modify: `content/main.js` (wire up message listener)

- [ ] **Step 1: Write runner.js**

```js
'use strict';

// Daily runner: orchestrates checkin + 4 games sequentially.
// All operations within a single tab to maintain auth state.

const Runner = (() => {
  let running = false;
  let stopRequested = false;

  function delay() {
    // Random delay 200–800ms
    const ms = 200 + Math.random() * 600;
    return new Promise((r) => setTimeout(r, ms));
  }

  function log(entries, text, level) {
    entries.push({ text, level });
    // Notify UI if panel.js available
    if (typeof Panel !== 'undefined') {
      Panel.renderDailyRunner({
        percent: 0,
        log: entries.slice(-20),
      });
    }
  }

  async function run(depth) {
    if (running) return { error: 'already running' };
    running = true;
    stopRequested = false;
    const logEntries = [];
    const results = [];

    try {
      log(logEntries, '开始每日全通...', null);

      // Phase 1: Checkin
      log(logEntries, '📅 签到...', null);
      await doCheckin(logEntries);
      if (stopRequested) throw new Error('stopped');

      // Phase 2: Games (easiest difficulty first)
      const games = [
        { name: '🧩 2048', url: '/puzzle2048', type: 'puzzle2048', diffs: ['mini', 'classic', 'jumbo'] },
        { name: '🃏 记忆翻牌', url: '/memory', type: 'memory', diffs: ['easy', 'normal', 'hard', 'hell'] },
        { name: '🧮 华容道', url: '/puzzle15', type: 'puzzle15', diffs: ['easy', 'classic', 'hard'] },
        { name: '🔢 数独', url: '/sudoku', type: 'sudoku', diffs: ['easy', 'normal', 'hard', 'expert'] },
      ];

      for (const game of games) {
        log(logEntries, `${game.name} 开始...`, null);
        for (const diff of game.diffs) {
          if (stopRequested) throw new Error('stopped');
          log(logEntries, `  ${game.name} ${diff}...`, null);
          const result = await playGame(game, diff, depth, logEntries);
          results.push({ game: game.name, difficulty: diff, result });
          if (result === 'no-remaining') {
            log(logEntries, `  ${diff}: 无剩余次数，跳过`, 'error');
            break; // no more plays for this game today
          }
          if (result === 'won') {
            log(logEntries, `  ${diff}: ✅ 完成`, 'win');
          }
        }
      }

      log(logEntries, '🎉 全通完成！', 'win');

      // Show notification
      chrome.runtime.sendMessage({
        type: 'dailyDone',
        results: results,
      });

    } catch (e) {
      if (e.message === 'stopped') {
        log(logEntries, '⏸ 已停止', null);
      } else {
        log(logEntries, `错误: ${e.message}`, 'error');
      }
    } finally {
      running = false;
    }
    return { ok: true };
  }

  function stop() {
    stopRequested = true;
    running = false;
  }

  async function doCheckin(logEntries) {
    // Navigate to checkin page
    window.location.href = '/checkin';
    await delay();
    await waitForPageLoad();
    await delay();

    // Find and click the checkin button
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.includes('签到') || btn.textContent.includes('领取')) {
        btn.click();
        log(logEntries, '签到完成', 'win');
        await delay();
        return;
      }
    }
    log(logEntries, '签到按钮未找到 (可能已签到)', null);
  }

  async function playGame(game, difficulty, depth, logEntries) {
    // Navigate to game page
    window.location.href = game.url;
    await waitForPageLoad();
    await delay();
    await delay();

    // Wait for inject bridge to be ready
    await waitForBridge();
    await delay();
    await delay();

    // Check remaining plays from the page
    // The page's state.config and state.me tell us remaining counts
    const config = await getFromPage('state.config');
    if (!config || !config.difficulties || !config.difficulties[difficulty]) {
      return 'no-remaining';
    }

    // Start game
    await callPageFunction('startGame', difficulty);
    await delay();
    await delay();

    // Auto-play based on game type
    if (game.type === 'puzzle2048') {
      return await play2048(depth, logEntries);
    } else if (game.type === 'memory') {
      return await playMemory(logEntries);
    } else if (game.type === 'puzzle15') {
      return await playPuzzle15(logEntries);
    } else if (game.type === 'sudoku') {
      return await playSudoku(logEntries);
    }

    return 'unknown';
  }

  async function play2048(depth, logEntries) {
    let state = await getFromPage('state.activeSession');
    if (!state) return 'no-session';

    while (!state.won && !state.game_over && !stopRequested) {
      const board = state.board;
      const { direction } = Solver2048.getBestMove(board, depth);
      if (!direction) break;

      await callPageFunction('sendMove', direction);
      await delay();
      state = await getFromPage('state.activeSession');
    }

    return state.won ? 'won' : 'lost';
  }

  async function playMemory(logEntries) {
    const tracker = SolverMemory.createTracker();
    let state = await getFromPage('state.activeSession');
    if (!state) return 'no-session';
    tracker.totalPairs = state.pairs;
    tracker.peekLimit = state.peek_limit;

    // Initially, all cards are unknown. Flip cards in pairs.
    for (let i = 0; i < state.rows * state.cols && !stopRequested; i += 2) {
      // Flip card i
      await callPageFunction('flipCard', i);
      await delay();
      const r1 = await getPageFlipResult(i);
      if (r1) {
        SolverMemory.update(tracker, r1.index, r1.symbol, false);
      }

      // Try to find a match or flip next
      const suggestion = SolverMemory.suggestNext(tracker);
      const nextIdx = suggestion ? suggestion.index : (i + 1);

      await callPageFunction('flipCard', nextIdx);
      await delay();

      state = await getFromPage('state.activeSession');
      if (state && state.won) return 'won';
    }

    return 'lost';
  }

  async function playPuzzle15(logEntries) {
    let state = await getFromPage('state.activeSession');
    if (!state) return 'no-session';

    const solution = SolverPuzzle15.solve(state.board, state.size);
    if (!solution) return 'no-solution';

    for (const step of solution) {
      if (stopRequested) break;
      await callPageFunction('sendMove', { tile: step.tile });
      await delay();
    }

    state = await getFromPage('state.activeSession');
    return state && state.won ? 'won' : 'lost';
  }

  async function playSudoku(logEntries) {
    let state = await getFromPage('state.activeSession');
    if (!state) return 'no-session';

    const solution = SolverSudoku.solve(state.givens);
    if (!solution) return 'no-solution';

    // Fill each hole cell
    const givens = state.givens;
    for (let i = 0; i < 81; i++) {
      if (givens[i] !== 0) continue;
      if (stopRequested) break;
      const r = Math.floor(i / 9);
      const c = i % 9;
      await callPageFunction('fillCell', { row: r, col: c, value: solution[i] });
      await delay();
    }

    state = await getFromPage('state.activeSession');
    return state && state.won ? 'won' : 'completed';
  }

  // Helpers
  function waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') { setTimeout(resolve, 500); return; }
      window.addEventListener('load', () => setTimeout(resolve, 500), { once: true });
    });
  }

  function waitForBridge() {
    return new Promise((resolve) => {
      const handler = (ev) => {
        if (ev.data.source === 'ga-inject' && ev.data.type === 'ready') {
          window.removeEventListener('message', handler);
          resolve();
        }
      };
      window.addEventListener('message', handler);
      setTimeout(resolve, 3000); // timeout fallback
    });
  }

  function getFromPage(path) {
    return new Promise((resolve) => {
      const cmdId = 'runner-' + Date.now();
      const handler = (ev) => {
        if (ev.data.source === 'ga-inject' && ev.data.commandId === cmdId) {
          window.removeEventListener('message', handler);
          resolve(ev.data.data);
        }
      };
      window.addEventListener('message', handler);
      window.dispatchEvent(new CustomEvent('ga-command', {
        detail: { commandId: cmdId, type: 'getState' },
      }));
      setTimeout(() => resolve(null), 2000);
    });
  }

  function callPageFunction(fnName, ...args) {
    return new Promise((resolve) => {
      const cmdId = 'runner-' + Date.now();
      let type = 'move';
      if (fnName === 'flipCard') type = 'flip';
      else if (fnName === 'fillCell') type = 'fillCell';
      else if (fnName === 'startGame') type = 'startGame';

      const handler = (ev) => {
        if (ev.data.source === 'ga-inject' && ev.data.commandId === cmdId) {
          window.removeEventListener('message', handler);
          resolve(ev.data.data);
        }
      };
      window.addEventListener('message', handler);
      window.dispatchEvent(new CustomEvent('ga-command', {
        detail: { commandId: cmdId, type, payload: args },
      }));
      setTimeout(() => resolve(null), 5000);
    });
  }

  async function getPageFlipResult(index) {
    // The page's handleFlipResponse updates state after each flip.
    // We can read the symbol from the DOM card element.
    const cardEl = document.querySelector(`.mem-card[data-index="${index}"]`);
    if (!cardEl || !cardEl.classList.contains('is-face-up')) return null;
    const symbol = cardEl.dataset.symbol;
    return { index, symbol };
  }

  return { run, stop, isRunning: () => running };
})();
```

- [ ] **Step 2: Wire runner commands in main.js**

Add to message listener in `content/main.js`:
```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getDailyStatus') {
    getDailyStatus().then(sendResponse);
    return true; // async
  }
  if (msg.type === 'startDailyRun') {
    Runner.run(msg.depth || 3).then(sendResponse);
    return true;
  }
});

async function getDailyStatus() {
  // Get remaining plays from page state
  const state = await sendCommand('getState');
  // Also get config from page
  // Returns { remaining: { checkin, puzzle2048, memory, puzzle15, sudoku }, balance }
  return {
    remaining: {
      checkin: '?', // can't determine from game page
      puzzle2048: state?.session?.daily_remaining || '?',
      memory: '?',
      puzzle15: '?',
      sudoku: '?',
    },
    balance: '—',
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add content/runner.js content/main.js
git commit -m "feat: daily full-clear runner with sequential game automation"
```

---

### Task 11: Wire solvers into panel buttons (show hint / auto play)

**Files:**
- Modify: `content/main.js`

- [ ] **Step 1: Replace stub hint/auto functions in main.js**

```js
async function showHint() {
  if (!currentState || !currentState.hasActiveSession) return;

  switch (currentGameType) {
    case 'puzzle2048': {
      const board = currentState.session.board;
      const depthEl = document.getElementById('ga-depth');
      const depth = depthEl ? Number(depthEl.value) || 3 : 3;
      const { direction, score } = Solver2048.getBestMove(board, depth);
      const arrows = { up: '↑', down: '↓', left: '←', right: '→' };
      Panel.showHint(`${arrows[direction] || direction}  (eval: ${score.toFixed(0)})`);
      break;
    }
    case 'memory': {
      const sess = currentState.session;
      const tracker = SolverMemory.createTracker();
      tracker.totalPairs = sess.pairs;
      // Collect known cards from DOM
      const cards = document.querySelectorAll('.mem-card.is-face-up');
      for (const card of cards) {
        const idx = Number(card.dataset.index);
        const sym = card.dataset.symbol;
        if (sym) SolverMemory.update(tracker, idx, sym, false);
      }
      const matched = document.querySelectorAll('.mem-card.is-matched');
      for (const card of matched) {
        const idx = Number(card.dataset.index);
        tracker.matchedIndices.add(idx);
      }
      const suggestion = SolverMemory.suggestNext(tracker);
      if (suggestion) {
        Panel.showHint(`推荐翻第 ${suggestion.index + 1} 张 (${suggestion.reason})`);
      } else {
        Panel.showHint('翻任意未知卡片');
      }
      break;
    }
    case 'puzzle15': {
      const sess = currentState.session;
      const solution = SolverPuzzle15.solve(sess.board, sess.size);
      if (solution) {
        const stepsEl = document.getElementById('ga-steps');
        if (stepsEl) {
          stepsEl.innerHTML = solution.slice(0, 30).map((s, i) =>
            `<div class="ga-step">${i + 1}. 移动 ${s.tile}</div>`
          ).join('') + (solution.length > 30 ? `<div class="ga-step">... 共 ${solution.length} 步</div>` : '');
        }
      } else {
        Panel.showHint('求解中...');
      }
      break;
    }
    case 'sudoku': {
      const sess = currentState.session;
      const solution = SolverSudoku.solve(sess.givens);
      if (solution) {
        renderSudokuGrid(solution, sess.givens);
      }
      break;
    }
  }
}

function renderSudokuGrid(solution, givens) {
  const grid = document.getElementById('ga-sudoku-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.className = 'ga-sudoku-cell';
    if (givens[i] !== 0) cell.classList.add('is-given');
    else cell.classList.add('is-solved');
    cell.textContent = solution[i];
    grid.appendChild(cell);
  }
}

let autoPlayRunning = false;

async function startAutoPlay() {
  if (autoPlayRunning) return;
  autoPlayRunning = true;
  Panel.setStatus('自动完成中...', 'busy');

  try {
    switch (currentGameType) {
      case 'puzzle2048': {
        const depthEl = document.getElementById('ga-depth');
        const depth = depthEl ? Number(depthEl.value) || 3 : 3;
        while (!autoPlayStopped && currentState?.hasActiveSession) {
          await delay(300, 800);
          const board = currentState.session.board;
          const { direction } = Solver2048.getBestMove(board, depth);
          if (!direction) break;
          await sendCommand('move', { direction });
          await delay(300, 800);
          currentState = await sendCommand('getState');
          if (currentState.session?.won || currentState.session?.game_over) break;
        }
        break;
      }
      case 'puzzle15': {
        const sess = currentState.session;
        const solution = SolverPuzzle15.solve(sess.board, sess.size);
        if (solution) {
          for (const step of solution) {
            if (!autoPlayRunning) break;
            await sendCommand('move', { tile: step.tile });
            await delay(200, 500);
          }
        }
        break;
      }
      case 'sudoku': {
        const sess = currentState.session;
        const solution = SolverSudoku.solve(sess.givens);
        if (solution) {
          for (let i = 0; i < 81; i++) {
            if (!autoPlayRunning) break;
            if (sess.givens[i] !== 0) continue;
            const r = Math.floor(i / 9), c = i % 9;
            await sendCommand('fillCell', { row: r, col: c, value: solution[i] });
            await delay(150, 400);
          }
        }
        break;
      }
    }
    Panel.setStatus('完成', 'win');
  } catch (e) {
    Panel.setStatus('出错: ' + e.message, 'loss');
  } finally {
    autoPlayRunning = false;
  }
}

let autoPlayStopped = false;
function stopAutoPlay() {
  autoPlayStopped = true;
  autoPlayRunning = false;
  Runner.stop();
  Panel.setStatus('已停止', 'waiting');
}

function delay(minMs, maxMs) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 2: Commit**

```bash
git add content/main.js
git commit -m "feat: wire solvers into panel hint and auto-play buttons"
```

---

### Task 12: Integration test and polish

**Files:**
- Modify: `manifest.json` (finalize web_accessible_resources)
- Verify: all files load without errors

- [ ] **Step 1: Final manifest.json check**

Ensure all resources are listed:
```json
{
  "manifest_version": 3,
  "name": "SubHDD Game Assistant",
  "version": "0.1.0",
  "description": "Game assistant for sub.hdd.sb — 2048, memory, puzzle15, sudoku",
  "permissions": ["storage", "notifications"],
  "host_permissions": ["https://sub.hdd.sb/*"],
  "content_scripts": [
    {
      "matches": [
        "https://sub.hdd.sb/puzzle2048*",
        "https://sub.hdd.sb/memory*",
        "https://sub.hdd.sb/puzzle15*",
        "https://sub.hdd.sb/sudoku*"
      ],
      "js": ["content/main.js"],
      "css": ["content/ui/panel.css"]
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["content/inject.js"],
      "matches": ["https://sub.hdd.sb/*"]
    }
  ],
  "action": {
    "default_title": "SubHDD Game Assistant",
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon.svg",
      "48": "icons/icon.svg",
      "128": "icons/icon.svg"
    }
  },
  "icons": {
    "16": "icons/icon.svg",
    "48": "icons/icon.svg",
    "128": "icons/icon.svg"
  }
}
```

- [ ] **Step 2: Verify by loading extension in Chrome**

```bash
# Go to chrome://extensions → Developer mode → Load unpacked → select project directory
# Navigate to https://sub.hdd.sb/puzzle2048 → panel should appear on right side
```

- [ ] **Step 3: Fix any issues found, then commit**

```bash
git add -A
git commit -m "chore: final manifest and integration polish"
```

---

### Task 13: Push to GitHub and tag

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Tag**

```bash
git tag v0.1.0
git push origin v0.1.0
```
