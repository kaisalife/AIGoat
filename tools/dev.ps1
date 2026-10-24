# AIGoat 一键开发：自动起 vite(:5180) 再 cargo run，退出时回收 vite。
# 用法：仓库根目录执行  powershell -ExecutionPolicy Bypass -File tools\dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Test-Port5180 {
  (Test-NetConnection -ComputerName 127.0.0.1 -Port 5180 -InformationLevel Quiet -WarningAction SilentlyContinue)
}

$viteProc = $null
if (Test-Port5180) {
  Write-Host "[dev] :5180 已有 vite 在跑，直接复用" -ForegroundColor DarkGray
} else {
  Write-Host "[dev] 启动 vite dev (:5180) ..." -ForegroundColor Cyan
  $viteProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" `
    -WorkingDirectory (Join-Path $root "web") -PassThru -WindowStyle Minimized
  $ready = $false
  foreach ($i in 1..60) {
    if (Test-Port5180) { $ready = $true; break }
    if ($viteProc.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    if ($viteProc) { taskkill /PID $viteProc.Id /T /F | Out-Null }
    throw "[dev] vite 30 秒内未就绪（检查 web/ 依赖是否已 npm install）"
  }
}

try {
  Push-Location (Join-Path $root "src-tauri")
  Write-Host "[dev] cargo run （关闭窗口即退出）..." -ForegroundColor Cyan
  cargo run
} finally {
  Pop-Location
  if ($viteProc -and -not $viteProc.HasExited) {
    Write-Host "[dev] 回收 vite (PID $($viteProc.Id))" -ForegroundColor DarkGray
    taskkill /PID $viteProc.Id /T /F | Out-Null
  }
}
