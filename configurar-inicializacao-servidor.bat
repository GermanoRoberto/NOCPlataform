@echo off
chcp 65001 >nul
title Configurar Inicializacao Automatica - Servidor NOC
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configurar-inicializacao-servidor.ps1"
echo.
pause
