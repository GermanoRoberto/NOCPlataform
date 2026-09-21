#Requires -RunAsAdministrator
$ErrorActionPreference = "Continue"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   CONFIGURACAO DE INICIALIZACAO AUTOMATICA - SERVIDOR NOC / OLLAMA    " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Localizar Ollama no servidor
$ollamaPaths = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama app.exe"),
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Ollama\ollama app.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Ollama\ollama.exe"
)

$ollamaExe = $null
foreach ($p in $ollamaPaths) {
    if (Test-Path $p) {
        $ollamaExe = $p
        break
    }
}

if ($ollamaExe) {
    Write-Host "[1/3] Ollama localizado em: $ollamaExe" -ForegroundColor Green
    
    # Adicionar ao Registro (Run do Usuario)
    Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "Ollama" -Value "`"$ollamaExe`"" -Force
    Write-Host "      -> Registro HKCU\...\Run configurado." -ForegroundColor Gray
    
    # Criar Atalho na pasta Startup
    $startupDir = [Environment]::GetFolderPath('Startup')
    $wsh = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut((Join-Path $startupDir "Ollama.lnk"))
    $shortcut.TargetPath = $ollamaExe
    $shortcut.Save()
    Write-Host "      -> Atalho criado em shell:startup ($startupDir)." -ForegroundColor Gray
    
    # Criar Tarefa Agendada no Windows para subir no Logon
    schtasks /Create /TN "Ollama_AutoStart" /TR "`"$ollamaExe`"" /SC ONLOGON /RL HIGHEST /F | Out-Null
    Write-Host "      -> Tarefa Agendada 'Ollama_AutoStart' criada no Windows." -ForegroundColor Gray
} else {
    Write-Host "[1/3] AVISO: Executavel do Ollama nao foi encontrado nas pastas padrao." -ForegroundColor Yellow
}

Write-Host ""

# 2. Configurar o NOC Enterprise no servidor
$nocBat = "C:\NOC\Iniciar NOC Enterprise.bat"
if (Test-Path $nocBat) {
    Write-Host "[2/3] NOC Enterprise localizado em: $nocBat" -ForegroundColor Green
    
    # Criar Atalho na pasta Startup
    $startupDir = [Environment]::GetFolderPath('Startup')
    $wsh = New-Object -ComObject WScript.Shell
    $shortcutNoc = $wsh.CreateShortcut((Join-Path $startupDir "NOC_Enterprise.lnk"))
    $shortcutNoc.TargetPath = $nocBat
    $shortcutNoc.WorkingDirectory = "C:\NOC"
    $shortcutNoc.Save()
    Write-Host "      -> Atalho do NOC criado em shell:startup." -ForegroundColor Gray
    
    # Criar Tarefa Agendada no Windows para subir no Logon com privilegios maximos
    schtasks /Create /TN "NOC_Enterprise_Server" /TR "`"$nocBat`"" /SC ONLOGON /RL HIGHEST /F | Out-Null
    Write-Host "      -> Tarefa Agendada 'NOC_Enterprise_Server' criada no Windows." -ForegroundColor Gray
} else {
    Write-Host "[2/3] AVISO: Iniciar NOC Enterprise.bat nao encontrado em C:\NOC\." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[3/3] Concluido com sucesso!" -ForegroundColor Green
Write-Host "Agora, sempre que o servidor for reiniciado ou ligado:" -ForegroundColor Cyan
Write-Host "  1. O Ollama subira automaticamente com icone no System Tray." -ForegroundColor White
Write-Host "  2. O servidor NOC Enterprise subira automaticamente na porta 4002." -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan
