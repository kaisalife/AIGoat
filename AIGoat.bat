@echo off
rem AIGoat 独立启动（release 版，前端已嵌入，无需 vite / 开发服务器）
start "" "%~dp0src-tauri\target\release\aigoat.exe"
