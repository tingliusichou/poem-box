@echo off
rem ShiXia one-click upgrade (pure ASCII; logic in upgrade.ps1)
setlocal
set "PWSH=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PWSH%" set "PWSH=powershell"
set "UPS="
for /r "%~dp0" %%F in (upgrade.ps1) do if exist "%%~fF" if not defined UPS set "UPS=%%~fF"
if not defined UPS (
  echo [ShiXia] upgrade.ps1 not found. The package seems incomplete.
  pause
  exit /b 1
)
"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%UPS%"
if errorlevel 1 pause
exit /b %errorlevel%
