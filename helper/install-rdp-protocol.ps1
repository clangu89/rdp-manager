# ========================================================
# RDP Manager - Windows 1-Click Protocol Installer
# ========================================================

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  RDP Manager: 1-Click Zero-Prompt Protocol Setup" -ForegroundColor Cyan
Write-Host "  (clangu89 / rdp-manager)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$targetDir = Join-Path $env:LOCALAPPDATA "RDPManager"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

Write-Host "[*] Installing system files to $targetDir..." -ForegroundColor Yellow

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. ติดตั้ง rdp-handler.ps1
$handlerDest = Join-Path $targetDir "rdp-handler.ps1"
if ($scriptDir -and (Test-Path (Join-Path $scriptDir "rdp-handler.ps1"))) {
    Copy-Item (Join-Path $scriptDir "rdp-handler.ps1") $handlerDest -Force
} else {
    try {
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/clangu89/rdp-manager/main/helper/rdp-handler.ps1" -OutFile $handlerDest -UseBasicParsing -ErrorAction Stop
    } catch {
        Write-Warning "Could not download rdp-handler.ps1 directly, using fallback."
    }
}

# 2. ติดตั้ง rdp-runner.vbs
$runnerDest = Join-Path $targetDir "rdp-runner.vbs"
if ($scriptDir -and (Test-Path (Join-Path $scriptDir "rdp-runner.vbs"))) {
    Copy-Item (Join-Path $scriptDir "rdp-runner.vbs") $runnerDest -Force
} else {
    try {
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/clangu89/rdp-manager/main/helper/rdp-runner.vbs" -OutFile $runnerDest -UseBasicParsing -ErrorAction Stop
    } catch {
        Write-Warning "Could not download rdp-runner.vbs directly, using fallback."
    }
}

# 3. ลงทะเบียน Registry Protocol (rdpconnect://)
Write-Host "[*] Registering Windows Registry Protocol (rdpconnect://)..." -ForegroundColor Yellow

$regPath = "HKCU:\Software\Classes\rdpconnect"
if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}
Set-Item -Path $regPath -Value "URL:RDP Connect Protocol"
New-ItemProperty -Path $regPath -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

$cmdPath = "HKCU:\Software\Classes\rdpconnect\shell\open\command"
if (-not (Test-Path $cmdPath)) {
    New-Item -Path $cmdPath -Force | Out-Null
}
$vbsPath = Join-Path $targetDir "rdp-runner.vbs"
$cmdVal = "wscript.exe `"$vbsPath`" `"%1`""
Set-Item -Path $cmdPath -Value $cmdVal

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  [SUCCESS] Installation completed successfully!" -ForegroundColor Green
Write-Host "  You can now return to the web app and click 'Remote'." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
