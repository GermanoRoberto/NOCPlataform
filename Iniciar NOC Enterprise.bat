@echo off
chcp 65001 >nul
title NOC Enterprise Command Center - Camilo dos Santos
color 0B
cls

pushd "%~dp0"

echo ======================================================================
echo    NOC ENTERPRISE - INICIANDO PROCESSO
echo    Diretorio Atual: %CD%
echo ======================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-noc-enterprise.ps1"
echo.
echo [AVISO] O processo do NOC foi finalizado.
echo.
pause
popd
