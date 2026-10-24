<div align="center">

# AIGoat

**AI 编程助手桌面应用 · Windows**

[简体中文](#-简体中文) | [English](#-english)

Tauri 2 · React · 内置 codex 引擎 · 自定义任意模型提供商

</div>

---

## 🇨🇳 简体中文

AIGoat 是一个开箱即用的 AI 编程助手桌面应用。它在单个安装包内捆绑了完整的 codex 引擎（`codex-rs`，魔改分支），安装即用——目标机器不需要预装 codex、Node 或 Rust 工具链。

### 特性

- **一键安装，开箱即用** — NSIS 安装包内置 codex 引擎与嵌入式前端，双击安装后即可运行；全部数据归拢在安装目录的 `cache\` 下，卸载干净（用户会话数据保留）。
- **模型完全自定义** — 任意 Responses API 兼容端点均可接入（讯飞星火、火山方舟、阿里云、OpenCode 等）。codex 内置模型目录一概不用、也不显示；API Key 推荐走环境变量（不落盘），也支持直接填写。
- **IDE 式三栏界面** — React + zustand 构建的会话流 / 资源面板 / 详情页，支持技能、钩子、MCP 服务器状态、文件预览、终端与轨迹时间线。
- **工作区隔离** — 会话按工作目录隔离，切换工作区时侧栏、技能、钩子与权限配置跟着切换；没有工作区时给出明确引导而非空白。
- **完整的会话管理** — 恢复上次会话、置顶与手工排序、批量删除（运行中的会话自动打断后重试）、归档 / 压缩 / 重命名。删除是硬删，不留磁盘残留。
- **权限与沙箱** — 多档审批策略（只读 / 工作区可写 / 完全访问），命令执行前逐条审批，Windows 沙箱就绪检测。
- **子 Agent 接入（AF 规范）** — 登记外部子 Agent（`--agent task.json --out report.json` 协议），主 Agent 自动获得派单说明，按能力清单派单。
- **协议前瞻兼容** — codex 通知映射为统一事件流，未建模的通知类型透传不阻断；协议基线按 codex-cli 0.156.1 校对。

### 安装

从 [Releases](https://github.com/kaisalife/AIGoat/releases) 下载 `AIGoat_1.0.0_x64-setup.exe`，双击安装（未签名，SmartScreen 提示时选择「仍要运行」）。建议安装到非系统盘（如 `D:\AIGoat`）。

安装后的目录结构：

```
<安装目录>\
├── aigoat.exe          # 主程序（前端已嵌入）
├── bin\codex.exe       # 捆绑的 codex 引擎
└── cache\              # 全部运行数据（首次启动创建）
    ├── shell\          #   设置 / 工作区 / UI 状态
    ├── codex\          #   codex 引擎数据（会话 rollout 等）
    ├── agent-registry\ #   子 Agent 注册表
    └── tmp\
```

首次启动后：打开「模型设置」→ 填入提供商 Base URL 与 API Key（或环境变量名）→ 添加模型 → 打开一个工作区即可开始对话。

### 从源码构建

环境要求：Windows 10/11、Node.js 20+、Rust stable。

```powershell
# 前端 + 壳构建（产物 src-tauri\target\release\aigoat.exe，前端已嵌入）
powershell -ExecutionPolicy Bypass -File tools\build.ps1

# 一键打包 NSIS 安装包（收集 codex.exe → 构建 → NSIS → 产物自检）
powershell -ExecutionPolicy Bypass -File tools\package.ps1

# 开发模式（热更新）
powershell -ExecutionPolicy Bypass -File tools\dev.ps1
```

codex 引擎源码在 [`codex-rs/`](codex-rs/)（fork 自 openai/codex，含本项目的协议与行为魔改），打包脚本直接收集现成的 release 产物、不触发编译。

### 项目结构

```
AIGoat/
├── src-tauri/        # Tauri 外壳（Rust）：codex app-server 客户端、
│                     #   bridge_* 命令层、设置、工作区、缓存归拢
├── web/              # 前端（React + zustand）：三栏 IDE 布局
├── codex-rs/         # codex 引擎源码（魔改分支，Apache-2.0）
├── config/           # 配置模板（local.json 不入库）
├── docs/             # 设计文档与打包部署方案
├── proto/            # codex 协议方法基线
└── tools/            # dev / build / package 脚本与协议检查
```

### CI

推送与 PR 会运行 [CI](.github/workflows/ci.yml)：前端构建 + 单测、`cargo clippy -D warnings`、`cargo fmt --check`、跨桥字段契约检查。协议漂移与线格式 parity 两关依赖本机 codex 二进制，属发布前本地步骤（`tools/verify.ps1`）。

### 许可证

本项目基于 [Apache-2.0](src-tauri/Cargo.toml) 协议开源；内嵌的 codex 引擎源码遵循其原仓库的 Apache-2.0 协议。

---

## 🇬🇧 English

AIGoat is a batteries-included AI coding assistant desktop app for Windows. It ships a full codex engine (a modified fork of `codex-rs`) inside a single installer — the target machine needs no codex, Node.js, or Rust toolchain preinstalled.

### Features

- **One-click install** — The NSIS installer bundles the codex engine and an embedded frontend. All data lives under `cache\` inside the install directory; uninstall is clean (user session data is kept).
- **Fully custom models** — Any Responses-API-compatible endpoint works (iFlytek Spark, Volcano Ark, Aliyun, OpenCode, etc.). codex's built-in model catalog is never used or shown; API keys can come from environment variables (recommended, nothing on disk) or be entered directly.
- **IDE-style three-pane UI** — React + zustand chat stream, resource panel, and inspector: skills, hooks, MCP server status, file preview, terminal, and trajectory timeline.
- **Workspace isolation** — Threads are filtered by working directory; skills, hooks, and permission profiles switch along with the workspace. A clear onboarding entry replaces the blank state.
- **Full thread management** — Resume the last thread, pinning and manual ordering, batch delete (auto-interrupt running turns and retry), archive / compact / rename. Deletion is a hard delete with no disk leftovers.
- **Permissions & sandbox** — Graduated approval policies (read-only / workspace-write / full access), per-command approval, Windows sandbox readiness check.
- **Sub-agents (AF spec)** — Register external sub-agents speaking the `--agent task.json --out report.json` protocol; the main agent receives dispatch instructions and routes tasks by capability cards.
- **Forward-compatible protocol** — codex notifications map into a unified event stream; unmodeled notification types pass through without breaking it. Protocol baseline verified against codex-cli 0.156.1.

### Install

Download `AIGoat_1.0.0_x64-setup.exe` from [Releases](https://github.com/kaisalife/AIGoat/releases) and run it (unsigned — choose "Run anyway" on SmartScreen). Installing to a non-system drive (e.g. `D:\AIGoat`) is recommended. Then: open Model Settings → enter a provider base URL and API key (or env var name) → add a model → open a workspace and start chatting.

### Build from source

Requirements: Windows 10/11, Node.js 20+, Rust stable.

```powershell
# Build frontend + shell (frontend embedded into aigoat.exe)
powershell -ExecutionPolicy Bypass -File tools\build.ps1

# One-shot NSIS installer (collect codex.exe → build → NSIS → self-check)
powershell -ExecutionPolicy Bypass -File tools\package.ps1

# Dev mode with hot reload
powershell -ExecutionPolicy Bypass -File tools\dev.ps1
```

The engine source lives in [`codex-rs/`](codex-rs/) (forked from openai/codex with this project's protocol and behavior patches); the packaging script collects the existing release binary instead of rebuilding it.

### License

This project is licensed under [Apache-2.0](src-tauri/Cargo.toml); the bundled codex engine follows the Apache-2.0 license of its upstream repository.
