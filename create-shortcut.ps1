$ws = New-Object -ComObject WScript.Shell

# Desktop shortcut (visible console for manual use).
$shortcut = $ws.CreateShortcut("$env:USERPROFILE\Desktop\CogmemUI Local.lnk")
$shortcut.TargetPath = "$env:USERPROFILE\cogmemui\cogmemui-local\start.bat"
$shortcut.WorkingDirectory = "$env:USERPROFILE\cogmemui\cogmemui-local"
$shortcut.Description = "Start CogmemUI Local Companion"
$shortcut.Save()
Write-Host "Desktop shortcut created: CogmemUI Local"

# Startup shortcut (hidden, runs on login).
$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$startup = $ws.CreateShortcut("$startupDir\CogmemUI Local.lnk")
$startup.TargetPath = "$env:USERPROFILE\cogmemui\cogmemui-local\start-hidden.vbs"
$startup.WorkingDirectory = "$env:USERPROFILE\cogmemui\cogmemui-local"
$startup.Description = "CogmemUI Local Companion (auto-start)"
$startup.Save()
Write-Host "Startup shortcut created: runs automatically on login"
