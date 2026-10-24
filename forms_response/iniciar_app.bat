@echo off
cd /d "%~dp0"
start "" http://localhost:2001/
python servidor.py
