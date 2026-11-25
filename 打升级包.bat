@echo off
rem Build ShiXia upgrade package
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\make-upgrade.ps1"
pause
