# 六款新游戏辅助 — 设计文档

## 概述

新增 6 个游戏的求解器和自动完成功能：

| # | 游戏 | 路径 | API | 求解算法 |
|---|------|------|-----|---------|
| 1 | 扫雷 | /minesweeper | click(play_id, action, x, y) | 约束传播 + 概率推断 |
| 2 | 推箱子 | /sokoban | move(session_id, direction) | A*/IDA\* 搜索 |
| 3 | 点灯 | /lightsout | click(session_id, x, y) | GF(2) 线性方程组 |
| 4 | 迷宫 | /maze | move(session_id, direction) | BFS/Dijkstra 最短路径 |
| 5 | 数织 | /nonogram | click(session_id, row, col) | 逐行逐列约束推理 |
| 6 | 连线 | /flowfree | step(session_id, color, row, col) | 约束路径搜索 |

### 求解器设计

#### 1. 扫雷 (solverMinesweeper.js)
- 读取 DOM 单元格：`.ms-cell[data-r][data-c]`，已揭示的有 `is-n1`~`is-n8` 类对应数字
- 约束传播：已知数字周围未标记雷数 = 数字 - 周围已标记旗子数
- 策路：能确定是雷 → 标旗(flag)；能确定安全 → 点击(reveal)；否则用概率选最低风险格子
- 自动完成：循环 `click(action:'reveal',x,y)` 或 `click(action:'flag',x,y)`，每步等 DOM 更新

#### 2. 推箱子 (solverSokoban.js)
- DOM：`.sk-cell` 单元格，data-row/data-col，`is-wall/is-target/is-box/is-player` 类表示状态
- A*/IDA\* 搜索：状态 = 玩家位置 + 所有箱子位置，目标 = 所有箱子在目标格上
- 启发式：每个箱子到最近目标的 Manhattan 距离之和 + deadlock 检测
- 自动完成：键盘事件 `ArrowUp/Down/Left/Right`

#### 3. 点灯 (solverLightsOut.js)
- DOM：`.lo-cell[data-r][data-c]`，`is-on` 类表示亮灯
- GF(2) 线性方程组：N×N 格 → N² 个变量（是否点此格），N² 个方程（每格最终为暗）
- 高斯消元 O(N⁶) 对于 5×5 可秒解
- 自动完成：点击 `.lo-cell`

#### 4. 迷宫 (solverMaze.js)
- 服务端在 session 中返回 `open_edges`（哪些方向有通路）
- 或直接 BFS 在已知地图上搜最短路径
- 如果服务端不返回完整地图，用右手法则/Wall Follower
- 自动完成：键盘方向键事件

#### 5. 数织 (solverNonogram.js)
- DOM：`.ng-cell[data-r][data-c]`，`is-filled/is-cross` 类
- 行/列线索显示为 `.ng-clue` 文本
- 逐行逐列用约束推理：已知空格后，重新计算每行/列的可能性
- 难度高时回退到 DFS 搜索
- 自动完成：点击 `.ng-cell`

#### 6. 连线 (solverFlowfree.js)
- DOM：`.ff-cell[data-r][data-c]`，`data-color` 表示颜色（0=空）
- 每种颜色有两个端点，需用同色路径连接
- 解法：对每种颜色 BFS/Dijkstra 找路径，已占用格为障碍
- 多色顺序重要：优先连空间最受限的颜色
- 自动完成：先 `click` 端点选色，再 `click` 相邻空格扩展路径

## 通用规范（防旧 bug 复现）

- **等待服务端**：每步操作后等 `remaining-count`/`move-count` 变化或 `page-status` 变为 is-win/is-loss
- **随机延迟**：200-800ms 随机间隔
- **按钮定位**：不依赖 `data-diff`，用 difficulty 文本匹配或按钮顺序
- **Active session**：`page-status` 文本 + play panel 双重判断
- **难度遍历**：完成→检查 disabled→直到 0

## 一键全通变更

### Popup 游戏选择
- 每个游戏前加 checkbox，默认全勾选
- 未勾选的游戏自动跳过
- 配置存 `chrome.storage.local` key: `ga_enabled_games`

### 游戏顺序（新增 6 个插入到性价比合适位置）
1. 签到
2. 记忆翻牌
3. 数独
4. 华容道
5. 羊了个羊
6. 点灯
7. 迷宫
8. 扫雷
9. 推箱子
10. 连线
11. 数织
12. 2048

## 文件清单

| 文件 | 操作 |
|------|------|
| `content/solvers/solverMinesweeper.js` | 新增 |
| `content/solvers/solverSokoban.js` | 新增 |
| `content/solvers/solverLightsOut.js` | 新增 |
| `content/solvers/solverMaze.js` | 新增 |
| `content/solvers/solverNonogram.js` | 新增 |
| `content/solvers/solverFlowFree.js` | 新增 |
| `manifest.json` | 修改（matches + js 列表） |
| `content/main.js` | 修改（6 个 game case） |
| `content/ui/panel.js` | 修改（6 个 render 方法） |
| `content/runner.js` | 修改（游戏列表） |
| `background.js` | 修改（游戏列表） |
| `popup/popup.html` | 修改（checkbox 列表） |
| `popup/popup.js` | 修改（开关逻辑） |
