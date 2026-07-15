<p align="center">
  <img src="https://img.shields.io/badge/Rust-2021-orange?logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <strong>简体中文</strong>
</p>

<h1 align="center">Refactor Radar</h1>

<p align="center">
  <strong>面向 JavaScript 和 TypeScript 的本地优先重构雷达。</strong><br />
  把结构信号转化为有证据、有排序、可执行的重构计划。
</p>

---

## 为什么选择 Refactor Radar？

Lint 工具会告诉你违反了哪些规则，Refactor Radar 回答更难的规划问题：**应该先重构什么？**

它扫描本地 JS/TS 代码库，绘制依赖结构，识别高影响力的重构机会，并用具体证据为每项发现排序。无需云服务，无需 API 密钥，源代码不会离开你的机器。

- **证据优先：** 每条建议都包含文件、指标、置信度和可执行操作。
- **优先级优先：** 对发现进行评分，让团队从收益最高的改动开始。
- **隐私且可复现：** 分析完全在本地运行，并保留可重新打开的历史记录。

## 功能特性

| 功能 | 描述 |
|------|------|
| **大模块检测** | 标记行数、函数数或导出数过多的文件 |
| **依赖热点** | 识别 fan-in 或 fan-out 过高的文件 |
| **循环依赖** | 使用 Tarjan 算法检测循环强连通分量 |
| **重复候选** | 启发式检测高度相似的函数体 |
| **优先级评分** | 每个问题都有评分，让你始终知道该先修什么 |
| **交互式图表** | 问题分布、严重度分布、文件指标、优先级排行 |
| **依赖关系图** | 力导向 SVG 图形，支持拖拽、缩放、平移和循环高亮 |
| **持久化历史** | 无需重新扫描即可打开最近的分析结果 |
| **可移植报告** | 将分析结果导出为 JSON、CSV 或 Markdown |
| **国际化** | 中文 / 英文切换，偏好设置持久化保存 |

## 效果截图

<p align="center">
  <img src="./docs/screenshot-results.png" alt="分析结果与图表" width="100%" />
  <em>完整工作流：本地代码库输入、结构概览、排序后的发现、证据与建议操作。</em>
</p>

<p align="center">
  <img src="./docs/screenshot-files.png" alt="文件指标柱状图" width="49%" />
  <img src="./docs/screenshot-priority.png" alt="优先级排行图" width="49%" />
  <em>左：按行数 / 函数数 / fan-in / fan-out 排列的文件排行。右：前 10 个最高优先级问题排行。</em>
</p>

## 项目架构

```
refactor-radar/
├── crates/
│   ├── analyzer/     # 核心分析引擎 (Rust)
│   │   ├── src/
│   │   │   └── lib.rs        # 文件发现、解析、依赖图、规则、评分
│   │   └── tests/
│   │       ├── analysis_fixture.rs
│   │       └── fixtures/sample_repo/
│   └── server/       # Axum HTTP API (Rust)
│       └── src/
│           └── main.rs       # 任务编排、结果持久化
├── web/              # React + Vite 仪表板 (TypeScript)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── lib/
│   │   │   ├── api.ts        # Rust API 的 HTTP 客户端
│   │   │   ├── types.ts      # 共享类型定义
│   │   │   └── i18n.ts       # 翻译字典 + Context
│   │   └── components/
│   │       ├── charts/       # 基于 Recharts 的可视化图表
│   │       ├── graph/        # D3-force 依赖关系图
│   │       └── layout/       # 可视化标签页组件
│   └── package.json
├── Cargo.toml        # 工作区根配置
└── README.md
```

## 快速开始

### 前置条件

- **Rust 工具链**（稳定版，通过 [rustup](https://rustup.rs/) 安装）
- **Node.js** 20+ 和 **npm** 10+

### 运行

打开两个终端：

**终端 1 — Rust API 服务：**
```bash
cargo run -p server
```
服务启动后监听 `http://127.0.0.1:8787`。

**终端 2 — Web 仪表板：**
```bash
cd web
npm install
npm run dev
```
仪表板在 `http://127.0.0.1:4173` 打开。

### 使用方法

1. 在输入框中粘贴本地 JS/TS 项目路径
2. 点击 **开始分析**
3. 浏览仪表板：
   - **概览** — 问题类型分布 + 严重度分布
   - **文件** — 按行数 / 函数数 / fan-in / fan-out 排列的文件排行
   - **优先级** — 最高优先级问题的水平柱状图
   - **依赖图** — 交互式力导向图，循环依赖红色高亮
4. 点击列表中的任意问题，查看证据和建议的重构方向

## API 参考

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/analyze` | POST | 启动分析。请求体：`{ "repoPath": "..." }` |
| `/api/analyze/:id/status` | GET | 轮询分析进度（阶段、完成状态、错误） |
| `/api/analyze/:id/results` | GET | 获取完整分析结果（文件 + 问题列表） |
| `/api/analyze/:id/issues/:issue_id` | GET | 获取单个问题的详细信息和证据 |
| `/api/analyses` | GET | 列出最近持久化保存的分析 |
| `/api/analyses/:id` | GET | 按 ID 加载已保存的分析 |

分析结果以 JSON 格式持久化存储于 `.refactor-radar/analyses/` 目录。

## 技术栈

| 层级 | 技术 |
|------|------|
| 分析引擎 | Rust - 基于正则的解析、BTreeMap 依赖图、Tarjan SCC 循环检测 |
| HTTP 服务 | Axum 0.7 + Tokio 异步运行时 + tower-http CORS |
| 前端 | React 18 + TypeScript + Vite |
| 图表 | Recharts（饼图、柱状图、水平柱状图） |
| 图形 | D3-force（力导向布局）+ 原生 SVG 渲染 |
| 字体 | Geist Sans + Geist Mono（通过 Fontsource 自托管） |

## 测试

```bash
# Rust 分析器测试
cargo test -p analyzer

# Web UI 测试 (Vitest)
cd web && npm run test

# 类型检查 + 生产构建
cd web && npm run build
```

## 路线图

- [ ] 支持更多编程语言（Python、Go、Java）
- [ ] 基于 AST 的语义级重复检测（tree-sitter）
- [ ] 编辑器集成（VS Code 扩展）
- [ ] PR 和 diff 分析模式
- [ ] 可选的 AI 解释层，用于复杂发现
- [ ] 针对特定模式的自动修复建议

## 贡献

请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解开发流程和规范。

## 许可证

[MIT](./LICENSE)
