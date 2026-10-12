@echo off
chcp 65001 >nul
title SST Hub
cd /d "%~dp0"
where node >nul 2>nul || (start "" "%~dp0public\index.html" & exit /b 0)
node scripts\servidor.mjs --abrir
