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
  <strong>本地优先的 JS/TS 代码库分析器 —— 找到最该先重构的地方。</strong><br />
  确定性结构分析 + 交互式仪表板 + 依赖关系图可视化。
</p>

---

## 为什么选择 Refactor Radar？

团队知道技术债的存在，但无法快速证明**该从哪里开始**。Refactor Radar 扫描本地 JS/TS 项目，生成一份按优先级排序的重构机会清单 —— 每一项都有指标和证据支撑。

无需云服务，无需 API 密钥，代码不会离开你的机器。

## 功能特性

| 功能 | 描述 |
|------|------|
| **大模块检测** | 标记行数、函数数或导出数过多的文件 |
| **依赖热点** | 识别 fan-in 或 fan-out 过高的文件 |
| **循环依赖** | 通过 DFS 检测本地模块间的导入循环 |
| **重复候选** | 启发式检测高度相似的函数体 |
| **优先级评分** | 每个问题都有评分，让你始终知道该先修什么 |
| **交互式图表** | 问题分布、严重度分布、文件指标、优先级排行 |
| **依赖关系图** | 力导向 SVG 图形，支持拖拽、缩放、平移和循环高亮 |
| **国际化** | 中文 / 英文切换，偏好设置持久化保存 |

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
仪表板在 `http://localhost:5173`（或下一个可用端口）打开。

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

分析结果以 JSON 格式持久化存储于 `.refactor-radar/analyses/` 目录。

## 技术栈

| 层级 | 技术 |
|------|------|
| 分析引擎 | Rust — 基于正则的解析、BTreeMap 依赖图、DFS 循环检测 |
| HTTP 服务 | Axum 0.7 + Tokio 异步运行时 + tower-http CORS |
| 前端 | React 18 + TypeScript + Vite |
| 图表 | Recharts（饼图、柱状图、水平柱状图） |
| 图形 | D3-force（力导向布局）+ 原生 SVG 渲染 |
| 字体 | Outfit + IBM Plex Mono (Google Fonts) |

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
