$ErrorActionPreference = "Continue"

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $root -or -not (Test-Path (Join-Path $root "server.js"))) { $root = (Get-Location).Path }
Set-Location -LiteralPath $root

function Get-PrimaryIPv4 {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -and
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.InterfaceAlias -notmatch "Loopback|vEthernet|Virtual|Docker|WSL|Bluetooth"
        } |
        Sort-Object @{ Expression = { if ($_.PrefixOrigin -eq "Manual") { 0 } else { 1 } } }, InterfaceMetric

    return ($addresses | Select-Object -First 1).IPAddress
}

function Get-ListenerProcess {
    param([int]$Port)
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) { return $null }
    return Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
}

$port = 4002
$networkIp = Get-PrimaryIPv4
$localUrl = "http://localhost:$port"
$networkUrl = if ($networkIp) { "http://$networkIp`:$port" } else { "http://localhost:$port" }

Clear-Host
Write-Host "======================================================================" -ForegroundColor DarkCyan
Write-Host "    NOC ENTERPRISE - SERVIDOR DE PRODUCAO (PORTA $port)               " -ForegroundColor Cyan
Write-Host "    Diretorio: $root                                                  " -ForegroundColor DarkGray
Write-Host "======================================================================" -ForegroundColor DarkCyan
Write-Host ""

$existing = Get-ListenerProcess -Port $port
if ($existing) {
    Write-Host "[OK] O servidor NOC Enterprise ja esta em execucao ativa." -ForegroundColor Green
    Write-Host "     Processo: $($existing.ProcessName) (PID: $($existing.Id))" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Endpoints Operacionais:" -ForegroundColor Cyan
    Write-Host " -> Local : $localUrl" -ForegroundColor White
    Write-Host " -> Rede  : $networkUrl" -ForegroundColor Green
    Write-Host ""
    Read-Host "Pressione Enter para fechar esta janela"
    exit 0
}

# Localizar Node.js
$nodeCmd = "node"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Program Files\nodejs\node.exe") {
        $nodeCmd = "C:\Program Files\nodejs\node.exe"
    } else {
        Write-Host "[ERRO CRITICO] Node.js nao encontrado no PATH ou em C:\Program Files\nodejs\." -ForegroundColor Red
        Write-Host "Instale o Node.js v18+ LTS para prosseguir."
        Read-Host "Pressione Enter para sair"
        exit 1
    }
}

# Verificar dependencias
if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "Instalando dependencias de producao (npm install)..." -ForegroundColor Yellow
    Push-Location $root
    Start-Process -FilePath "npm" -ArgumentList "install --omit=dev" -Wait -NoNewWindow
    Pop-Location
}

# 3. Garantir servico Ollama (AIOps) no System Tray
$ollamaApp = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama app.exe"
$ollamaCli = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"

$ollamaRunning = Get-Process "ollama app" -ErrorAction SilentlyContinue
if (-not $ollamaRunning) {
    if (Test-Path $ollamaApp -ErrorAction SilentlyContinue) {
        Write-Host "[AIOps / Ollama] Inicializando aplicativo Ollama no System Tray..." -ForegroundColor Yellow
        Start-Process -FilePath $ollamaApp -ErrorAction SilentlyContinue
    } elseif (Test-Path $ollamaCli -ErrorAction SilentlyContinue) {
        Write-Host "[AIOps / Ollama] Inicializando servico Ollama (CLI)..." -ForegroundColor Yellow
        Start-Process -FilePath $ollamaCli -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "[AIOps / Ollama] Aplicativo ativo no System Tray (porta 11434)." -ForegroundColor Green
}

Write-Host "Inicializando servidor NOC Enterprise na porta $port..." -ForegroundColor Green
Write-Host ""
Write-Host "Endpoints Operacionais:" -ForegroundColor Cyan
Write-Host " -> Local : $localUrl" -ForegroundColor White
Write-Host " -> Rede  : $networkUrl" -ForegroundColor Green
Write-Host ""
Write-Host "Pressione Ctrl+C para encerrar o servidor." -ForegroundColor DarkYellow
Write-Host "======================================================================" -ForegroundColor DarkCyan
Write-Host ""

try {
    & $nodeCmd server.js
} catch {
    Write-Host "Erro na execucao: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Servidor finalizado." -ForegroundColor Yellow
Read-Host "Pressione Enter para fechar"
