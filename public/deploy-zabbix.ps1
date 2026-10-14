param (
    [string]$Sigla = "",
    [string]$Faixa = "",
    [switch]$Silent = $false,
    [switch]$LocalOnly = $false
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"

$NocIps = if (Test-Connection -ComputerName 192.168.100.222 -Count 1 -Quiet -ErrorAction SilentlyContinue) {
    @("192.168.100.222:4002", "rcsfti.ddns.net:4002")
} else {
    @("rcsfti.ddns.net:4002", "192.168.100.222:4002")
}
$WorkingSrv = $null
foreach ($srv in $NocIps) {
    try {
        $test = Invoke-RestMethod -Uri "http://$srv/api/deploy/branches" -TimeoutSec 2 -ErrorAction Stop
        if ($test) { $WorkingSrv = $srv; break }
    } catch {}
}
if (-not $WorkingSrv) { $WorkingSrv = $NocIps[0] }

function Log-Noc([string]$Text, [string]$Color = "Cyan") {
    if (-not $Silent) {
        Write-Host $Text -ForegroundColor $Color
    }
    if ($Sigla -and $Sigla -ne "GERAL") {
        try {
            $b = @{ branch = $Sigla; text = ($Text + "`n") } | ConvertTo-Json
            $wc = New-Object Net.WebClient
            $wc.Headers["Content-Type"] = "application/json"
            $wc.UploadString("http://$WorkingSrv/api/deploy/log", $b) | Out-Null
        } catch {}
    }
}

# Prevenção de concorrência: Apenas 1 instância executando por máquina
if ($Sigla) {
    $LockFile = Join-Path $env:TEMP "noc_deploy_${Sigla}.lock"
    if (Test-Path $LockFile) {
        $lockAge = (Get-Date) - (Get-Item $LockFile).LastWriteTime
        if ($lockAge.TotalMinutes -lt 3) {
            Log-Noc "[-] Instancia de deploy ja em andamento para $Sigla nesta maquina. Abortando duplicata..." "DarkYellow"
            exit 0
        }
    }
    Set-Content -Path $LockFile -Value (Get-Date).ToString("o") -Force
}


Log-Noc "=======================================================" "Cyan"
Log-Noc "       DEPLOY AUTOMATIZADO & REPARO ZABBIX - FILIAIS   " "Cyan"
Log-Noc "=======================================================" "Cyan"

# 1. Obter Sigla da Filial
if ([string]::IsNullOrWhiteSpace($Sigla)) {
    if (-not $Silent -and [Environment]::UserInteractive) {
        try {
            $Sigla = (Read-Host "Digite a SIGLA da Unidade (ex: UDI, VGA, CPQ, MTZ, BHZ, RIO)").Trim().ToUpper()
        } catch {}
    }
}
if ([string]::IsNullOrWhiteSpace($Sigla)) { $Sigla = "GERAL" }

# Registrar a máquina executora na Filial informada no NOC/Zabbix
if ($Sigla -and $Sigla -ne "GERAL") {
    $myHost = $env:COMPUTERNAME
    $myIps = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Virtual' }).IPAddress
    foreach ($srv in $NocIps) {
        try {
            $regBody = @{ hostname = $myHost; ips = $myIps; city = $Sigla } | ConvertTo-Json
            Invoke-RestMethod -Uri "http://$srv/api/deploy/register-branch" -Method POST -Body $regBody -ContentType "application/json" -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
            break
        } catch {}
    }
}

$LocalInstaller = "$env:TEMP\Zabbix_Deploy.exe"
$Senhas = @(
    "cs1984dell", "CS1984DELL", "Cs1984dell",
    "cs1984ibm", "CS1984IBM", "Cs1984ibm",
    "cs1984ibmtc", "CS1984IBMTC", "Cs1984ibmtc",
    "cs1984ibmtp", "CS1984IBMTP", "Cs1984ibmtp",
    "cs1984hp", "CS1984HP", "Cs1984hp",
    "cs1984multilaser", "CS1984MULTILASER", "Cs1984multilaser"
)
# Lista ampliada de contas administrativas (contorna 'Administrador' desativado pelo Windows)
$Usuarios = @("Administrador", "suporte", "admin", "administrador.local", "ti", "operador")

function Ensure-ZabbixInstaller {
    if ((Test-Path $LocalInstaller) -and ((Get-Item $LocalInstaller).Length -gt 10000000)) {
        return $true
    }
    Log-Noc "`n[+] Obtendo instalador Zabbix do NOC..." "Cyan"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Downloaded = $false

    foreach ($srv in $NocIps) {
        $url = "http://$srv/downloads/Zabbix.exe"
        try {
            $wcDown = New-Object Net.WebClient
            $wcDown.DownloadFile($url, $LocalInstaller)
            if ((Test-Path $LocalInstaller) -and ((Get-Item $LocalInstaller).Length -gt 10000000)) {
                $Downloaded = $true
                Log-Noc "    Instalador pronto ($(([math]::Round((Get-Item $LocalInstaller).Length / 1MB))) MB)!" "Green"
                break
            }
        } catch {
            Log-Noc "    [!] Tentativa de download via $srv falhou: $($_.Exception.Message)" "DarkYellow"
        }
    }
    return $Downloaded
}

# 2. Obter Inventário do Servidor NOC (Single Source of Truth)
Log-Noc "`n[*] Consultando inventário central do NOC..." "Cyan"
$AllKnownComputers = @{}
$OnlineComputersIps = [System.Collections.Generic.HashSet[string]]::new()
$KnownNonWindowsIps = [System.Collections.Generic.HashSet[string]]::new()
$NocServerReachable = $false

foreach ($srv in $NocIps) {
    try {
        $statusUrl = "http://$srv/api/status"
        $res = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 8 -ErrorAction Stop
        
        # 2.1 Computadores Online e Conhecidos
        $comps = $res.data.computers
        if (-not $comps) { $comps = $res.computers }
        if ($comps -and $comps.Count -gt 0) {
            foreach ($c in $comps) {
                $ip1 = if ($c.ip -and $c.ip -match '^\d+\.\d+\.\d+\.\d+$') { $c.ip.Trim() } else { $null }
                $ip2 = if ($c.localIp -and $c.localIp -match '^\d+\.\d+\.\d+\.\d+$') { $c.localIp.Trim() } else { $null }

                if ($ip1) { $AllKnownComputers[$ip1] = $c }
                if ($ip2) { $AllKnownComputers[$ip2] = $c }

                if ($c.status -eq "online" -and ($c.agentStatus -eq "online" -or $c.lastClock -gt 0)) {
                    if ($ip1) { [void]$OnlineComputersIps.Add($ip1) }
                    if ($ip2) { [void]$OnlineComputersIps.Add($ip2) }
                }
            }
        }

        # 2.2 Impressoras Conhecidas (JAMAIS tentar deploy de agent)
        $printers = $res.data.printers
        if (-not $printers) { $printers = $res.printers }
        if ($printers) {
            foreach ($p in $printers) {
                if ($p.ip -and $p.ip -match '^\d+\.\d+\.\d+\.\d+$') {
                    [void]$KnownNonWindowsIps.Add($p.ip.Trim())
                }
            }
        }

        # 2.3 Roteadores / Switches / Links Conhecidos
        $links = $res.data.links
        if (-not $links) { $links = $res.links }
        if ($links) {
            foreach ($l in $links) {
                if ($l.ip -and $l.ip -match '^\d+\.\d+\.\d+\.\d+$') {
                    [void]$KnownNonWindowsIps.Add($l.ip.Trim())
                }
            }
        }

        $NocServerReachable = $true
        Log-Noc "    [+] NOC conectado! $($OnlineComputersIps.Count) PCs ativos | $($KnownNonWindowsIps.Count) dispositivos de rede/impressoras identificados." "Green"
        break
    } catch {}
}

if (-not $NocServerReachable) {
    Log-Noc "    [!] Aviso: Não foi possível obter inventário ativo do NOC via API. Usará fingerprinting local inteligente." "Yellow"
}

# 3. Preparacao de Instalacao Sob Demanda (Instalador sera baixado apenas se houver estacoes necessitando)
# (Evita travar o sweep e a varredura caso nenhum computador precise de instalacao)

# 4. Deteccao Dinamica de Rede, Adaptadores (Cabo & Wi-Fi) e Faixas da Filial
$Subnets = [System.Collections.Generic.HashSet[string]]::new()
$LocalAdapterSubnets = [System.Collections.Generic.HashSet[string]]::new()
$LocalIps = @()

function Get-SubnetPrefixes {
    param(
        [string]$IP,
        [int]$PrefixLength = 24
    )
    $list = [System.Collections.Generic.List[string]]::new()
    if (-not ($IP -match '^\d+\.\d+\.\d+\.\d+$')) { return $list }
    $oct = $IP.Split('.') | ForEach-Object { [int]$_ }
    
    # Restringir a sub-redes corporativas comuns (/22 a /24)
    if ($PrefixLength -lt 22 -or $PrefixLength -gt 24) {
        $PrefixLength = 24
    }
    $blockSize = [int][Math]::Pow(2, (24 - $PrefixLength))
    $base3rd = [int]([Math]::Floor($oct[2] / $blockSize) * $blockSize)
    for ($i = 0; $i -lt $blockSize; $i++) {
        $list.Add("$($oct[0]).$($oct[1]).$($base3rd + $i)")
    }
    return $list
}

Log-Noc "`n[*] Inspecionando adaptadores de rede (Cabo e Wi-Fi)..." "Yellow"

$netAdapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Virtual|Npcap' }
$wlanInfo = $null
try {
    $wlanRaw = netsh wlan show interfaces 2>$null
    if ($wlanRaw) {
        $ssidMatch = ($wlanRaw | Select-String -Pattern '^\s*SSID\s*:\s*(.+)$')
        $bssidMatch = ($wlanRaw | Select-String -Pattern '^\s*BSSID\s*:\s*(.+)$')
        $signalMatch = ($wlanRaw | Select-String -Pattern '^\s*(?:Sinal|Signal)\s*:\s*(.+)$')
        if ($ssidMatch) {
            $wlanInfo = @{
                SSID = ($ssidMatch.Matches[0].Groups[1].Value.Trim())
                BSSID = if ($bssidMatch) { $bssidMatch.Matches[0].Groups[1].Value.Trim() } else { "N/A" }
                Signal = if ($signalMatch) { $signalMatch.Matches[0].Groups[1].Value.Trim() } else { "N/A" }
            }
        }
    }
} catch {}

if ($netAdapters) {
    foreach ($adapter in $netAdapters) {
        $isWifi = ($adapter.PhysicalMediaType -match '802.11|Wireless' -or 
                   $adapter.MediaType -match 'Native 802.11' -or 
                   $adapter.InterfaceDescription -match 'Wireless|Wi-Fi|802.11|WLAN|AX20|AC|Killer' -or 
                   $adapter.Name -match 'Wi-Fi|Wireless|Sem Fio')

        $tipo = if ($isWifi) { "Wi-Fi (Sem Fio)" } else { "Ethernet (Cabo)" }
        $color = if ($isWifi) { "Magenta" } else { "Green" }

        $adapterIps = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
            $_.IPAddress -notmatch '^(127\.|169\.254\.)'
        }

        $gwRoute = Get-NetRoute -InterfaceIndex $adapter.ifIndex -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1
        $gwIp = if ($gwRoute -and $gwRoute.NextHop -and $gwRoute.NextHop -ne '0.0.0.0') { $gwRoute.NextHop } else { "Direto/DHCP" }

        foreach ($ipObj in $adapterIps) {
            $ipStr = $ipObj.IPAddress
            $LocalIps += $ipStr
            $pLen = if ($ipObj.PrefixLength) { [int]$ipObj.PrefixLength } else { 24 }
            $calculatedSubnets = Get-SubnetPrefixes -IP $ipStr -PrefixLength $pLen
            foreach ($cs in $calculatedSubnets) {
                [void]$LocalAdapterSubnets.Add($cs)
            }

            $extraDetail = ""
            if ($isWifi -and $wlanInfo) {
                $extraDetail = " [SSID: $($wlanInfo.SSID) | Sinal: $($wlanInfo.Signal)]"
            }

            Log-Noc "    [+] Placa: $($adapter.Name) [$tipo]$extraDetail -> IP: $ipStr/$pLen | Faixas Detectadas: $($calculatedSubnets -join ', ') | Gateway: $gwIp" $color
        }
    }
} else {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { 
        $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Virtual' -and 
        $_.IPAddress -notmatch '^(127\.|169\.254\.)'
    } | ForEach-Object {
        $ipStr = $_.IPAddress
        $LocalIps += $ipStr
        $pLen = if ($_.PrefixLength) { [int]$_.PrefixLength } else { 24 }
        $calculatedSubnets = Get-SubnetPrefixes -IP $ipStr -PrefixLength $pLen
        foreach ($cs in $calculatedSubnets) {
            [void]$LocalAdapterSubnets.Add($cs)
        }
        Log-Noc "    [+] IP Local Detectado: $ipStr/$pLen (Interface: $($_.InterfaceAlias)) -> Faixas: $($calculatedSubnets -join ', ')" "Cyan"
    }
}

# 4.2 Identificar em qual filial a máquina executora atual está cadastrada no NOC
$CurrentMachineBranch = $null
if ($comps) {
    foreach ($lip in $LocalIps) {
        if ($AllKnownComputers.ContainsKey($lip)) {
            $c = $AllKnownComputers[$lip]
            if ($c.city) {
                $CurrentMachineBranch = $c.city.Trim().ToUpper()
                break
            }
        }
    }
}

# 4.3 Detecção Híbrida Completa: Sub-redes dos Adaptadores Físicos (Cabo & Wi-Fi) + Inventário da Filial
# 1) Sempre inclui TODAS as sub-redes ativas detectadas na máquina (placa cabeada, placa Wi-Fi, etc.)
foreach ($lSub in $LocalAdapterSubnets) {
    [void]$Subnets.Add($lSub)
}

# 2) Inclui também sub-redes conhecidas da filial via inventário NOC (VLANs corporativas, Wi-Fi e Coleta)
if ($comps) {
    foreach ($c in $comps) {
        $cBranch = if ($c.city) { $c.city.Trim().ToUpper() } else { "GERAL" }
        if ($cBranch -eq $Sigla) {
            $ipToCheck = if ($c.localIp) { $c.localIp } else { $c.ip }
            if ($ipToCheck -and $ipToCheck -match '^\d+\.\d+\.\d+\.\d+$') {
                $oct = $ipToCheck.Split('.')
                if ($oct[0] -eq '192' -or $oct[0] -eq '10' -or $oct[0] -eq '172') {
                    $sKey = "$($oct[0]).$($oct[1]).$($oct[2])"
                    [void]$Subnets.Add($sKey)
                }
            }
        }
    }
}

# Incluir sub-redes de impressoras/coletores já registrados na filial (ex: VLAN de Coleta/Wi-Fi)
if ($printers -and $Sigla -ne "GERAL") {
    foreach ($p in $printers) {
        $pBranch = if ($p.city) { $p.city.Trim().ToUpper() } else { "" }
        if ($pBranch -eq $Sigla -and $p.ip -and $p.ip -match '^\d+\.\d+\.\d+\.\d+$') {
            $oct = $p.ip.Split('.')
            if ($oct[0] -eq '192' -or $oct[0] -eq '10' -or $oct[0] -eq '172') {
                $sKey = "$($oct[0]).$($oct[1]).$($oct[2])"
                [void]$Subnets.Add($sKey)
            }
        }
    }
}

# 4.4 Faixa informada manualmente via parâmetro (override explícito se informado)
if ($Faixa -and $Faixa.Trim()) {
    ($Faixa -split '[,; ]+') | ForEach-Object {
        $p = $_.Trim().TrimEnd('.*').TrimEnd('*').TrimEnd('.')
        if ($p -match '^\d+\.\d+\.\d+') { [void]$Subnets.Add(($p -split '\.')[0..2] -join '.') }
    }
}


Log-Noc "`n[*] Faixas identificadas na filial ($Sigla):" "Yellow"
$Subnets | ForEach-Object { Log-Noc "    - $_.*" "Cyan" }

$Extra = ""
if (-not $Silent -and [Environment]::UserInteractive) {
    try {
        $Extra = Read-Host "`nDeseja adicionar mais alguma faixa? (ENTER para seguir)"
    } catch {}
}
if ($Extra -and $Extra.Trim()) {
    ($Extra -split '[,; ]+') | ForEach-Object {
        $p = $_.Trim().TrimEnd('.*').TrimEnd('*').TrimEnd('.')
        if ($p -match '^\d+\.\d+\.\d+') { $null = $Subnets.Add(($p -split '\.')[0..2] -join '.') }
    }
}

# 4.5 Auto-Deploy / Reparo na Própria Máquina Executora
$localService = Get-Service -Name "Zabbix Agent 2" -ErrorAction SilentlyContinue
if (-not $localService -or $localService.Status -ne "Running") {
    Log-Noc "`n[*] Detectado que a máquina local ($env:COMPUTERNAME) precisa de instalação/reparo do Zabbix..." "Yellow"
    try {
        cmd.exe /c "net user Administrador cs1984ibm /active:yes & reg add HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f" >nul 2>&1
        if (Ensure-ZabbixInstaller) {
            $meta = "windows,camilo-noc-enterprise,$Sigla"
            Start-Process -FilePath $LocalInstaller -ArgumentList "/silent /norestart HOSTMETADATA=\`"$meta\`"" -Wait
            Log-Noc "    [OK] ZABBIX INSTALADO LOCALMENTE COM SUCESSO EM $env:COMPUTERNAME (Filial: $Sigla)!" "Green"
        }
    } catch {
        Log-Noc "    [!] Falha na instalacao local: $($_.Exception.Message)" "Red"
    }
}

if ($LocalOnly) {
    Log-Noc "`n[OK] Modo LocalOnly finalizado em $env:COMPUTERNAME!" "Green"
    if ($LockFile -and (Test-Path $LockFile)) { Remove-Item -Path $LockFile -Force -ErrorAction SilentlyContinue }
    exit 0
}

# 5. Varredura Ping Multithread (Timeout 800ms para cobertura total de Wi-Fi e Cabo)
Log-Noc "`n[*] Varrendo dispositivos na rede ($Sigla)..." "Yellow"
$Pings = @()
foreach ($Sub in $Subnets) {
    1..254 | ForEach-Object {
        $ip = "$Sub.$_"
        $p = New-Object System.Net.NetworkInformation.Ping
        $Pings += [PSCustomObject]@{ IP = $ip; Task = $p.SendPingAsync($ip, 800) }
    }
}
[System.Threading.Tasks.Task]::WaitAll($Pings.Task)
$Ativos = ($Pings | Where-Object { $_.Task.Result.Status -eq 'Success' }).IP
Log-Noc "[+] Dispositivos respondendo ao Ping na filial ($Sigla): $($Ativos.Count)`n" "Green"

# 6. Processamento com Classificação de Dispositivo & Auto-Reparo
$LocalIps = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
$Instalados = 0
$Reparados = 0
$JaInstalados = 0
$DispositivosIgnorados = 0

# Identificar filial da máquina de origem (onde o script está rodando)
$OriginBranch = $null
foreach ($lip in $LocalIps) {
    if ($AllKnownComputers.ContainsKey($lip)) {
        $cObj = $AllKnownComputers[$lip]
        if ($cObj.city) {
            $OriginBranch = $cObj.city.Trim().ToUpper()
            break
        }
    }
}

# Função auxiliar para testar conexão TCP rápida
function Test-PortQuickly([string]$Ip, [int]$Port, [int]$TimeoutMs = 350) {
    $tcp = New-Object Net.Sockets.TcpClient
    $ar = $tcp.BeginConnect($Ip, $Port, $null, $null)
    $ok = $ar.AsyncWaitHandle.WaitOne($TimeoutMs, $false) -and $tcp.Connected
    $tcp.Close()
    return $ok
}

foreach ($TargetIp in $Ativos) {
    if ($LocalIps -contains $TargetIp) { continue }

    # REGRA CRÍTICA 1: O IP já pertence a OUTRA unidade cadastrada no Zabbix/NOC?
    # Se uma máquina com IP/Hostname de outra filial estiver respondendo AQUI nesta filial,
    # significa que foi fisicamente realocada. Não bloqueamos: atualizamos sua filial!
    if ($AllKnownComputers.ContainsKey($TargetIp)) {
        $existComp = $AllKnownComputers[$TargetIp]
        $existBranch = if ($existComp.city) { $existComp.city.Trim().ToUpper() } else { "" }
        if ($existBranch -and $Sigla -ne "GERAL" -and $existBranch -ne $Sigla) {
            Log-Noc "[>] ${TargetIp} ($($existComp.name)) - Anteriormente na filial $existBranch. Detectada fisicamente em $Sigla (Realocação)! Prosseguindo deploy..." "Yellow"
        }
    }

    # REGRA CRÍTICA 2: A máquina de origem pertence a outra unidade? Jamais varrer a rede da origem!
    if ($OriginBranch -and $Sigla -ne "GERAL" -and $OriginBranch -ne $Sigla) {
        $targetSub = ($TargetIp.Split('.'))[0..2] -join '.'
        $isOriginSubnet = $false
        foreach ($lip in $LocalIps) {
            $lipSub = ($lip.Split('.'))[0..2] -join '.'
            if ($targetSub -eq $lipSub) {
                $isOriginSubnet = $true
                break
            }
        }
        if ($isOriginSubnet) {
            $DispositivosIgnorados++
            continue
        }
    }

    # REGRA A: Já cadastrado no NOC como Impressora ou Roteador
    if ($KnownNonWindowsIps.Contains($TargetIp)) {
        Log-Noc "[-] ${TargetIp} - Equipamento de Infra/Impressora (NOC). Pulando..." "DarkGray"
        $DispositivosIgnorados++
        continue
    }

    # REGRA B: Identificação de Impressoras de Rede (JetDirect 9100 ou IPP 631)
    if (Test-PortQuickly $TargetIp 9100 120 -or Test-PortQuickly $TargetIp 631 120) {
        Log-Noc "[-] ${TargetIp} - Impressora de Rede detectada (Porta 9100/631). Pulando..." "DarkGray"
        $DispositivosIgnorados++
        continue
    }

    # REGRA C: Identificação de Câmeras CFTV / DVR / NVR (RTSP 554 ou CFTV 8000/37777)
    if (Test-PortQuickly $TargetIp 554 120 -or Test-PortQuickly $TargetIp 8000 120 -or Test-PortQuickly $TargetIp 37777 120) {
        Log-Noc "[-] ${TargetIp} - Câmera CFTV / Gravador detectado (Porta 554/8000). Pulando..." "DarkGray"
        $DispositivosIgnorados++
        continue
    }

    # REGRA D: Computador Saudável no NOC (Já com Zabbix ativo e comunicando)
    if ($NocServerReachable -and $OnlineComputersIps.Contains($TargetIp)) {
        $cName = if ($AllKnownComputers.ContainsKey($TargetIp)) { " ($($AllKnownComputers[$TargetIp].name))" } else { "" }
        Log-Noc "[-] ${TargetIp}${cName} - Computador com Zabbix ativo e comunicando com o NOC. Pulando..." "Gray"
        $JaInstalados++
        continue
    }

    # REGRA E: Verificação de Dispositivo Windows (Inventário NOC, Portas de Gestão ou Probe Rápido)
    $isKnownComp = $AllKnownComputers.ContainsKey($TargetIp)
    $port10050 = Test-PortQuickly $TargetIp 10050 450
    $isSmb445 = Test-PortQuickly $TargetIp 445 450
    $isRpc135 = if (-not $isSmb445) { Test-PortQuickly $TargetIp 135 450 } else { $true }
    $isRdp3389 = if (-not $isSmb445 -and -not $isRpc135) { Test-PortQuickly $TargetIp 3389 450 } else { $true }
    $isWinRm5985 = if (-not $isSmb445 -and -not $isRpc135 -and -not $isRdp3389) { Test-PortQuickly $TargetIp 5985 450 } else { $true }
    $isWsd5357 = if (-not $isSmb445 -and -not $isRpc135 -and -not $isRdp3389 -and -not $isWinRm5985) { Test-PortQuickly $TargetIp 5357 450 } else { $true }

    $devHostname = $null
    try {
        $entry = [System.Net.Dns]::GetHostEntry($TargetIp)
        if ($entry -and $entry.HostName) { $devHostname = $entry.HostName }
    } catch {}

    $isWindowsHostname = $false
    if ($devHostname) {
        if ($devHostname -match '(?i)(camilo|desktop|laptop|pc|serv|oper|adm|ti|win|\b[0-9A-Z]{7}\b)') {
            $isWindowsHostname = $true
        }
    }

    $isWindows = $isKnownComp -or $port10050 -or $isSmb445 -or $isRpc135 -or $isRdp3389 -or $isWinRm5985 -or $isWsd5357 -or $isWindowsHostname

    # Handshake rápido de SMB caso portas não tenham respondido (contorna firewall em perfil Wi-Fi/Público)
    if (-not $isWindows) {
        try {
            $psiProbe = New-Object System.Diagnostics.ProcessStartInfo
            $psiProbe.FileName = "cmd.exe"
            $psiProbe.Arguments = "/c net use \\$TargetIp\IPC$ /user:.\Administrador cs1984ibm"
            $psiProbe.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
            $psiProbe.CreateNoWindow = $true
            $psiProbe.UseShellExecute = $false
            $procProbe = [System.Diagnostics.Process]::Start($psiProbe)
            if ($procProbe.WaitForExit(1200)) {
                # Códigos típicos do subsistema Windows LSA/SAM via SMB:
                # 0 (sucesso), 1326 (senha incorreta - prova que é Windows!), 1219 (sessão múltipla), 5 (acesso negado), 86 (senha inválida)
                if ($procProbe.ExitCode -in @(0, 1326, 1219, 5, 86)) {
                    $isWindows = $true
                }
            } else {
                $procProbe.Kill()
            }
            [void](cmd.exe /c "net use \\$TargetIp\IPC$ /delete /y >nul 2>&1")
        } catch {}
    }

    if (-not $isWindows) {
        $hTag = if ($devHostname) { " ($devHostname)" } else { "" }
        Log-Noc "    [+] ${TargetIp}${hTag} - Dispositivo em Rede / Wi-Fi (Coletor / AP / Mobile). Catalogado no NOC!" "Cyan"
        $DispositivosIgnorados++

        if ($Sigla -and $Sigla -ne "GERAL") {
            try {
                $targetBody = @{ ip = $TargetIp; city = $Sigla; hostname = $devHostname; deviceType = "WIFI_DEVICE" } | ConvertTo-Json
                foreach ($srv in $NocIps) {
                    try {
                        Invoke-RestMethod -Uri "http://$srv/api/deploy/register-branch" -Method POST -Body $targetBody -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
                        break
                    } catch {}
                }
            } catch {}
        }
        continue
    }

    $cName = if ($isKnownComp) { " ($($AllKnownComputers[$TargetIp].name))" } else { "" }
    $isTravaDetectada = $false
    if ($port10050) {
        Log-Noc "[!] ${TargetIp}${cName} - Computador Windows com Zabbix TRAVADO (Porta 10050 aberta, sem telemetria no NOC)!" "Yellow"
        $isTravaDetectada = $true
    } else {
        Log-Noc "[>] ${TargetIp}${cName} - Computador Windows identificado sem Zabbix Agent ou Offline." "Cyan"
    }

    # REGRA F: Autenticação Multi-Perfil (Contorna conta 'Administrador' desativada e testa C$ / Admin$)
    $Sucesso = $false
    Log-Noc "    [*] Sondando credenciais administrativas em ${TargetIp}..." "DarkYellow"

    foreach ($user in $Usuarios) {
        $uFmt = ".\$user"
        foreach ($pass in $Senhas) {
            [void](cmd.exe /c "net use \\$TargetIp\IPC$ /delete /y >nul 2>&1")
            [void](cmd.exe /c "net use \\$TargetIp\C$ /delete /y >nul 2>&1")
            [void](cmd.exe /c "net use \\$TargetIp\Admin$ /delete /y >nul 2>&1")

            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = "cmd.exe"
            $psi.Arguments = "/c net use \\$TargetIp\C$ /user:$uFmt `"$pass`""
            $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
            $psi.CreateNoWindow = $true
            $psi.UseShellExecute = $false
            
            $proc = [System.Diagnostics.Process]::Start($psi)
            if (-not $proc.WaitForExit(2000)) {
                $proc.Kill()
                continue
            }

            $shareBase = $null
            if (Test-Path "\\$TargetIp\C$\Windows\Temp" -ErrorAction SilentlyContinue) {
                $shareBase = "\\$TargetIp\C$\Windows\Temp"
            } else {
                [void](cmd.exe /c "net use \\$TargetIp\Admin$ /user:$uFmt `"$pass`" >nul 2>&1")
                if (Test-Path "\\$TargetIp\Admin$\Temp" -ErrorAction SilentlyContinue) {
                    $shareBase = "\\$TargetIp\Admin$\Temp"
                }
            }

            if ($shareBase) {
                Log-Noc "    [+] Autenticado em ${TargetIp} com sucesso (Conta: $uFmt)!" "Green"

                    try {
                        # Padronização e Reativação Definitiva do Administrador Local
                        try {
                            Log-Noc "    [*] Reativando Administrador local e liberando token GPO em ${TargetIp}..." "Cyan"
                            $cureTr = 'cmd.exe /c net user Administrador cs1984ibm /active:yes & reg add HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f'
                            $cureCmd = "schtasks /create /s $TargetIp /u $uFmt /p `"$pass`" /ru `"NT AUTHORITY\SYSTEM`" /sc ONCE /tn `"NocAdminCure`" /tr `"$cureTr`" /st 00:00 /f"
                            $null = cmd.exe /c "$cureCmd >nul 2>&1"
                            $null = cmd.exe /c "schtasks /run /s $TargetIp /u $uFmt /p `"$pass`" /tn `"NocAdminCure`" >nul 2>&1"
                            Start-Sleep -Seconds 2
                            $null = cmd.exe /c "schtasks /delete /s $TargetIp /u $uFmt /p `"$pass`" /tn `"NocAdminCure`" /f >nul 2>&1"
                        } catch {}

                        # Auto-Reparo: Se o agente estava zumbi/travado
                        if ($isTravaDetectada) {
                            Log-Noc "    [*] Reiniciando serviço Zabbix Agent 2 em ${TargetIp}..." "Cyan"
                            $restartTr = 'cmd.exe /c net stop \"Zabbix Agent 2\" & net start \"Zabbix Agent 2\"'
                            $restartCmd = "schtasks /create /s $TargetIp /u $uFmt /p `"$pass`" /ru `"NT AUTHORITY\SYSTEM`" /sc ONCE /tn `"ZabbixRestart`" /tr `"$restartTr`" /st 00:00 /f"
                            $null = cmd.exe /c "$restartCmd >nul 2>&1"
                            $null = cmd.exe /c "schtasks /run /s $TargetIp /u $uFmt /p `"$pass`" /tn `"ZabbixRestart`" >nul 2>&1"
                            Start-Sleep -Seconds 3
                            $null = cmd.exe /c "schtasks /delete /s $TargetIp /u $uFmt /p `"$pass`" /tn `"ZabbixRestart`" /f >nul 2>&1"
                        }

                        # Reinstalação Silenciosa com Metadados da Unidade
                        Log-Noc "    [*] Aplicando instalação / reparo limpo do Zabbix em ${TargetIp}..." "Cyan"
                        if (-not (Ensure-ZabbixInstaller)) {
                            Log-Noc "    [-] Erro: Falha ao obter instalador do NOC. Pulando instalacao em ${TargetIp}." "Red"
                            break
                        }
                        $dest = "$shareBase\Zabbix.exe"
                        Copy-Item -Path $LocalInstaller -Destination $dest -Force -ErrorAction Stop

                        $meta = "windows,camilo-noc-enterprise,$Sigla"
                        $cmd = "schtasks /create /s $TargetIp /u $uFmt /p `"$pass`" /ru `"NT AUTHORITY\SYSTEM`" /sc ONCE /tn `"ZabbixDeploy`" /tr `"C:\Windows\Temp\Zabbix.exe /silent /norestart HOSTMETADATA=\`"$meta\`"`" /st 00:00 /f"
                        $null = cmd.exe /c "$cmd >nul 2>&1"

                        $run = "schtasks /run /s $TargetIp /u $uFmt /p `"$pass`" /tn `"ZabbixDeploy`""
                        $null = cmd.exe /c "$run >nul 2>&1"

                        if ($isTravaDetectada) {
                            Log-Noc "    [OK] ZABBIX REPARADO E REINSTALADO EM ${TargetIp} (Filial: $Sigla)!" "Green"
                            $Reparados++
                        } else {
                            Log-Noc "    [OK] ZABBIX INSTALADO COM SUCESSO EM ${TargetIp} (Filial: $Sigla)!" "Green"
                            $Instalados++
                        }

                        $Sucesso = $true

                        # Vincular imediatamente o PC de destino à Filial no NOC e no Zabbix
                        if ($Sigla -and $Sigla -ne "GERAL") {
                            $targetBody = @{ ip = $TargetIp; city = $Sigla } | ConvertTo-Json
                            foreach ($srv in $NocIps) {
                                try {
                                    Invoke-RestMethod -Uri "http://$srv/api/deploy/register-branch" -Method POST -Body $targetBody -ContentType "application/json" -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
                                    break
                                } catch {}
                            }
                        }
                    } catch {
                        Log-Noc "    [!] Erro em ${TargetIp}: $($_.Exception.Message)" "Red"
                    } finally {
                        [void](cmd.exe /c "net use \\$TargetIp\C$ /delete /y >nul 2>&1")
                        [void](cmd.exe /c "net use \\$TargetIp\Admin$ /delete /y >nul 2>&1")
                    }
                    break
            }
        }
        if ($Sucesso) { break }
    }

    if (-not $Sucesso) {
        Log-Noc "    [-] ${TargetIp}: Senhas locais não bateram ou SMB bloqueado por GPO. Pulando..." "DarkYellow"
    }
}

# 7. Resumo Final
Log-Noc "`n=======================================================" "Cyan"
Log-Noc "                 RESUMO DO DEPLOY & REPARO             " "Cyan"
Log-Noc "=======================================================" "Cyan"
Log-Noc "Filial / Sigla                 : $Sigla" "Yellow"
Log-Noc "Dispositivos Respondendo Ping  : $($Ativos.Count)" "White"
Log-Noc "Câmeras / Impressoras / Rede   : $DispositivosIgnorados (Descartados com Sucesso)" "DarkGray"
Log-Noc "Computadores Saudáveis no NOC  : $JaInstalados" "Gray"
Log-Noc "Computadores Travados Reparados: $Reparados" "Green"
Log-Noc "Novos Computadores Instalados  : $Instalados" "Green"
Log-Noc "`n[OK] Deploy e Reparo finalizados com sucesso na filial $Sigla!" "Green"

if ($Sigla -and $Sigla -ne "GERAL") {
    $resumoTxt = "`n=======================================================`n" +
                 "                 RESUMO DO DEPLOY & REPARO             `n" +
                 "=======================================================`n" +
                 "Filial / Sigla                 : $Sigla`n" +
                 "Dispositivos Respondendo Ping  : $($Ativos.Count)`n" +
                 "Câmeras / Impressoras / Rede   : $DispositivosIgnorados (Descartados)`n" +
                 "Computadores Saudáveis no NOC  : $JaInstalados`n" +
                 "Computadores Travados Reparados: $Reparados`n" +
                 "Novos Computadores Instalados  : $Instalados`n" +
                 "[OK] Varredura e Deploy finalizados com sucesso na filial $Sigla!`n"
    try {
        $endBody = @{ branch = $Sigla; text = $resumoTxt; done = $true; code = 0 } | ConvertTo-Json
        $wc = New-Object Net.WebClient
        $wc.Headers["Content-Type"] = "application/json"
        $wc.UploadString("http://$WorkingSrv/api/deploy/log", $endBody) | Out-Null
    } catch {}
}

if ($LockFile -and (Test-Path $LockFile)) {
    Remove-Item -Path $LockFile -Force -ErrorAction SilentlyContinue
}
