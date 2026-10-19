# Auto-PrinterTelemetry.ps1 - NOC Camilo dos Santos (Enterprise Telemetry Engine)
$ErrorActionPreference = "SilentlyContinue"
[System.Net.WebRequest]::DefaultWebProxy = New-Object System.Net.WebProxy

# Auto-Update Periodico do Script (se o arquivo em disco tiver mais de 2 horas)
try {
    $scriptPath = $MyInvocation.MyCommand.Path
    if ($scriptPath -and (Test-Path $scriptPath)) {
        $ageHours = ((Get-Date) - (Get-Item $scriptPath).LastWriteTime).TotalHours
        if ($ageHours -ge 0.05) { # Auto-update dinâmico e veloz para todas as filiais
            $epUpdate = if (Test-Connection -ComputerName 192.168.100.222 -Count 1 -Quiet -ErrorAction SilentlyContinue) { "http://192.168.100.222:4002" } else { "http://rcsfti.ddns.net:4002" }
            $tmpUpdate = "$scriptPath.tmp"
            (New-Object Net.WebClient).DownloadFile("$epUpdate/Auto-PrinterTelemetry.ps1", $tmpUpdate)
            if ((Test-Path $tmpUpdate) -and (Get-Item $tmpUpdate).Length -gt 5000) {
                Move-Item -Path $tmpUpdate -Destination $scriptPath -Force
            }
        }
    }
} catch {}

# NOC Express Pulse - Deteccao e Disparo Remoto de Varredura/Deploy de Filiais
try {
    $epPulse = if (Test-Connection -ComputerName 192.168.100.222 -Count 1 -Quiet -ErrorAction SilentlyContinue) { "http://192.168.100.222:4002" } else { "http://rcsfti.ddns.net:4002" }
    $tCheck = Invoke-RestMethod -Uri "$epPulse/api/deploy/task-check?host=$env:COMPUTERNAME" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($tCheck -and $tCheck.hasTask -and $tCheck.branch) {
        $taskBranch = $tCheck.branch
        $lockFile = Join-Path $env:TEMP "noc_deploy_${taskBranch}.lock"
        $canRun = $true
        if (Test-Path $lockFile) {
            $lockAge = (Get-Date) - (Get-Item $lockFile).LastWriteTime
            if ($lockAge.TotalMinutes -ge 2) {
                Remove-Item -Path $lockFile -Force -ErrorAction SilentlyContinue
            } else {
                $canRun = $false
            }
        }
        if ($canRun) {
            $deployScript = Join-Path $env:TEMP "deploy-zabbix.ps1"
            try {
                (New-Object Net.WebClient).DownloadFile("$epPulse/deploy-zabbix.ps1", $deployScript)
            } catch {
                Invoke-WebRequest -Uri "$epPulse/deploy-zabbix.ps1" -OutFile $deployScript -UseBasicParsing -TimeoutSec 25 -ErrorAction SilentlyContinue
            }
            if ((Test-Path $deployScript) -and ((Get-Item $deployScript).Length -gt 5000)) {
                Start-Process powershell.exe -ArgumentList "-ExecutionPolicy Bypass -File `"$deployScript`" -Sigla $taskBranch -Silent" -WindowStyle Hidden
            }
        }
    }
} catch {}


$ignoreKeywords = @("Microsoft Print to PDF", "Microsoft XPS Document Writer", "Fax", "OneNote", "Send to OneNote", "AnyDesk", "PDF24", "CutePDF", "Adobe PDF", "4BARCODE", "Software Printer", "Root Print Queue")

# Telemetria 100% Passiva e Segura: WMI, Registro do Windows e SNMP (Sem envio de documentos para spooler)
# 1. Coleta impressoras do Windows (Spooler + Registro HKLM + PnP USB)
$printersList = [System.Collections.Generic.List[PSObject]]::new()
try {
    $gp = Get-Printer -ErrorAction SilentlyContinue
    if ($gp) { foreach ($p in $gp) { $printersList.Add($p) } }
} catch {}

if ($printersList.Count -eq 0) {
    try {
        $cp = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue
        if ($cp) { foreach ($p in $cp) { $printersList.Add($p) } }
    } catch {}
}

# Complementa com Registro HKLM (caso rodando como LOCAL SYSTEM)
try {
    $regPrinters = Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Control\Print\Printers" -ErrorAction SilentlyContinue
    foreach ($rp in $regPrinters) {
        $rName = $rp.PSChildName
        $exists = $false
        foreach ($p in $printersList) {
            if ($p.Name -eq $rName) { $exists = $true; break }
        }
        if (-not $exists) {
            $prop = Get-ItemProperty $rp.PSPath -ErrorAction SilentlyContinue
            $printersList.Add([PSCustomObject]@{
                Name          = $rName
                PortName      = $prop.Port
                DriverName    = $prop."Printer Driver"
                PrinterStatus = 3
            })
        }
    }
} catch {}

# Complementa com PnP USB Devices (Win32_PnPEntity / usbprint)
try {
    $usbPnpPrinters = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { 
        $_.Service -eq 'usbprint' -or ($_.PNPClass -eq 'Printer' -and $_.Present -eq $true)
    }
    foreach ($up in $usbPnpPrinters) {
        $pnpName = $up.Name
        if (-not $pnpName) { continue }
        $exists = $false
        foreach ($p in $printersList) {
            if ($p.Name -eq $pnpName -or ($p.PortName -and $p.PortName -like "*USB*")) {
                $exists = $true
                break
            }
        }
        if (-not $exists) {
            $printersList.Add([PSCustomObject]@{
                Name          = $pnpName
                PortName      = "USB"
                DriverName    = $pnpName
                PrinterStatus = if ($up.Status -eq "OK") { 3 } else { 7 }
            })
        }
    }
} catch {}

$results = @()

foreach ($p in $printersList) {
    $pName = $p.Name
    $dName = $p.DriverName
    
    $shouldIgnore = $false
    foreach ($kw in $ignoreKeywords) {
        if ($pName -like "*$kw*" -or $dName -like "*$kw*") {
            $shouldIgnore = $true
            break
        }
    }
    if ($shouldIgnore) { continue }

    $port = $p.PortName
    $serial = "N/D"
    $counter = 0
    $tonerLevel = $null
    $scanCount = 0
    $type = "USB"
    $category = "PRINTER"
    $isOnline = if ($p.PrinterStatus -eq "WorkOffline" -or $p.PrinterStatus -eq 7) { $false } else { $true }

    # 1. TRATAMENTO USB
    if ($port -like "*USB*" -or $port -like "*DOT4*" -or $port -like "*LPT*" -or $port -eq "USB") {
        $type = "USB"

        # 1.1 Busca precisa no USBPRINT (filtrando Device Parameters / PortName)
        if ($serial -eq "N/D" -or $serial -eq "Properties") {
            try {
                $usbPrintKeys = Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Enum\USBPRINT" -ErrorAction SilentlyContinue
                foreach ($devKey in $usbPrintKeys) {
                    $subKeys = Get-ChildItem $devKey.PSPath -ErrorAction SilentlyContinue
                    foreach ($instKey in $subKeys) {
                        $instName = $instKey.PSChildName
                        if ($instName -in @("Properties", "Control", "Device Parameters", "LogConf")) { continue }

                        $prop = Get-ItemProperty $instKey.PSPath -ErrorAction SilentlyContinue
                        $param = Get-ItemProperty "$($instKey.PSPath)\Device Parameters" -ErrorAction SilentlyContinue
                        
                        $isPortMatch = ($param.PortName -eq $port) -or ($instName -like "*$port*") -or ($port -eq "USB")

                        $ieee = $prop."1284_Device_ID"
                        if (-not $ieee) { $ieee = $prop.IEEE1284_id }
                        if ($ieee -match '(?:SERN|SN|SERIAL)[:=]\s*([A-Za-z0-9\-_]{6,30})') {
                            $foundSn = $Matches[1].Trim()
                            if ($foundSn -notmatch '^(Properties|Control|DEFAULT)') {
                                $serial = $foundSn
                                break
                            }
                        }

                        if ($prop.SerialNumber -and $prop.SerialNumber -match '^[A-Za-z0-9\-_]{6,30}$' -and $prop.SerialNumber -notmatch '^(Properties|Control|DEFAULT)') {
                            $serial = $prop.SerialNumber
                            break
                        }

                        $cleanInst = $instName -replace '&[0-9]+$', ''
                        if ($isPortMatch -and $cleanInst -match '^[A-Za-z0-9\-_]{6,30}$' -and $cleanInst -notmatch '^(Properties|Control|7&)') {
                            $serial = $cleanInst
                            break
                        }
                    }
                    if ($serial -ne "N/D" -and $serial -ne "Properties") { break }
                }
            } catch {}
        }

        # 1.1.2 Busca direta nos barramentos USB dos fabricantes (Samsung VID_04E8, Zebra VID_0A5F, Elgin VID_0D3A)
        if ($serial -eq "N/D" -or $serial -eq "Properties") {
            try {
                $targetVids = @()
                if ($pName -like "*Samsung*" -or $dName -like "*Samsung*") { $targetVids += "VID_04E8" }
                if ($pName -like "*Zebra*" -or $dName -like "*Zebra*") { $targetVids += "VID_0A5F" }
                if ($pName -like "*Elgin*" -or $dName -like "*Elgin*") { $targetVids += "VID_0D3A", "VID_1FC9" }

                foreach ($vid in $targetVids) {
                    $usbDevs = Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Enum\USB" -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like "*$vid*" }
                    foreach ($udev in $usbDevs) {
                        $instances = Get-ChildItem $udev.PSPath -ErrorAction SilentlyContinue
                        foreach ($inst in $instances) {
                            $snCandidate = $inst.PSChildName
                            if ($snCandidate -and $snCandidate -notmatch '^(Properties|Control|Device Parameters|7&)' -and $snCandidate -match '^[A-Za-z0-9\-_]{6,30}$') {
                                $serial = $snCandidate
                                break
                            }
                        }
                        if ($serial -ne "N/D" -and $serial -ne "Properties") { break }
                    }
                    if ($serial -ne "N/D" -and $serial -ne "Properties") { break }
                }
            } catch {}
        }

        # 1.2 Coleta Odometro USB - Camada 1: Registro do Spooler / Driver Samsung
        try {
            $regPaths = @(
                "HKLM:\SYSTEM\CurrentControlSet\Control\Print\Printers\$pName\PrinterDriverData",
                "HKLM:\SYSTEM\CurrentControlSet\Control\Print\Printers\$pName\SECDriverData",
                "HKLM:\SYSTEM\CurrentControlSet\Control\Print\Printers\$pName\DsDriver",
                "HKLM:\SOFTWARE\Samsung\Printer\$pName",
                "HKLM:\SOFTWARE\WOW6432Node\Samsung\Printer\$pName"
            )
            foreach ($rp in $regPaths) {
                if (Test-Path $rp) {
                    $pData = Get-ItemProperty $rp -ErrorAction SilentlyContinue
                    if ($pData) {
                        foreach ($propName in @("TotalPageCount", "PageCount", "LifeCount", "Counter", "PrintCounter", "TotalCount", "TotalPagesPrinted", "Total_Page_Count", "Impressora_Total")) {
                            if ($pData.$propName -and [int]$pData.$propName -gt 0) {
                                $counter = [int]$pData.$propName
                                break
                            }
                        }
                        if ($serial -eq "N/D" -or $serial -eq "Properties") {
                            foreach ($sName in @("SerialNo", "SerialNumber", "PrinterSerial", "HardwareID", "PrinterSerialNumber")) {
                                if ($pData.$sName -and $pData.$sName.ToString().Length -ge 6 -and $pData.$sName.ToString() -ne "Properties") {
                                    $serial = $pData.$sName.ToString().Trim()
                                    break
                                }
                            }
                        }
                    }
                }
                if ($counter -gt 0) { break }
            }
        } catch {}

        # 1.3 Coleta Odometro USB - Camada 2: Arquivos de Configuracao/Cache do Samsung Easy Printer Manager
        if ($counter -eq 0 -or $serial -eq "N/D" -or $serial -eq "Properties") {
            try {
                $epmPaths = @(
                    "C:\ProgramData\Samsung\EasyPrinterManager",
                    "C:\ProgramData\Samsung Electronics\EasyPrinterManager",
                    "C:\ProgramData\Samsung\Printer",
                    "C:\ProgramData\Samsung Electronics\Printer"
                )
                foreach ($ep in $epmPaths) {
                    if (Test-Path $ep) {
                        $cfgFiles = Get-ChildItem -Path $ep -Include "*.xml", "*.ini", "*.dat", "*.db" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 15
                        foreach ($cf in $cfgFiles) {
                            $content = Get-Content $cf.FullName -Raw -ErrorAction SilentlyContinue
                            if ($counter -eq 0 -and $content -match '(?:TotalPageCount|PageCount|TotalPage|Impressora_Total|PagesPrinted|PrintCount)[>=:\s]+(\d{1,8})') {
                                $counter = [int]$Matches[1]
                            }
                            if (($serial -eq "N/D" -or $serial -eq "Properties") -and $content -match '(?:SerialNo|SerialNumber|PrinterSerial|DeviceSerial)[>=:\s]+([A-Za-z0-9\-_]{6,30})') {
                                $snFound = $Matches[1].Trim()
                                if ($snFound -notmatch '^(Properties|Control|DEFAULT|0000)') {
                                    $serial = $snFound
                                }
                            }
                        }
                    }
                    if ($counter -gt 0 -and $serial -ne "N/D" -and $serial -ne "Properties") { break }
                }
            } catch {}
        }

        # 1.4 Coleta Odometro USB - Camada 3: Performance Counter WMI da Fila do Spooler
        # REGRA CRÍTICA: TotalPagesPrinted do spooler do Windows é um contador volátil de sessão (reseta com reboot/restart do spooler)!
        # Para impressoras laser/MFP corporativas (Samsung SCX, MultiXpress, Brother, etc.), ele NUNCA deve ser usado como odômetro físico.
        # Ele é permitido APENAS como fallback para impressoras térmicas de etiquetas (Zebra/ZDesigner) que não expõem odômetro de hardware.
        $isThermalOrLabel = ($pName -match "zebra|zdesigner|etiqueta|thermal|datamax|elgin|argox")
        if ($counter -eq 0 -and $isThermalOrLabel) {
            try {
                $perf = Get-CimInstance Win32_PerfFormattedData_Spooler_PrintQueue -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $pName -or $_.Name -like "*$port*" }
                if ($perf -and $perf.TotalPagesPrinted -gt 0) {
                    $counter = [int]$perf.TotalPagesPrinted
                }
            } catch {}
        }

        # 1.5 Coleta Odometro USB - Camada 4: Event Log do Spooler (Microsoft-Windows-PrintService/Operational ID 307)
        if ($counter -eq 0 -and $isThermalOrLabel) {
            try {
                $events = Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PrintService/Operational'; ID=307} -MaxEvents 500 -ErrorAction SilentlyContinue
                $sum = 0
                foreach ($ev in $events) {
                    $xml = [xml]$ev.ToXml()
                    if ($xml.Event.UserData.DocumentPrinted.param5 -eq $pName) {
                        $sum += [int]$xml.Event.UserData.DocumentPrinted.param8
                    }
                }
                if ($sum -gt 0) { $counter = $sum }
            } catch {}
        }
    }
    # 2. TRATAMENTO WSD E REDE
    else {
        $type = "NETWORK"
        $resolvedIp = $null

        # 2.1 Extrai IP direto se a porta for TCP/IP numerico ou se o nome contiver IP
        if ($port -match '(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})') {
            $resolvedIp = $Matches[1]
        } elseif ($pName -match '(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})') {
            $resolvedIp = $Matches[1]
        }
        # 2.2 Se for WSD, resolve o IP da impressora pelo hostname ou registro de portas
        elseif ($port -like "*WSD*") {
            try {
                $cleanHost = $pName -replace '\s*\(.*?\)', '' -replace '[^A-Za-z0-9\-_]', ''
                if ($cleanHost -match '^[A-Za-z0-9\-_]{4,}$') {
                    $dns = [System.Net.Dns]::GetHostAddresses($cleanHost) | Where-Object { $_.AddressFamily -eq 'InterNetwork' }
                    if ($dns) { $resolvedIp = $dns[0].IPAddressToString }
                }
            } catch {}

            if (-not $resolvedIp) {
                try {
                    $wsdReg = Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors\WSD Port" -Recurse -ErrorAction SilentlyContinue
                    foreach ($wr in $wsdReg) {
                        $props = Get-ItemProperty $wr.PSPath -ErrorAction SilentlyContinue
                        foreach ($val in $props.PSObject.Properties) {
                            if ($val.Value -match '(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})') {
                                $candidate = $Matches[1]
                                if ($candidate -ne '127.0.0.1' -and $candidate -ne '0.0.0.0') {
                                    $resolvedIp = $candidate
                                    break
                                }
                            }
                        }
                        if ($resolvedIp) { break }
                    }
                } catch {}
            }
        }

        # 2.3 Consulta Odometro, Serial e Toner via sockets SNMP UDP 161 com timeout resiliente
        $snmpSuccess = $false
        if ($resolvedIp) {
            # 2.3.1 Serial Number via RFC 3805 (prtGeneralSerialNumber.1) e MIBs de Fabricantes
            try {
                $u1 = New-Object System.Net.Sockets.UdpClient
                $u1.Connect($resolvedIp, 161)
                $u1.Client.ReceiveTimeout = 600
                
                # Standard Printer-MIB RFC 3805: 1.3.6.1.2.1.43.5.1.1.17.1
                $pkt_sn1 = [byte[]]@(0x30, 0x2c, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa0, 0x1f, 0x02, 0x04, 0x00, 0x00, 0x00, 0x01, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00, 0x30, 0x11, 0x30, 0x0f, 0x06, 0x0b, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x2b, 0x05, 0x01, 0x01, 0x11, 0x01, 0x05, 0x00)
                $u1.Send($pkt_sn1, $pkt_sn1.Length) | Out-Null
                $ep1 = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                $recv1 = $u1.Receive([ref]$ep1)
                $u1.Close()
                
                if ($recv1 -and $recv1.Length -gt 15) {
                    for ($i = 15; $i -lt $recv1.Length - 5; $i++) {
                        if ($recv1[$i] -eq 0x04) { # ASN.1 OCTET STRING
                            $sLen = [int]$recv1[$i + 1]
                            if ($sLen -ge 6 -and $sLen -le 35 -and ($i + 2 + $sLen) -le $recv1.Length) {
                                $candidate = [System.Text.Encoding]::ASCII.GetString($recv1, $i + 2, $sLen).Trim()
                                if ($candidate -ne 'public' -and $candidate -match '^[A-Za-z0-9\-_]{6,35}$' -and $candidate -notmatch '^(0000|1111|DEFAULT|Properties|Control)') {
                                    $serial = $candidate
                                    $snmpSuccess = $true
                                    break
                                }
                            }
                        }
                    }
                }
            } catch {}

            # 2.3.1b Fallback Samsung MIB: 1.3.6.1.4.1.236.11.5.1.1.1.4.0 se ainda não identificado
            if ($serial -eq "N/D" -or -not $serial -or $serial -eq "Não identificado") {
                try {
                    $u1b = New-Object System.Net.Sockets.UdpClient
                    $u1b.Connect($resolvedIp, 161)
                    $u1b.Client.ReceiveTimeout = 600
                    $pkt_samsung = [byte[]]@(0x30, 0x2f, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa0, 0x22, 0x02, 0x04, 0x00, 0x00, 0x00, 0x01, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00, 0x30, 0x14, 0x30, 0x12, 0x06, 0x0e, 0x2b, 0x06, 0x01, 0x04, 0x01, 0x81, 0x6c, 0x0b, 0x05, 0x01, 0x01, 0x01, 0x04, 0x00, 0x05, 0x00)
                    $u1b.Send($pkt_samsung, $pkt_samsung.Length) | Out-Null
                    $ep1b = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                    $recv1b = $u1b.Receive([ref]$ep1b)
                    $u1b.Close()
                    
                    if ($recv1b -and $recv1b.Length -gt 15) {
                        for ($i = 15; $i -lt $recv1b.Length - 5; $i++) {
                            if ($recv1b[$i] -eq 0x04) {
                                $sLen = [int]$recv1b[$i + 1]
                                if ($sLen -ge 6 -and $sLen -le 35 -and ($i + 2 + $sLen) -le $recv1b.Length) {
                                    $candidate = [System.Text.Encoding]::ASCII.GetString($recv1b, $i + 2, $sLen).Trim()
                                    if ($candidate -ne 'public' -and $candidate -match '^[A-Za-z0-9\-_]{6,35}$' -and $candidate -notmatch '^(0000|1111|DEFAULT|Properties|Control)') {
                                        $serial = $candidate
                                        $snmpSuccess = $true
                                        break
                                    }
                                }
                            }
                        }
                    }
                } catch {}
            }

            # 2.3.1c Fallback sysDescr: 1.3.6.1.2.1.1.1.0 (contém ';S/N <serial>' em 100% dos modelos Samsung)
            if ($serial -eq "N/D" -or -not $serial -or $serial -eq "Não identificado") {
                try {
                    $u1c = New-Object System.Net.Sockets.UdpClient
                    $u1c.Connect($resolvedIp, 161)
                    $u1c.Client.ReceiveTimeout = 1200
                    # sysDescr: 1.3.6.1.2.1.1.1.0
                    $pkt_descr = [byte[]]@(0x30, 0x29, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa0, 0x1c, 0x02, 0x04, 0x00, 0x00, 0x00, 0x01, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00, 0x30, 0x0e, 0x30, 0x0c, 0x06, 0x08, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00, 0x05, 0x00)
                    $u1c.Send($pkt_descr, $pkt_descr.Length) | Out-Null
                    $ep1c = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                    $recv1c = $u1c.Receive([ref]$ep1c)
                    $u1c.Close()
                    
                    if ($recv1c -and $recv1c.Length -gt 15) {
                        $descrText = [System.Text.Encoding]::ASCII.GetString($recv1c)
                        if ($descrText -match '(?:\bS/N\b|\bSN\b|\bSerial\b)[\s:=]*([A-Za-z0-9\-_]{6,35})') {
                            $serial = $matches[1].Trim()
                            $snmpSuccess = $true
                        }
                    }
                } catch {}
            }

            # 2.3.2 Odômetro mecânico de páginas (prtMarkerLifeCount)
            try {
                $u2 = New-Object System.Net.Sockets.UdpClient
                $u2.Connect($resolvedIp, 161)
                $u2.Client.ReceiveTimeout = 1200
                $pkt2 = [byte[]]@(0x30, 0x2d, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa0, 0x20, 0x02, 0x04, 0x00, 0x00, 0x00, 0x01, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00, 0x30, 0x12, 0x30, 0x10, 0x06, 0x0c, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x2b, 0x0a, 0x02, 0x01, 0x04, 0x01, 0x01, 0x05, 0x00)
                $u2.Send($pkt2, $pkt2.Length) | Out-Null
                $ep2 = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                $recv2 = $u2.Receive([ref]$ep2)
                $u2.Close()
                $l2 = $recv2.Length
                if ($l2 -gt 5) {
                    for ($idx = $l2 - 2; $idx -ge 15; $idx--) {
                        if ($recv2[$idx] -in @(0x41, 0x42, 0x02)) {
                            $vLen = [int]$recv2[$idx + 1]
                            if ($vLen -ge 1 -and $vLen -le 4 -and ($idx + 1 + $vLen) -eq ($l2 - 1)) {
                                $parsedVal = 0
                                for ($k = 0; $k -lt $vLen; $k++) {
                                    $parsedVal = ($parsedVal * 256) + [int]$recv2[$idx + 2 + $k]
                                }
                                if ($parsedVal -gt 0) {
                                    $counter = $parsedVal
                                    $snmpSuccess = $true
                                }
                                break
                            }
                        }
                    }
                }
            } catch {}

            # 2.3.3 Nível de Toner via Printer-MIB (prtMarkerSuppliesLevel e MaxCapacity)
            try {
                $u3 = New-Object System.Net.Sockets.UdpClient
                $u3.Connect($resolvedIp, 161)
                $u3.Client.ReceiveTimeout = 1200
                $pkt_toner = [byte[]]@(0x30, 0x2d, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa0, 0x20, 0x02, 0x04, 0x00, 0x00, 0x00, 0x01, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00, 0x30, 0x12, 0x30, 0x10, 0x06, 0x0c, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x2b, 0x0b, 0x01, 0x01, 0x09, 0x01, 0x01, 0x05, 0x00)
                $u3.Send($pkt_toner, $pkt_toner.Length) | Out-Null
                $ep3 = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                $recv3 = $u3.Receive([ref]$ep3)
                $u3.Close()

                $tVal = $null
                if ($recv3 -and $recv3.Length -gt 15) {
                    $l3 = $recv3.Length
                    for ($idx = $l3 - 2; $idx -ge 15; $idx--) {
                        if ($recv3[$idx] -eq 0x02) {
                            $vLen = [int]$recv3[$idx + 1]
                            if ($vLen -ge 1 -and $vLen -le 4 -and ($idx + 1 + $vLen) -eq ($l3 - 1)) {
                                $rawVal = 0
                                $isNeg = ($recv3[$idx + 2] -ge 0x80)
                                for ($k = 0; $k -lt $vLen; $k++) {
                                    $rawVal = ($rawVal * 256) + [int]$recv3[$idx + 2 + $k]
                                }
                                if ($isNeg) {
                                    $rawVal = $rawVal - [Math]::Pow(2, $vLen * 8)
                                }
                                $tVal = $rawVal
                                break
                            }
                        }
                    }
                }

                if ($tVal -ne $null) {
                    if ($tVal -eq -3) {
                        $tonerLevel = 80 # someRemaining
                    } elseif ($tVal -ge 0) {
                        $maxCap = 100
                        try {
                            $u4 = New-Object System.Net.Sockets.UdpClient
                            $u4.Connect($resolvedIp, 161)
                            $u4.Client.ReceiveTimeout = 400
                            $pkt_max = [byte[]]@(0x30, 0x2d, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa0, 0x20, 0x02, 0x04, 0x00, 0x00, 0x00, 0x01, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00, 0x30, 0x12, 0x30, 0x10, 0x06, 0x0c, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x2b, 0x0b, 0x01, 0x01, 0x08, 0x01, 0x01, 0x05, 0x00)
                            $u4.Send($pkt_max, $pkt_max.Length) | Out-Null
                            $ep4 = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                            $recv4 = $u4.Receive([ref]$ep4)
                            $u4.Close()
                            if ($recv4 -and $recv4.Length -gt 15) {
                                $l4 = $recv4.Length
                                for ($idx = $l4 - 2; $idx -ge 15; $idx--) {
                                    if ($recv4[$idx] -eq 0x02) {
                                        $vLen = [int]$recv4[$idx + 1]
                                        if ($vLen -ge 1 -and $vLen -le 4 -and ($idx + 1 + $vLen) -eq ($l4 - 1)) {
                                            $parsedMax = 0
                                            for ($k = 0; $k -lt $vLen; $k++) {
                                                $parsedMax = ($parsedMax * 256) + [int]$recv4[$idx + 2 + $k]
                                            }
                                            if ($parsedMax -gt 0) { $maxCap = $parsedMax }
                                            break
                                        }
                                    }
                                }
                            }
                        } catch {}

                        if ($maxCap -gt 0 -and $maxCap -ne 100) {
                            $tonerLevel = [Math]::Round(($tVal / $maxCap) * 100)
                        } else {
                            $tonerLevel = [Math]::Min(100, [Math]::Max(0, [int]$tVal))
                        }
                    }
                }
            } catch {}

            # Fallback 3: Interface Web HTTP (Porta 80)
            if (-not $serial -or $serial -eq 'N/D' -or $serial -eq 'Não identificado') {
                try {
                    $httpReq = [System.Net.WebRequest]::Create("http://$resolvedIp")
                    $httpReq.Timeout = 800
                    $httpResp = $httpReq.GetResponse()
                    $sr = New-Object System.IO.StreamReader($httpResp.GetResponseStream())
                    $html = $sr.ReadToEnd()
                    $sr.Close()
                    $httpResp.Close()
                    if ($html -match '(?:serialNumber|serial_number|serialNumberVal|Serial Number|Número de Série|m_serialNumber)[":=\s]+([A-Za-z0-9]{8,25})') {
                        $candidateSn = $Matches[1].Trim()
                        if ($candidateSn -notmatch '^(Properties|Control|DEFAULT|0000)') {
                            $serial = $candidateSn
                        }
                    }
                } catch {}
            }
        }
        $isOnline = if ($resolvedIp) { ($snmpSuccess -or $counter -gt 0) } else { $isOnline }
    }

    # 3. IDENTIFICACAO DE CATEGORIA (TERMICA / SCANNER)
    $upperP = ($pName + " " + $dName).ToUpper()
    $isScannerDev = $upperP.Contains("SCAN") -or $upperP.Contains("FUJITSU") -or $upperP.Contains("SCANSNAP") -or $upperP.Contains("IMAGEFORMULA") -or ($upperP.Contains("EPSON") -and ($upperP.Contains("DS-") -or $upperP.Contains("WORKFORCE DS") -or $upperP.Contains("PERFECTION") -or $upperP.Contains("ES-") -or $upperP.Contains("GT-")))
    $isThermalDev = $upperP.Contains("ZEBRA") -or $upperP.Contains("ZDESIGNER") -or $upperP.Contains("ELGIN") -or $upperP.Contains("L42") -or $upperP.Contains("ARGOX") -or $upperP.Contains("OS-214") -or $upperP.Contains("DATAMAX") -or $upperP.Contains("BEMATECH") -or $upperP.Contains("MP-4200") -or ($upperP.Contains("EPSON") -and ($upperP.Contains("TM-T") -or $upperP.Contains("TM-U"))) -or $upperP.Contains("ZPL") -or $upperP.Contains("EPL") -or $upperP.Contains("THERMAL") -or $upperP.Contains("TERMICA") -or $upperP.Contains("ETIQUETA")

    if ($isScannerDev) {
        $category = "SCANNER"
        $scanCount = $counter
    } elseif ($isThermalDev) {
        $category = "LABEL_PRINTER"
    }

    $results += [PSCustomObject]@{
        name           = $pName
        port           = $port
        type           = $type
        deviceCategory = $category
        serialNumber   = $serial
        tonerLevel     = $tonerLevel
        pageCount      = $counter
        scanCount      = $scanCount
        status         = if ($isOnline) { "online" } else { "offline" }
    }
}

# 4. DESCOBERTA DE SCANNERS DEDICADOS VIA PNP (Win32_PnPEntity) & WIA
try {
    $pnpScanners = Get-CimInstance Win32_PnPEntity -Filter "PNPClass = 'Image'" -ErrorAction SilentlyContinue
    if (-not $pnpScanners) {
        $pnpScanners = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.ClassGuid -eq '{6bdd1fc6-810f-11d0-bec7-08002be2092f}' -or $_.Service -eq 'usbscan' }
    }

    $cameraExcludes = @("camera", "webcam", "integrated", "virtual", "obs", "video", "face", "droidcam", "iris", "universal scan", "scan driver", "twain")

    foreach ($sc in $pnpScanners) {
        $scName = $sc.Name
        if (-not $scName) { continue }
        $scUpper = $scName.ToUpper()

        $isIgnored = $false
        foreach ($cex in $cameraExcludes) {
            if ($scUpper.Contains($cex.ToUpper())) {
                $isIgnored = $true
                break
            }
        }
        if ($isIgnored) { continue }

        $alreadyIncluded = $false
        foreach ($r in $results) {
            $cleanR = ($r.name -replace '\s*\(.*?\)', '').Trim()
            $cleanSc = ($scName -replace '\s*\(.*?\)', '').Trim()
            if ($r.name -eq $scName -or ($cleanR -and $cleanSc -and ($cleanR -like "*$cleanSc*" -or $cleanSc -like "*$cleanR*")) -or ($sc.DeviceID -and $r.serialNumber -and $sc.DeviceID -like "*$($r.serialNumber)*") -or ($r.deviceCategory -eq "SCANNER" -and $cleanSc -like "*DS-790*")) {
                $alreadyIncluded = $true
                $r | Add-Member -NotePropertyName "hasScanner" -NotePropertyValue $true -Force
                break
            }
        }
        if ($alreadyIncluded) { continue }

        $scSerial = "N/D"
        if ($sc.DeviceID -match 'USB\\[^\\]+\\([A-Za-z0-9\-_]{6,30})') {
            $candidateSn = $Matches[1]
            if ($candidateSn -notmatch '^(0000|1111|DEFAULT|Properties|Control)') {
                $scSerial = $candidateSn
            }
        }

        $scStatus = if ($sc.Status -eq "OK" -or $sc.Present -eq $true) { "online" } else { "offline" }

        $results += [PSCustomObject]@{
            name           = $scName
            port           = "USB (WIA/PnP)"
            type           = "USB"
            deviceCategory = "SCANNER"
            serialNumber   = $scSerial
            pageCount      = 0
            scanCount      = 0
            status         = $scStatus
        }
    }
} catch {}

try {
    $dm = New-Object -ComObject WIA.DeviceManager -ErrorAction SilentlyContinue
    if ($dm -and $dm.DeviceInfos) {
        foreach ($devInfo in $dm.DeviceInfos) {
            if ($devInfo.Type -eq 1) {
                $wName = $devInfo.Properties["Name"].Value
                if ($wName) {
                    $wUpper = $wName.ToUpper()
                    $isWIgnored = $false
                    foreach ($cex in @("camera", "webcam", "universal scan", "scan driver", "twain")) {
                        if ($wUpper.Contains($cex.ToUpper())) {
                            $isWIgnored = $true
                            break
                        }
                    }
                    if ($isWIgnored) { continue }

                    $wAlready = $false
                    foreach ($r in $results) {
                        $cleanR = ($r.name -replace '\s*\(.*?\)', '').Trim()
                        $cleanW = ($wName -replace '\s*\(.*?\)', '').Trim()
                        if ($r.name -eq $wName -or ($cleanR -and $cleanW -and ($cleanR -like "*$cleanW*" -or $cleanW -like "*$cleanR*")) -or ($r.deviceCategory -eq "SCANNER")) {
                            $wAlready = $true
                            $r | Add-Member -NotePropertyName "hasScanner" -NotePropertyValue $true -Force
                            break
                        }
                    }
                    if (-not $wAlready) {
                        $results += [PSCustomObject]@{
                            name           = $wName
                            port           = "WIA / USB"
                            type           = "USB"
                            deviceCategory = "SCANNER"
                            serialNumber   = "N/D"
                            pageCount      = 0
                            scanCount      = 0
                            status         = "online"
                        }
                    }
                }
            }
        }
    }
} catch {}

if ($results.Count -eq 0) {
    Write-Output "[]"
} else {
    $results | ConvertTo-Json -Compress
}