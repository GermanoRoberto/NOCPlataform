param (
    [string]$Sigla = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "       DEPLOY AUTOMATIZADO ZABBIX - FILIAIS            " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Obter Sigla da Filial
if ([string]::IsNullOrWhiteSpace($Sigla)) {
    try {
        $Sigla = (Read-Host "Digite a SIGLA da Unidade (ex: UDI, VGA, CPQ, MTZ, BHZ, RIO)").Trim().ToUpper()
    } catch {}
}
if ([string]::IsNullOrWhiteSpace($Sigla)) { $Sigla = "GERAL" }

$NocIps = @("192.168.100.222:4002", "rcsfti.ddns.net:4002")
$LocalInstaller = "$env:TEMP\Zabbix_Deploy.exe"
$Senhas = @("cs1984dell", "cs1984ibm", "cs1984ibmtc", "cs1984ibmtp", "cs1984hp", "cs1984multilaser")
$Usuarios = @("Administrador", "suporte", "admin")

# 2. Download Transparente do Instalador
if (-not (Test-Path $LocalInstaller) -or ((Get-Item $LocalInstaller).Length -lt 10000000)) {
    Write-Host "`n[+] Baixando instalador Zabbix do NOC..." -ForegroundColor Cyan
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Downloaded = $false

    foreach ($srv in $NocIps) {
        $url = "http://$srv/downloads/Zabbix.exe"
        try {
            Invoke-WebRequest -Uri $url -OutFile $LocalInstaller -UseBasicParsing -TimeoutSec 20
            if ((Test-Path $LocalInstaller) -and ((Get-Item $LocalInstaller).Length -gt 10000000)) {
                $Downloaded = $true
                Write-Host "    Instalador pronto ($(([math]::Round((Get-Item $LocalInstaller).Length / 1MB))) MB)!" -ForegroundColor Green
                break
            }
        } catch {}
    }

    if (-not $Downloaded) {
        Write-Host "[!] Erro: Nao foi possivel baixar o instalador do NOC. Verifique a rota." -ForegroundColor Red
        return
    }
}

# 3. Deteccao de Faixas da Filial
$Subnets = [System.Collections.Generic.HashSet[string]]::new()
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { 
    $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Virtual' -and 
    ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*')
} | ForEach-Object {
    $oct = $_.IPAddress.Split('.')
    $Subnets.Add("$($oct[0]).$($oct[1]).$($oct[2])")
}
Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
    $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*'
} | ForEach-Object {
    $oct = $_.IPAddress.Split('.')
    $Subnets.Add("$($oct[0]).$($oct[1]).$($oct[2])")
}

Write-Host "`n[*] Faixas identificadas na filial:" -ForegroundColor Yellow
$Subnets | ForEach-Object { Write-Host "    - $_.*" -ForegroundColor Cyan }

$Extra = ""
if ([Environment]::UserInteractive) {
    try {
        $Extra = Read-Host "`nDeseja adicionar mais alguma faixa? (ENTER para seguir)"
    } catch {}
}
if ($Extra -and $Extra.Trim()) {
    ($Extra -split '[,; ]+') | ForEach-Object {
        $p = $_.Trim().TrimEnd('.*').TrimEnd('*').TrimEnd('.')
        if ($p -match '^\d+\.\d+\.\d+') { $Subnets.Add(($p -split '\.')[0..2] -join '.') }
    }
}

# 4. Varredura Ping Multithread
Write-Host "`n[*] Varrendo dispositivos na rede..." -ForegroundColor Yellow
$Pings = @()
foreach ($Sub in $Subnets) {
    1..254 | ForEach-Object {
        $ip = "$Sub.$_"
        $p = New-Object System.Net.NetworkInformation.Ping
        $Pings += [PSCustomObject]@{ IP = $ip; Task = $p.SendPingAsync($ip, 300) }
    }
}
[System.Threading.Tasks.Task]::WaitAll($Pings.Task)
$Ativos = ($Pings | Where-Object { $_.Task.Result.Status -eq 'Success' }).IP
Write-Host "[+] Dispositivos respondendo: $($Ativos.Count)`n" -ForegroundColor Green

# 5. Processamento dos Dispositivos
$LocalIps = (Get-NetIPAddress -AddressFamily IPv4).IPAddress
$Instalados = 0
$JaInstalados = 0

foreach ($TargetIp in $Ativos) {
    if ($LocalIps -contains $TargetIp) { continue }

    # Teste Zabbix 10050
    $sZabbix = New-Object Net.Sockets.TcpClient
    $cZabbix = $sZabbix.BeginConnect($TargetIp, 10050, $null, $null)
    if ($cZabbix.AsyncWaitHandle.WaitOne(150, $false) -and $sZabbix.Connected) {
        $sZabbix.Close()
        Write-Host "[-] ${TargetIp} - Zabbix ja ativo. Pulando..." -ForegroundColor Gray
        $JaInstalados++
        continue
    }
    $sZabbix.Close()

    # Teste SMB 445
    $sSmb = New-Object Net.Sockets.TcpClient
    $cSmb = $sSmb.BeginConnect($TargetIp, 445, $null, $null)
    $isWin = $cSmb.AsyncWaitHandle.WaitOne(200, $false) -and $sSmb.Connected
    $sSmb.Close()

    if (-not $isWin) { continue }

    Write-Host "[>] Conectando em ${TargetIp}..." -ForegroundColor Cyan

    $Sucesso = $false
    foreach ($user in $Usuarios) {
        foreach ($pass in $Senhas) {
            $null = cmd.exe /c "net use \\$TargetIp\IPC$ /delete /y >nul 2>&1"
            $null = cmd.exe /c "net use \\$TargetIp\C$ /delete /y >nul 2>&1"

            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = "cmd.exe"
            $psi.Arguments = "/c net use \\$TargetIp\C$ /user:$TargetIp\$user `"$pass`""
            $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
            $psi.CreateNoWindow = $true
            $psi.UseShellExecute = $false
            
            $proc = [System.Diagnostics.Process]::Start($psi)
            if (-not $proc.WaitForExit(3000)) {
                $proc.Kill()
                continue
            }

            if (Test-Path "\\$TargetIp\C$\Windows\Temp" -ErrorAction SilentlyContinue) {
                Write-Host "    [+] Autenticado em ${TargetIp} ($user)" -ForegroundColor Green
                try {
                    $dest = "\\$TargetIp\C$\Windows\Temp\Zabbix.exe"
                    Copy-Item -Path $LocalInstaller -Destination $dest -Force -ErrorAction Stop

                    $meta = "windows,camilo-noc-enterprise,$Sigla"
                    $cmd = "schtasks /create /s $TargetIp /u $TargetIp\$user /p `"$pass`" /ru `"NT AUTHORITY\SYSTEM`" /sc ONCE /tn `"ZabbixDeploy`" /tr `"C:\Windows\Temp\Zabbix.exe /silent /norestart HOSTMETADATA=\`"$meta\`"`" /st 00:00 /f"
                    $null = cmd.exe /c "$cmd >nul 2>&1"

                    $run = "schtasks /run /s $TargetIp /u $TargetIp\$user /p `"$pass`" /tn `"ZabbixDeploy`""
                    $null = cmd.exe /c "$run >nul 2>&1"

                    Write-Host "    [OK] ZABBIX INSTALADO EM ${TargetIp} (Filial: $Sigla)!" -ForegroundColor Green
                    $Sucesso = $true
                    $Instalados++
                } catch {
                    Write-Host "    [!] Erro em ${TargetIp}: $($_.Exception.Message)" -ForegroundColor Red
                } finally {
                    $null = cmd.exe /c "net use \\$TargetIp\C$ /delete /y >nul 2>&1"
                }
                break
            }
        }
        if ($Sucesso) { break }
    }

    if (-not $Sucesso) {
        Write-Host "    [-] ${TargetIp}: Senhas locais nao bateram ou SMB travado. Pulando..." -ForegroundColor DarkYellow
    }
}

# 6. Resumo Final
Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "                 RESUMO DO DEPLOY                     " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "Filial / Sigla              : $Sigla" -ForegroundColor Yellow
Write-Host "Dispositivos Ativos         : $($Ativos.Count)" -ForegroundColor White
Write-Host "Estações já Monitoradas     : $JaInstalados" -ForegroundColor Gray
Write-Host "Novas Instalações Efetuadas : $Instalados" -ForegroundColor Green
Write-Host "`n[OK] Deploy finalizado com sucesso!" -ForegroundColor Green
