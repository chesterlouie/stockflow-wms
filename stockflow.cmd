@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ops\stockflow.ps1" %*
