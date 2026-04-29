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
    const body = this.el('ga-panel-body');
    const existing = this.el('ga-status-row');
    const newRow = `<div class="ga-status-row" id="ga-status-row"><span class="ga-status-dot is-${kind}"></span> ${text}</div>`;
    if (existing) {
      existing.outerHTML = newRow;
    } else if (body) {
      body.insertAdjacentHTML('afterbegin', newRow);
    }
  },

  showHint(text) {
    const existing = this.el('ga-hint');
    if (existing) {
      existing.textContent = text;
    } else {
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
        进行中 · ${sess.difficulty || '?'}
      </div>
      <div id="ga-hint" class="ga-hint">—</div>
      <div class="ga-depth-row">
        <span>搜索深度:</span>
        <input type="range" id="ga-depth" min="1" max="5" value="3" step="1">
        <span id="ga-depth-val">3</span>
      </div>
      <div style="font-size:12px;color:#94a3b8;line-height:1.6">
        分数: ${sess.score ?? 0} · 步数: ${sess.move_count ?? 0} · 最大: ${sess.max_tile ?? 2}
      </div>
    `);
    const depthEl = this.el('ga-depth');
    if (depthEl) {
      // Restore saved depth
      chrome.storage.local.get('depth2048', ({ depth2048 }) => {
        if (depth2048) { depthEl.value = depth2048; this.el('ga-depth-val').textContent = depth2048; }
      });
      depthEl.addEventListener('input', () => {
        const val = depthEl.value;
        const valEl = this.el('ga-depth-val');
        if (valEl) valEl.textContent = val;
        chrome.storage.local.set({ depth2048: Number(val) });
      });
    }
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
        进行中 · ${sess.difficulty || '?'}
      </div>
      <div id="ga-hint" class="ga-hint">收集翻牌信息中...</div>
      <div style="font-size:12px;color:#94a3b8;line-height:1.6">
        已配对: 0 / ${sess.pairs ?? '?'}
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
        进行中 · ${sess.difficulty || '?'} · ${sess.size}×${sess.size}
      </div>
      <div class="ga-steps" id="ga-steps">点击「显示解法」查看步骤</div>
      <div style="font-size:12px;color:#94a3b8;line-height:1.6">
        步数: ${sess.move_count ?? 0}
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
        进行中 · ${sess.difficulty || '?'}
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

  // --- Loading ---
  renderLoading(gameType) {
    const names = { puzzle2048: '2048', memory: '记忆翻牌', puzzle15: '华容道', sudoku: '数独' };
    this.setBody(`
      <div class="ga-status-row" id="ga-status-row">
        <span class="ga-status-dot is-waiting"></span>
        ${names[gameType] || gameType} — 未开始
      </div>
      <p style="color:#94a3b8;font-size:12px;padding:4px 0">选择难度开始游戏后，这里会显示辅助面板</p>
    `);
  },

  // --- Daily runner ---
  renderDailyRunner(progress) {
    this.setBody(`
      <div style="font-weight:700;margin-bottom:8px;color:#fbbf24">🚀 每日一键全通</div>
      <div class="ga-progress">
        <div class="ga-progress-fill" style="width:${progress.percent || 0}%"></div>
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
