@echo off
REM Taç Savaşı — one-command start (Windows)
setlocal
cd /d %~dp0
where node >nul 2>nul || (echo [ERROR] Node.js 22+ required. Install from https://nodejs.org & pause & exit /b 1)
call npm install || (pause & exit /b 1)
if not exist client\public mkdir client\public
copy /y config.json client\public\config.json >nul
call npm run build || (pause & exit /b 1)
start "tac-bridge" cmd /k "npx tsx server/src/index.ts mock storm"
start "tac-client" cmd /k "npm run dev --workspace=client"
echo.
echo Open http://localhost:3002/?mock=1  (mock panel)
echo Bridge ws://localhost:8081
pause
