@echo off
chcp 65001 >nul
title NOC Enterprise Server (Porta 4002)

pushd "%~dp0"

echo ======================================================================
echo    NOC ENTERPRISE - INICIALIZANDO SERVIDOR NODE
echo    Diretorio Atual: %CD%
echo ======================================================================
echo.

:: Liberar porta 4002 se ja estiver em uso
for /f "tokens=5" %%a in ('netstat -aon ^| find ":4002" ^| find "LISTENING"') do (
    echo Encerrando processo anterior na porta 4002 (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

:: Localizar Node.js
set "NODE_CMD=node"
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_CMD=C:\Program Files\nodejs\node.exe"
    ) else (
        echo [ERRO CRITICO] Node.js nao foi encontrado no PATH nem em C:\Program Files\nodejs\node.exe!
        echo.
        pause
        popd
        exit /b 1
    )
)

echo Iniciando server.js com %NODE_CMD% em %CD%...
"%NODE_CMD%" server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O servidor encerrou com codigo de erro: %errorlevel%
)

echo.
echo Pressione qualquer tecla para fechar...
pause
popd
