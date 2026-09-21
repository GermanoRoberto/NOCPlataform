# Auto-PrinterTelemetry.ps1 - NOC Camilo dos Santos (Enterprise Telemetry Engine)
$ErrorActionPreference = "SilentlyContinue"

$ignoreKeywords = @("Microsoft Print to PDF", "Microsoft XPS Document Writer", "Fax", "OneNote", "Send to OneNote", "AnyDesk", "PDF24", "CutePDF", "Adobe PDF", "4BARCODE", "Software Printer", "Root Print Queue")

# Compilacao segura da engine PJL/ZPL WinSpool nativa (DOC_INFO_1 Unicode P/Invoke)
if (-not ([System.Management.Automation.PSTypeName]'WinSpoolPJL').Type) {
    try {
        Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

public class WinSpoolPJL {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOC_INFO_1 {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern uint StartDocPrinter(IntPtr hPrinter, int level, [In] DOC_INFO_1 di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    [DllImport("winspool.drv", EntryPoint = "ReadPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ReadPrinter(IntPtr hPrinter, IntPtr pBuf, int cbBuf, out int pNoBytesRead);

    public static string QueryPjl(string printerName, string cmd) {
        IntPtr hPrinter = IntPtr.Zero;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return "";

        try {
            DOC_INFO_1 di = new DOC_INFO_1();
            di.pDocName = "NOC Telemetry";
            di.pOutputFile = null;
            di.pDatatype = "RAW";

            if (StartDocPrinter(hPrinter, 1, di) == 0) return "";

            string pjl = "\x1B%-12345X@PJL\r\n" + cmd + "\r\n";
            byte[] bytes = Encoding.ASCII.GetBytes(pjl);
            IntPtr pBytes = Marshal.AllocHGlobal(bytes.Length);
            Marshal.Copy(bytes, 0, pBytes, bytes.Length);

            int written = 0;
            WritePrinter(hPrinter, pBytes, bytes.Length, out written);
            Marshal.FreeHGlobal(pBytes);

            int bufSize = 4096;
            IntPtr pBuf = Marshal.AllocHGlobal(bufSize);
            string response = "";

            for (int i = 0; i < 6; i++) {
                System.Threading.Thread.Sleep(120);
                int bytesRead = 0;
                if (ReadPrinter(hPrinter, pBuf, bufSize, out bytesRead) && bytesRead > 0) {
                    byte[] respBytes = new byte[bytesRead];
                    Marshal.Copy(pBuf, respBytes, 0, bytesRead);
                    response = Encoding.ASCII.GetString(respBytes);
                    break;
                }
            }
            Marshal.FreeHGlobal(pBuf);

            // Send UEL exit
            string exitPjl = "\x1B%-12345X";
            byte[] exitBytes = Encoding.ASCII.GetBytes(exitPjl);
            IntPtr pExit = Marshal.AllocHGlobal(exitBytes.Length);
            Marshal.Copy(exitBytes, 0, pExit, exitBytes.Length);
            int exitWritten = 0;
            WritePrinter(hPrinter, pExit, exitBytes.Length, out exitWritten);
            Marshal.FreeHGlobal(pExit);

            EndDocPrinter(hPrinter);
            return response;
        } catch {
            return "";
        } finally {
            ClosePrinter(hPrinter);
        }
    }

    public static string QueryZpl(string printerName, string cmd) {
        IntPtr hPrinter = IntPtr.Zero;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return "";

        try {
            DOC_INFO_1 di = new DOC_INFO_1();
            di.pDocName = "NOC Zebra Telemetry";
            di.pOutputFile = null;
            di.pDatatype = "RAW";

            if (StartDocPrinter(hPrinter, 1, di) == 0) return "";

            byte[] bytes = Encoding.ASCII.GetBytes(cmd + "\r\n");
            IntPtr pBytes = Marshal.AllocHGlobal(bytes.Length);
            Marshal.Copy(bytes, 0, pBytes, bytes.Length);

            int written = 0;
            WritePrinter(hPrinter, pBytes, bytes.Length, out written);
            Marshal.FreeHGlobal(pBytes);

            int bufSize = 4096;
            IntPtr pBuf = Marshal.AllocHGlobal(bufSize);
            string response = "";

            for (int i = 0; i < 5; i++) {
                System.Threading.Thread.Sleep(100);
                int bytesRead = 0;
                if (ReadPrinter(hPrinter, pBuf, bufSize, out bytesRead) && bytesRead > 0) {
                    byte[] respBytes = new byte[bytesRead];
                    Marshal.Copy(pBuf, respBytes, 0, bytesRead);
                    response = Encoding.ASCII.GetString(respBytes);
                    break;
                }
            }
            Marshal.FreeHGlobal(pBuf);
            EndDocPrinter(hPrinter);
            return response;
        } catch {
            return "";
        } finally {
            ClosePrinter(hPrinter);
        }
    }

    public static int GetUsbPageCount(string printerName) {
        string resp = QueryPjl(printerName, "@PJL INFO PAGECOUNT");
        if (!string.IsNullOrEmpty(resp)) {
            Match m = Regex.Match(resp, @"(?:PAGECOUNT\s*[\r\n]+|\b)(\d{1,8})\b");
            if (m.Success) {
                int count = 0;
                if (int.TryParse(m.Groups[1].Value, out count) && count > 0) return count;
            }
        }
        string respConfig = QueryPjl(printerName, "@PJL INFO CONFIG");
        if (!string.IsNullOrEmpty(respConfig)) {
            Match m = Regex.Match(respConfig, @"(?:PAGES|PAGECOUNT|TOTALPAGES)\s*=\s*(\d{1,8})", RegexOptions.IgnoreCase);
            if (m.Success) {
                int count = 0;
                if (int.TryParse(m.Groups[1].Value, out count) && count > 0) return count;
            }
        }
        return 0;
    }

    public static string GetUsbSerial(string printerName) {
        string resp = QueryPjl(printerName, "@PJL INFO ID");
        if (!string.IsNullOrEmpty(resp)) {
            Match m = Regex.Match(resp, @"(?:SERIAL\s*(?:NUMBER)?\s*[:=]\s*|\b)([A-Za-z0-9]{8,25})\b", RegexOptions.IgnoreCase);
            if (m.Success) return m.Groups[1].Value;
        }
        return "";
    }

    public static string GetZebraSerial(string printerName) {
        string resp = QueryZpl(printerName, "^XA~HI^XZ");
        if (!string.IsNullOrEmpty(resp)) {
            string[] parts = resp.Split(new char[] { ',', '\r', '\n', '\x02', '\x03' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 5) {
                string sn = parts[4].Trim();
                if (sn.Length >= 5 && sn.Length <= 30) return sn;
            }
        }
        return "";
    }

    public static int GetZebraOdometer(string printerName) {
        string resp = QueryZpl(printerName, "^XA~HQOD^XZ");
        if (!string.IsNullOrEmpty(resp)) {
            Match m = Regex.Match(resp, @"(?:TOTAL|NON-RESETTABLE|ODOMETER)[\s:]*([0-9]{1,9})", RegexOptions.IgnoreCase);
            if (m.Success) {
                int count = 0;
                if (int.TryParse(m.Groups[1].Value, out count) && count > 0) return count;
            }
        }
        return 0;
    }
}
"@ -ErrorAction SilentlyContinue
    } catch {}
}

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
    $scanCount = 0
    $type = "USB"
    $category = "PRINTER"
    $isOnline = if ($p.PrinterStatus -eq "WorkOffline" -or $p.PrinterStatus -eq 7) { $false } else { $true }

    # 1. TRATAMENTO USB
    if ($port -like "*USB*" -or $port -like "*DOT4*" -or $port -like "*LPT*" -or $port -eq "USB") {
        $type = "USB"

        # 1.1 Coleta Serial via PJL / ZPL WinSpool nativo
        try {
            if ([System.Management.Automation.PSTypeName]'WinSpoolPJL'.Type) {
                $pjlSn = [WinSpoolPJL]::GetUsbSerial($pName)
                if ($pjlSn -and $pjlSn.Length -ge 6 -and $pjlSn -notmatch '^(Properties|Control|DEFAULT|0000)') { $serial = $pjlSn }

                if ($serial -eq "N/D") {
                    $zplSn = [WinSpoolPJL]::GetZebraSerial($pName)
                    if ($zplSn -and $zplSn.Length -ge 5 -and $zplSn -notmatch '^(Properties|Control|DEFAULT)') { $serial = $zplSn }
                }
            }
        } catch {}

        # 1.1.1 Busca precisa no USBPRINT (filtrando Device Parameters / PortName)
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

        # 1.3 Coleta Odometro USB - Camada 2: Performance Counter WMI da Fila do Spooler
        if ($counter -eq 0) {
            try {
                $perf = Get-CimInstance Win32_PerfFormattedData_Spooler_PrintQueue -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $pName -or $_.Name -like "*$port*" }
                if ($perf -and $perf.TotalPagesPrinted -gt 0) {
                    $counter = [int]$perf.TotalPagesPrinted
                }
            } catch {}
        }

        # 1.4 Coleta Odometro USB - Camada 3: Event Log do Spooler (Microsoft-Windows-PrintService/Operational ID 307)
        if ($counter -eq 0) {
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

        # 1.5 Coleta Odometro USB - Camada 4: PJL / ZPL WinSpool nativo
        if ($counter -eq 0) {
            try {
                if ([System.Management.Automation.PSTypeName]'WinSpoolPJL'.Type) {
                    $pjlCount = [WinSpoolPJL]::GetUsbPageCount($pName)
                    if ($pjlCount -gt 0) { $counter = $pjlCount }

                    if ($counter -eq 0) {
                        $zplCount = [WinSpoolPJL]::GetZebraOdometer($pName)
                        if ($zplCount -gt 0) { $counter = $zplCount }
                    }
                }
            } catch {}
        }

        # 1.6 Coleta Odometro USB - Camada 5: Arquivos de Configuracao/Cache do Samsung Easy Printer Manager
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
    }
    # 2. TRATAMENTO WSD E REDE
    else {
        $type = "NETWORK"
        $resolvedIp = $null

        # 2.1 Extrai IP direto se a porta for TCP/IP numerico
        if ($port -match '(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})') {
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

        # 2.3 Consulta Odometro e Serial via socket ultra-rapido (150ms)
        $snmpSuccess = $false
        if ($resolvedIp) {
            try {
                $u1 = New-Object System.Net.Sockets.UdpClient
                $u1.Connect($resolvedIp, 161)
                $u1.Client.ReceiveTimeout = 300
                $pkt1 = [byte[]]@(0x30, 0x2d, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa0, 0x20, 0x02, 0x04, 0x00, 0x00, 0x00, 0x01, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00, 0x30, 0x12, 0x30, 0x10, 0x06, 0x0c, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x2b, 0x05, 0x01, 0x01, 0x11, 0x01, 0x00, 0x05, 0x00)
                $u1.Send($pkt1, $pkt1.Length) | Out-Null
                $ep1 = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                $recv1 = $u1.Receive([ref]$ep1)
                $u1.Close()
                $str1 = [System.Text.Encoding]::ASCII.GetString($recv1)
                if ($str1 -match '([A-Za-z0-9]{8,25})') {
                    $m1 = $Matches[1]
                    if ($m1 -notmatch 'public' -and $m1.Length -ge 8) { $serial = $m1 }
                }
                $snmpSuccess = $true
            } catch {}

            if ($snmpSuccess) {
                try {
                    $u2 = New-Object System.Net.Sockets.UdpClient
                    $u2.Connect($resolvedIp, 161)
                    $u2.Client.ReceiveTimeout = 300
                    $pkt2 = [byte[]]@(0x30, 0x2d, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa0, 0x20, 0x02, 0x04, 0x00, 0x00, 0x00, 0x01, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00, 0x30, 0x12, 0x30, 0x10, 0x06, 0x0c, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x2b, 0x0a, 0x02, 0x01, 0x04, 0x01, 0x01, 0x05, 0x00)
                    $u2.Send($pkt2, $pkt2.Length) | Out-Null
                    $ep2 = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                    $recv2 = $u2.Receive([ref]$ep2)
                    $u2.Close()
                    $l2 = $recv2.Length
                    if ($l2 -gt 5) {
                        $vLen = [int]$recv2[$l2 - 4]
                        if ($vLen -eq 3) {
                            $counter = ([int]$recv2[$l2-3] * 65536) + ([int]$recv2[$l2-2] * 256) + [int]$recv2[$l2-1]
                        } elseif ($vLen -eq 4) {
                            $counter = ([int]$recv2[$l2-4] * 16777216) + ([int]$recv2[$l2-3] * 65536) + ([int]$recv2[$l2-2] * 256) + [int]$recv2[$l2-1]
                        } elseif ($vLen -eq 2) {
                            $counter = ([int]$recv2[$l2-2] * 256) + [int]$recv2[$l2-1]
                        }
                    }
                } catch {}
            }
        }
        $isOnline = if ($resolvedIp) { $snmpSuccess } else { $isOnline }
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

    $cameraExcludes = @("camera", "webcam", "integrated", "virtual", "obs", "video", "face", "droidcam", "iris")

    foreach ($sc in $pnpScanners) {
        $scName = $sc.Name
        if (-not $scName) { continue }
        $scUpper = $scName.ToUpper()

        $isCamera = $false
        foreach ($cex in $cameraExcludes) {
            if ($scUpper.Contains($cex.ToUpper())) {
                $isCamera = $true
                break
            }
        }
        if ($isCamera) { continue }

        $alreadyIncluded = $false
        foreach ($r in $results) {
            $cleanR = ($r.name -replace '\s*\(.*?\)', '').Trim()
            $cleanSc = ($scName -replace '\s*\(.*?\)', '').Trim()
            if ($r.name -eq $scName -or ($cleanR -and $cleanSc -and ($cleanR -like "*$cleanSc*" -or $cleanSc -like "*$cleanR*")) -or ($sc.DeviceID -and $r.serialNumber -and $sc.DeviceID -like "*$($r.serialNumber)*")) {
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
                    $wAlready = $false
                    foreach ($r in $results) {
                        $cleanR = ($r.name -replace '\s*\(.*?\)', '').Trim()
                        $cleanW = ($wName -replace '\s*\(.*?\)', '').Trim()
                        if ($r.name -eq $wName -or ($cleanR -and $cleanW -and ($cleanR -like "*$cleanW*" -or $cleanW -like "*$cleanR*"))) {
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