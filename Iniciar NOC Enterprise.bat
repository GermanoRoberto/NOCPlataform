@echo off
chcp 65001 >nul
title NOC Enterprise Command Center - Camilo dos Santos
color 0B
cls

pushd "%~dp0"

echo ======================================================================
echo    NOC ENTERPRISE - INICIANDO PROCESSO CONTÍNUO
echo    Diretorio Atual: %CD%
echo ======================================================================
echo.

:LOOP_NOC
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-noc-enterprise.ps1"
echo.
echo [AVISO] O processo do NOC encerrou em %DATE% %TIME%. Reiniciando em 5 segundos...
timeout /t 5 /nobreak >nul
goto LOOP_NOC

popd
