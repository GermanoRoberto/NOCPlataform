@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   VERIFICANDO REQUISITOS E INSTALANDO DEPENDENCIAS
echo ============================================================
echo.

:: Verifica se o Node.js esta instalado no sistema
where node >nul 2>nul
if %errorlevel%==0 goto :node_ok

echo Status: Node.js nao encontrado no sistema!

:: Verifica privilegios de administrador para realizar a instalacao silenciosa
net session >nul 2>&1
if %errorlevel%==0 goto :is_admin

echo Status: Solicitando privilegios de Administrador para instalacao automatica...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b

:is_admin
echo Status: Baixando o instalador oficial do Node.js v20 LTS...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi', '%temp%\node-v20.11.1-x64.msi')"

if not exist "%temp%\node-v20.11.1-x64.msi" (
    echo Erro: Falha ao baixar o instalador do Node.js. Verifique sua conexao de rede.
    pause
    exit /b 1
)

echo Status: Instalando Node.js de forma silenciosa. Por favor, aguarde...
start /wait msiexec.exe /i "%temp%\node-v20.11.1-x64.msi" /qn /norestart

:: Atualiza o PATH da sessao atual para incluir a pasta do Node.js
set "PATH=%PATH%;C:\Program Files\nodejs\"

:: Verifica se instalou com sucesso
where node >nul 2>nul
if not %errorlevel%==0 (
    echo Erro: Falha na instalacao automatica do Node.js. Instale manualmente.
    pause
    exit /b 1
)
echo Status: Node.js instalado com sucesso e adicionado ao PATH!
echo.

:node_ok

echo Status: Verificando e instalando dependencias (npm install)...
call npm install --no-audit --no-fund --loglevel=error
if not %errorlevel%==0 (
    echo Erro: Falha ao instalar/verificar as dependencias via npm.
    echo.
    pause
    exit /b 1
)
echo Status: Dependencias prontas!
echo.

:modules_ok

:: Chama o script PowerShell principal para iniciar o servidor
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-noc.ps1"
endlocal
