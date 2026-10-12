@echo off
chcp 65001 >nul
title Portal SST - actualizando
cd /d "%~dp0"
where node >nul 2>nul || (echo Necesitas Node.js: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install --no-fund --no-audit
)
call npm run recolectar
if errorlevel 1 (pause & exit /b 1)
start "SST Hub" node scripts\servidor.mjs --abrir
timeout /t 8
