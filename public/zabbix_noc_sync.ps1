param(
    [string]$Query
)

$hostname = $env:COMPUTERNAME
$zabbixDir = "C:\zabbix"
if (-not (Test-Path $zabbixDir)) {
    New-Item -ItemType Directory -Path $zabbixDir -Force | Out-Null
}

$cacheLocation = Join-Path $zabbixDir "host_location.txt"
$cacheCoords = Join-Path $zabbixDir "host_coordinates.txt"
$cacheOwner = Join-Path $zabbixDir "host_owner.txt"

# Conecta EXCLUSIVAMENTE ao servidor de producao do NOC (rcsfti.ddns.net:4002)
try {
    $cfg = Invoke-RestMethod -Uri "http://rcsfti.ddns.net:4002/api/config" -TimeoutSec 3 -ErrorAction Stop

    # 1. Update location & coords cache
    $loc = $cfg.locations.$hostname
    if ($loc) {
        $unitName = $loc.city
        $unit = $cfg.customUnits | Where-Object { $_.name -eq $unitName }
        $cityName = if ($unit) { "$($unit.city) - $($unit.state)" } else { $unitName }
        $cityName | Out-File -FilePath $cacheLocation -Encoding utf8 -Force

        if ($loc.lat -and $loc.lng) {
            $lat = $loc.lat -replace ',', '.'
            $lng = $loc.lng -replace ',', '.'
            "$lat,$lng" | Out-File -FilePath $cacheCoords -Encoding utf8 -Force
        }
    }

    # 2. Update owner cache
    $owner = $cfg.owners.$hostname
    if ($owner) {
        $owner | Out-File -FilePath $cacheOwner -Encoding utf8 -Force
    }
} catch {
    # Silently ignore connection errors, we will fall back to cached files
}

switch ($Query) {
    "city" {
        if (Test-Path $cacheLocation) { Get-Content $cacheLocation } else { Write-Output "unknown" }
    }
    "coords" {
        if (Test-Path $cacheCoords) { Get-Content $cacheCoords } else { Write-Output "unknown" }
    }
    "owner" {
        if (Test-Path $cacheOwner) { Get-Content $cacheOwner } else { Write-Output "unknown" }
    }
    default {
        Write-Output "unknown"
    }
}
