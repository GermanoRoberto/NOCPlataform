@echo off
chcp 65001 >nul
title NOC Enterprise Command Center - Camilo dos Santos
color 0B
cls

cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-noc-enterprise.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] O processo foi encerrado.
    pause
)
