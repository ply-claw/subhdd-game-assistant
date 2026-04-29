# Chrome 游戏助手扩展 — 设计文档

## 概述

为 https://sub.hdd.sb/ 的游戏中心 (hub) 中的四个益智游戏提供辅助功能的 Chrome 扩展：
- **2048** (`/puzzle2048`)
- **记忆翻牌** (`/memory`)
- **华容道** (`/puzzle15`)
- **数独** (`/sudoku`)

功能包括：显示最优解（提示/答案）、单局自动完成、一键每日全通（签到+四个游戏全部难度）。

## 认证方式

用户先手动在浏览器登录 sub.hdd.sb，网站将 `auth_token` 存入 localStorage。扩展的 injected script 直接读取 `localStorage.getItem('auth_token')`，所有 API 调用通过页面自身的 `fetch()` 函数携带此 token。扩展自身不存储、不传输 token。

## 技术约束

1. **服务端权威**：所有游戏操作由后端验证，扩展不能伪造游戏结果
2. **不可预知性**：2048 的新方块位置由 seed 伪随机决定；翻牌的卡面服务端隐藏
3. **仅在页面上下文操作**：所有 API 调用通过页面自身的 fetch/api 函数发出，不通过扩展 background 直接调 API
4. **不消耗测试次数**：开发/测试时不实际开始游戏
5. **模拟人类操作**：自动完成加入 200-800ms 随机延迟

## 架构

```
┌─────────────────────────────────────────────┐
│  Game Page (sub.hdd.sb)                     │
│  ┌───────────────────────────────────────┐  │
│  │  Injected Script (主世界)              │  │
│  │  - 读写 window.state                   │  │
│  │  - 调用 sendMove/flipCell/fillCell    │  │
│  │  - 接收 CustomEvent 指令               │  │
│  │  - 通过 postMessage 回传结果           │  │
│  └──────────┬────────────────────────────┘  │
│             │ postMessage / CustomEvent      │
│  ┌──────────▼────────────────────────────┐  │
│  │  Content Script (isolated world)       │  │
│  │  - 注入 <script> 到主世界              │  │
│  │  - 创建 UI 侧边栏                      │  │
│  │  - 加载求解器                          │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  UI Sidebar Panel (DOM)               │  │
│  │  - 游戏状态/提示/按钮                  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Extension Popup (工具栏图标)               │
│  - 一键全通按钮                             │
│  - 剩余次数展示                             │
│  - 2048 深度设置                            │
└─────────────────────────────────────────────┘
```

## 目录结构

```
game-assistant/
├── manifest.json
├── content/
│   ├── main.js              # Content script 入口
│   ├── inject.js            # 注入主世界的桥接脚本
│   ├── ui/
│   │   ├── panel.css        # 侧边栏样式
│   │   └── panel.js         # UI 面板管理
│   ├── solvers/
│   │   ├── solver2048.js    # Expectimax 搜索（深度可配置）
│   │   ├── solverMemory.js  # 翻牌记忆追踪
│   │   ├── solverPuzzle15.js # A* 最短路径
│   │   └── solverSudoku.js  # Backtracking + 约束传播
│   └── runner.js            # 每日一键全通协调器
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 通信协议

Content Script 与 Injected Script 通过两种方式通信：

1. **CS → IS**：`window.dispatchEvent(new CustomEvent('ga-command', { detail }))`
   - `{ type: 'getState' }` — 请求游戏状态
   - `{ type: 'doMove', payload }` — 执行操作
   - `{ type: 'startGame', difficulty }` — 开始游戏
   - `{ type: 'abandonGame' }` — 放弃

2. **IS → CS**：`window.postMessage({ source: 'ga-inject', type, data }, '*')`
   - `{ type: 'state', data: {...} }` — 当前游戏状态
   - `{ type: 'moveResult', data: {...} }` — 操作结果
   - `{ type: 'error', message }` — 错误信息

## 求解器设计

### 2048 — Expectimax

- 深度可配置（默认 3，范围 1-5），在 popup 和侧边栏均可调
- 评估函数：角优先权重 + 单调性奖励 + 平滑度惩罚 + 空格奖励
- 策略倾向：保持大 tile 在角落，相邻 tile 递减
- "多思考少执行"：深度增加 1 的算力代价远小于一次网络往返（~300ms）

### 记忆翻牌 — 配对追踪

- 维护 `Map<index, symbol>` 记录已翻卡面
- 翻牌策略：
  1. 翻一张未知 → 如已知有匹配的卡 → 翻之 → 配对成功
  2. 无已知匹配 → 翻另一张未知 → 等待 mismatch
  3. 翻牌上限 = 2×对数，理论上完美记忆保证通关

### 华容道 — A* 最短路径

- 状态编码：空格位置 + 1D 数组（0 代表空格）
- 启发式：Manhattan Distance + Linear Conflict
- 3×3 BFS 即可，4×4 A* 秒解，5×5 加 IDA*

### 数独 — Backtracking + AC-3

- 从 givens 初始化候选值域
- AC-3 约束传播缩小域
- MRV 选下一格，backtracking 搜索
- 9×9 规模下纯回溯也足够快

## 一键全通流程

1. 用户点击扩展 popup 中的「一键全通」按钮
2. Popup 发送消息给当前 tab 的 content script
3. Content script 协调执行（runner.js）：
   a. 导航到 /checkin → 签到
   b. 依次导航到每个游戏页面 → 从低难度到高难度 → start → 自动玩 → 完成
   c. 显示通知汇总结果
4. 所有操作在同一个 tab 内顺序执行（页面导航），保持登录状态
5. 每个操作间加入 200-800ms 随机延迟

## manifest.json 关键配置

```json
{
  "manifest_version": 3,
  "permissions": ["storage"],
  "host_permissions": ["https://sub.hdd.sb/*"],
  "content_scripts": [{
    "matches": [
      "https://sub.hdd.sb/puzzle2048*",
      "https://sub.hdd.sb/memory*",
      "https://sub.hdd.sb/puzzle15*",
      "https://sub.hdd.sb/sudoku*",
      "https://sub.hdd.sb/checkin*"
    ],
    "js": ["content/main.js"],
    "css": ["content/ui/panel.css"]
  }],
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

## 开发策略

- 先实现 UI 框架（侧边栏 + popup）+ 注入机制，不实际调 API
- 用游戏页面已有 DOM 数据做假状态测试
- 求解器用测试数据独立验证
- 最后集成自动执行，仅在确认不消耗次数后测试实际 API
