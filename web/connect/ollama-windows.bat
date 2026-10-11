@echo off
setlocal
title CAK3D Crawler - use Ollama from your phone
rem Lets CAK3D Crawler on your phone or tablet use Ollama on this computer over your home Wi-Fi.
rem It tells Ollama to listen on your home network, allows it through Windows Firewall on private
rem networks only, and restarts Ollama. To reverse it, run:  ollama-windows.bat undo

net session >nul 2>&1
if errorlevel 1 (
  echo Windows will ask for permission to change the firewall. Choose Yes.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%~1' -Verb RunAs"
  exit /b
)
set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
set "OLLAMA_APP=%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
if /i "%~1"=="undo" goto undo

if not exist "%OLLAMA_EXE%" (
  echo Ollama isn't installed on this computer. Get it at https://ollama.com/download and run this again.
  pause
  exit /b 1
)

echo Setting up Ollama for CAK3D Crawler...
setx OLLAMA_HOST 0.0.0.0 >nul
setx OLLAMA_ORIGINS "__ORIGINS__" >nul
netsh advfirewall firewall delete rule name="Ollama for CAK3D Crawler" >nul 2>&1
netsh advfirewall firewall add rule name="Ollama for CAK3D Crawler" dir=in action=allow protocol=TCP localport=11434 profile=private,domain >nul

rem the firewall rule only covers private networks, so check this Wi-Fi is marked Private
powershell -NoProfile -Command "if (Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public') { exit 1 }"
if errorlevel 1 (
  echo.
  echo This network is set to Public, so other devices can't reach this computer.
  choice /c YN /m "Mark it as a Private (home) network now"
  if not errorlevel 2 powershell -NoProfile -Command "Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public' | Set-NetConnectionProfile -NetworkCategory Private"
)

echo Restarting Ollama...
taskkill /f /im "ollama app.exe" >nul 2>&1
taskkill /f /im ollama.exe >nul 2>&1
timeout /t 2 /nobreak >nul
rem start it through Explorer so it runs as you (not as administrator) with the new settings
if exist "%OLLAMA_APP%" (explorer.exe "%OLLAMA_APP%") else (explorer.exe "%OLLAMA_EXE%")
timeout /t 4 /nobreak >nul

echo.
echo All set. In CAK3D Crawler on your phone: Settings ^> Research ^> Your AI ^> "Ollama on my computer".
echo Type one of these addresses (or tap Find my computer):
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|VirtualBox|VMware|Loopback|WSL|Tailscale|ZeroTier' } | ForEach-Object { '    ' + $_.IPAddress }"
echo.
echo Models on this computer:
"%OLLAMA_EXE%" list
echo.
echo No models listed? Download one, for example:  ollama pull qwen3
echo Your phone and this computer must be on the same Wi-Fi.
pause
exit /b 0

:undo
echo Undoing the CAK3D Crawler setup for Ollama...
reg delete HKCU\Environment /v OLLAMA_HOST /f >nul 2>&1
reg delete HKCU\Environment /v OLLAMA_ORIGINS /f >nul 2>&1
setx CAK3D_REFRESH 1 >nul & reg delete HKCU\Environment /v CAK3D_REFRESH /f >nul 2>&1
netsh advfirewall firewall delete rule name="Ollama for CAK3D Crawler" >nul 2>&1
taskkill /f /im "ollama app.exe" >nul 2>&1
taskkill /f /im ollama.exe >nul 2>&1
timeout /t 2 /nobreak >nul
if exist "%OLLAMA_APP%" explorer.exe "%OLLAMA_APP%"
echo Done. Ollama only answers this computer again.
pause
