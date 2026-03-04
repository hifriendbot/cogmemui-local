@echo off
setlocal enabledelayedexpansion
color 0A

:: Stop previous instance using saved PID.
set "PIDFILE=%USERPROFILE%\.cogmemui-local\server.pid"
if exist "%PIDFILE%" (
    set /p OLDPID=<"%PIDFILE%"
    echo.
    echo   Stopping previous instance...
    taskkill /F /PID !OLDPID! >nul 2>&1
    del "%PIDFILE%" >nul 2>&1
)

title CogmemUI Local Companion

:: Read token from config and copy to clipboard.
set "CONFIG=%USERPROFILE%\.cogmemui-local\config.json"
if exist "%CONFIG%" (
    for /f "tokens=2 delims=:," %%a in ('findstr /C:"token" "%CONFIG%"') do (
        set "TOKEN=%%~a"
    )
)
:: Trim whitespace and quotes from token.
if defined TOKEN (
    for /f "tokens=* delims= " %%b in ("%TOKEN%") do set "TOKEN=%%~b"
    echo %TOKEN%| clip
    echo.
    echo   Token copied to clipboard!
    echo   Paste it into CogmemUI Settings ^> Local Server
    echo.
)

:: Start the companion.
cd /d "%~dp0"
node bin\cogmemui-local.js
