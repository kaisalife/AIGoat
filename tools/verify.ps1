#!/usr/bin/env pwsh
# AIGoat 全套校验。任何一项失败都返回非零退出码，可直接挂 CI。
#
#   pwsh tools/verify.ps1
#   pwsh tools/verify.ps1 -Codex "D:\Codex\Codex-cli-rs\bin\codex.exe"
#
# 七道关：
#   1. 编译（含测试与示例）
#   2. clippy -D warnings
#   3. rustfmt
#   4. 前端 typecheck
#   5. 前端单测（纯函数 + reducer + slices，见各 *.test.ts）
#   6. 协议漂移（generate-ts 重新生成后与基线比对）
#   7. 线格式字段级 parity（Rust 结构体 vs TS 声明）——哨兵，见脚本内说明
#   8. 桥接接线（接口方法是否真有调用点）
#   9. 跨桥字段契约（Rust 映射层读的字段前端类型认不认得）
#  10. 反向字段契约（Rust 映射层发出的键前端类型认不认得）
#
# 运行时探针默认跳过：它要真的拉起 codex 子进程，属于集成验证而不是
# 静态校验，挂 CI 会让每次提交都依赖本机装了 codex。要跑就显式加
# -RunProbe。

param(
    [string]$Codex = "",
    # 协议基线产物的落盘目录：默认放系统临时目录（别写死某台机器的用户路径）。
    [string]$Proto = (Join-Path $env:TEMP "aigoat-proto"),
    [switch]$RunProbe
)

$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action, [switch]$AllowSentinel)
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    & $Action
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        # 退出码 3 = 「哨兵关卡无事可做」，不是失败。它必须和真正的通过
        # 区别显示，否则一个只防误报的关卡会让人以为线格式已核对过。
        if ($AllowSentinel -and $code -eq 3) {
            Write-Host "⚠ $Name 哨兵未核对任何项（见上方说明）" -ForegroundColor Yellow
            return
        }
        Write-Host "✖ $Name 失败（退出码 $code）" -ForegroundColor Red
        exit 1
    }
    Write-Host "✔ $Name" -ForegroundColor Green
}

if (-not $Codex) {
    foreach ($c in @("$env:USERPROFILE\..\Codex\Codex-cli-rs\bin\codex.exe",
                     "D:\Codex\Codex-cli-rs\bin\codex.exe")) {
        if (Test-Path -LiteralPath $c) { $Codex = (Resolve-Path -LiteralPath $c).Path; break }
    }
}
if (-not $Codex) { $Codex = "codex" }
Write-Host "codex : $Codex"

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
if (-not $py) {
    foreach ($c in @("$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
                     "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe")) {
        if (Test-Path -LiteralPath $c) { $py = $c; break }
    }
}
if (-not $py) { Write-Host "✖ 找不到 python" -ForegroundColor Red; exit 1 }

# Rust crate 在 src-tauri/ 下，不在仓库根——cargo 的 manifest-dir 就在那。
$tauri = Join-Path (Get-Location) "src-tauri"

Invoke-Step "编译" { Push-Location $tauri; cargo build --all-targets; Pop-Location }
Invoke-Step "clippy" { Push-Location $tauri; cargo clippy --all-targets -- -D warnings; Pop-Location }
Invoke-Step "rustfmt" { Push-Location $tauri; cargo fmt --all --check; Pop-Location }
Invoke-Step "前端 typecheck" { npm --prefix web run typecheck }
Invoke-Step "前端单测" { npm --prefix web run test }
Invoke-Step "协议漂移" {
    & $Codex app-server generate-ts --out $Proto | Out-Null
    & $py tools/gen_protocol_manifest.py --codex $Codex --check
}
# parity 的 Rust 侧源码根是 src-tauri/src（旧的 crates/codex-bridge 布局已不存在）
Invoke-Step "线格式 parity" -AllowSentinel {
    & $py tools/check_wire_parity.py --proto $Proto --src src-tauri/src
}

# 桥接接线：接口声明了、Tauri 也实现了，但前端从不调用的方法。
# steer 与 thread/unarchive 都是这样丢的，而编译期完全看不出来。
Invoke-Step "桥接接线" {
    & $py tools/check_bridge_wiring.py
}

# 跨桥字段：事件是 JSON，字段对不上编译期抓不到（steer 那类缺陷的同源问题）。
Invoke-Step "跨桥字段契约" {
    & $py tools/check_field_contract.py
}

# 反方向：映射层**发出**的键也要前端认识——imageGeneration 的 failure 就是
# 这么丢的（reducer 读、类型声明，映射层从不发），实时流与重连基线不一致。
Invoke-Step "反向字段契约" {
    & $py tools/check_emit_fields.py
}

if ($RunProbe) {
    Invoke-Step "运行时探针（只读）" {
        & (Join-Path $tauri "target\debug\examples\probe.exe") --codex $Codex --cwd (Get-Location).Path
    }
}

Write-Host "`n全部通过。" -ForegroundColor Green