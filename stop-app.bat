@echo off
chcp 65001 > nul
title Police Project - Stop App

echo ===================================================
echo   กำลังปิดระบบ Police Project (Backend & Frontend)...
echo ===================================================
echo.

powershell -Command "Get-NetTCPConnection -LocalPort 3000,5003 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>nul

echo [SUCCESS] ปิดระบบ Backend และ Frontend เรียบร้อยแล้ว!
timeout /t 2 /nobreak > nul
exit
