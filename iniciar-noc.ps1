$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

function Read-DotEnvValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$DefaultValue
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $DefaultValue
    }

    $line = Get-Content -LiteralPath $Path |
        Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } |
        Select-Object -First 1

    if (-not $line) {
        return $DefaultValue
    }

    $value = ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return $value
}

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

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if (-not $listener) {
        return $null
    }

    return Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
}

$port = [int](Read-DotEnvValue -Path (Join-Path $root ".env") -Key "PORT" -DefaultValue "4002")
$networkIp = Get-PrimaryIPv4
$localUrl = "http://localhost:$port"
$networkUrl = if ($networkIp) { "http://$networkIp`:$port" } else { "Não foi possível detectar o IP de rede" }

Clear-Host
Write-Host "============================================================" -ForegroundColor DarkCyan
Write-Host " CAMILO DOS SANTOS NOC - INICIALIZADOR" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor DarkCyan
Write-Host ""

$existing = Get-ListenerProcess -Port $port
if ($existing) {
    Write-Host "Status: NOC já está em execução" -ForegroundColor Green
    Write-Host "Processo: $($existing.ProcessName) (PID $($existing.Id))"
    Write-Host ""
    Write-Host "Links de acesso" -ForegroundColor Cyan
    Write-Host "Local: $localUrl"
    Write-Host "Rede : $networkUrl" -ForegroundColor Green
    Write-Host ""
    Read-Host "Pressione Enter para fechar esta janela"
} else {
    $nodeCmd = "node"
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        if (Test-Path "C:\Program Files\nodejs\node.exe") {
            $nodeCmd = "C:\Program Files\nodejs\node.exe"
        } else {
            Write-Host "Status: Node.js não encontrado no PATH ou em C:\Program Files\nodejs\node.exe." -ForegroundColor Red
            Write-Host "Instale o Node.js ou ajuste o PATH antes de iniciar o NOC."
            Write-Host ""
            Read-Host "Pressione Enter para sair"
            exit 1
        }
    }

    Write-Host "Links de acesso" -ForegroundColor Cyan
    Write-Host "Local: $localUrl"
    Write-Host "Rede : $networkUrl" -ForegroundColor Green
    Write-Host ""
    Write-Host "Para parar o NOC, feche esta janela do PowerShell ou pressione Ctrl+C." -ForegroundColor Yellow
    Write-Host "============================================================" -ForegroundColor DarkCyan
    Write-Host ""

    Write-Host "Status: Iniciando servidor NOC no primeiro plano..." -ForegroundColor Yellow
    try {
        & $nodeCmd server.js
    } catch {
        Write-Host "Erro ao executar o servidor NOC: $_" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "O servidor foi finalizado." -ForegroundColor Red
    Read-Host "Pressione Enter para fechar esta janela"
}
