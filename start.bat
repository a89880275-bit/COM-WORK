@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  set "IT_NODE=node"
) else (
  set "IT_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "%IT_NODE%" if not "%IT_NODE%"=="node" (
  echo Node.js 22 이상을 설치해 주세요.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4317"
"%IT_NODE%" server.mjs
pause
