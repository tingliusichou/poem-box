@echo off
rem Pack ShiXia distribution zip
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\pack.ps1"
pause
