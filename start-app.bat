@echo off
chcp 65001 > nul
title Police Project Control Center

echo ===================================================
echo   ระบบกำลังเตรียมความพร้อม (Local OCR + Frontend)...
echo ===================================================
echo.

:: 1. เคลียร์ Process เก่าที่พอร์ต 3000 และ 5003 เพื่อป้องกันพอร์ตชน
powershell -Command "Get-NetTCPConnection -LocalPort 3000,5003 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>nul

:: 2. ตรวจสอบว่ามี Node.js หรือไม่
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบ Node.js ในเครื่องนี้!
    echo กรุณาดาวน์โหลดและติดตั้ง Node.js จาก https://nodejs.org/ ก่อนใช้งาน
    pause
    exit /b
)

:: 3. ตรวจสอบและติดตั้ง Dependencies ของ Backend (สำหรับ Local OCR)
if not exist "backend\node_modules" (
    echo [SETUP] ไม่พบ node_modules ใน Backend กำลังทำการ npm install ให้...
    cd backend
    call npm install
    cd ..
    echo [SETUP] ติดตั้ง Backend dependencies เรียบร้อยแล้ว!
    echo.
)

:: 4. ตรวจสอบและติดตั้ง Dependencies ของ Frontend
if not exist "frontend\node_modules" (
    echo [SETUP] ไม่พบ node_modules ใน Frontend กำลังทำการ npm install ให้...
    cd frontend
    call npm install
    cd ..
    echo [SETUP] ติดตั้ง Frontend dependencies เรียบร้อยแล้ว!
    echo.
)

echo [START] กำลังเริ่มทำงาน Backend Server (Local OCR)...
start "Police Backend Server" /min cmd /c "cd backend && npm run dev"

echo [START] กำลังเริ่มทำงาน Frontend Server...
start "Police Frontend Server" /min cmd /c "cd frontend && npm run dev"

echo [WAIT] กำลังรอระบบเริ่มต้น (ประมาณ 6 วินาที)...
timeout /t 6 /nobreak > nul

echo [LAUNCH] กำลังเปิดเบราว์เซอร์ไปที่ http://localhost:3000...
start http://localhost:3000

cls
echo ===================================================
echo      POLICE PROJECT APP - กำลังเปิดใช้งานอยู่
echo ===================================================
echo.
echo   [V] Backend Server  (Port 5003 - Local OCR) : พร้อมใช้งาน
echo   [V] Frontend Server (Port 3000)             : พร้อมใช้งาน
echo   [V] เบราว์เซอร์ถูกเปิดไปที่ http://localhost:3000 เรียบร้อยแล้ว
echo.
echo ---------------------------------------------------
echo   [!] เมื่อใช้งานเสร็จสิ้นแล้ว:
echo       -> กดปุ่ม [ Enter ] หรือ กดปิด [ X ] หน้าต่างนี้
echo       -> ระบบจะสั่ง "ปิด Backend & Frontend ทั้งหมด" ให้อัตโนมัติ!
echo ---------------------------------------------------
echo.
pause > nul

echo.
echo กำลังปิดระบบ Police Project ทั้งหมด...
powershell -Command "Get-NetTCPConnection -LocalPort 3000,5003 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>nul
echo [SUCCESS] ปิดระบบทั้งหมดเรียบร้อยแล้ว!
timeout /t 2 > nul
exit