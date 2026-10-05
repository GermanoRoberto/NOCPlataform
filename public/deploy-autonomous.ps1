param (
    [string]$Sigla = "GERAL"
)

$ErrorActionPreference = "SilentlyContinue"
$NocIps = @("192.168.100.222:4002", "rcsfti.ddns.net:4002")
$LocalInstaller = "$env:TEMP\Zabbix_Deploy.exe"
$Senhas = @("cs1984dell", "cs1984ibm", "cs1984ibmtc", "cs1984ibmtp", "cs1984hp", "cs1984multilaser")
$Usuarios = @("Administrador", "suporte", "admin")

# Download silencioso
if (-not (Test-Path $LocalInstaller) -or ((Get-Item $LocalInstaller).Length -lt 10000000)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Downloaded = $false
    foreach ($srv in $NocIps) {
        try {
            $url = "http://$srv/downloads/Zabbix.exe"
            Invoke-WebRequest -Uri $url -OutFile $LocalInstaller -UseBasicParsing -TimeoutSec 25
            if ((Test-Path $LocalInstaller) -and ((Get-Item $LocalInstaller).Length -gt 10000000)) {
                $Downloaded = $true
                break
            }
        } catch {}
    }
    if (-not $Downloaded) {
        Write-Output "ERRO: Falha ao baixar instalador Zabbix.exe na filial $Sigla"
        exit 1
    }
}

# Subnets locais da filial
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

# Ping multithread
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

$LocalIps = (Get-NetIPAddress -AddressFamily IPv4).IPAddress
$Instalados = 0
$JaAtivos = 0

foreach ($TargetIp in $Ativos) {
    if ($LocalIps -contains $TargetIp) { continue }

    # Teste Zabbix 10050
    $sZabbix = New-Object Net.Sockets.TcpClient
    $cZabbix = $sZabbix.BeginConnect($TargetIp, 10050, $null, $null)
    if ($cZabbix.AsyncWaitHandle.WaitOne(150, $false) -and $sZabbix.Connected) {
        $sZabbix.Close()
        $JaAtivos++
        continue
    }
    $sZabbix.Close()

    # Teste SMB 445
    $sSmb = New-Object Net.Sockets.TcpClient
    $cSmb = $sSmb.BeginConnect($TargetIp, 445, $null, $null)
    $isWin = $cSmb.AsyncWaitHandle.WaitOne(200, $false) -and $sSmb.Connected
    $sSmb.Close()
    if (-not $isWin) { continue }

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
                try {
                    $dest = "\\$TargetIp\C$\Windows\Temp\Zabbix.exe"
                    Copy-Item -Path $LocalInstaller -Destination $dest -Force -ErrorAction Stop

                    $meta = "windows,camilo-noc-enterprise,$Sigla"
                    $cmd = "schtasks /create /s $TargetIp /u $TargetIp\$user /p `"$pass`" /ru `"NT AUTHORITY\SYSTEM`" /sc ONCE /tn `"ZabbixDeploy`" /tr `"C:\Windows\Temp\Zabbix.exe /silent /norestart HOSTMETADATA=\`"$meta\`"`" /st 00:00 /f"
                    $null = cmd.exe /c "$cmd >nul 2>&1"

                    $run = "schtasks /run /s $TargetIp /u $TargetIp\$user /p `"$pass`" /tn `"ZabbixDeploy`""
                    $null = cmd.exe /c "$run >nul 2>&1"

                    $Sucesso = $true
                    $Instalados++
                } catch {
                } finally {
                    $null = cmd.exe /c "net use \\$TargetIp\C$ /delete /y >nul 2>&1"
                }
                break
            }
        }
        if ($Sucesso) { break }
    }
}

Write-Output "DEPLOY_COMPLETED: Filial=$Sigla | Vivos=$($Ativos.Count) | JaMonitorados=$JaAtivos | NovosInstalados=$Instalados"
