@echo off
rem ShiXia all-in-one launcher (pure ASCII by design; all logic in launch.ps1)
setlocal
title ShiXia
set "PWSH=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PWSH%" set "PWSH=powershell"
set "LPS="
for /r "%~dp0" %%F in (launch.ps1) do if exist "%%~fF" if not defined LPS set "LPS=%%~fF"
if not defined LPS (
  echo [ShiXia] launch.ps1 not found. The package seems incomplete.
  pause
  exit /b 1
)
"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%LPS%"
if errorlevel 1 pause
exit /b %errorlevel%
