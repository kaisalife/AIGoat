# AIGoat 发布构建：前端 dist → 嵌入资源的 release exe。
# 必须带 --features custom-protocol，否则嵌入不了前端（见 Cargo.toml 注释）。
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "[build] npm run build (web/dist) ..." -ForegroundColor Cyan
npm --prefix (Join-Path $root "web") run build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }

Write-Host "[build] cargo build --release --features custom-protocol ..." -ForegroundColor Cyan
Push-Location (Join-Path $root "src-tauri")
cargo build --release --features custom-protocol
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw "Rust 构建失败" }

Write-Host "[build] 完成: src-tauri\target\release\aigoat.exe （可独立运行，无需 vite）" -ForegroundColor Green
