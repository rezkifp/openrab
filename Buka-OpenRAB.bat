@echo off
title OpenRAB - Aplikasi Penyusun RAB
cd /d "%~dp0"

echo ============================================
echo   Mempersiapkan OpenRAB...
echo ============================================
echo.

if not exist "node_modules\" (
    echo [1/2] Mengunduh komponen pertama kali...
    call npm install
)

echo [2/2] Menyalakan server OpenRAB...
echo Browser akan terbuka otomatis di http://localhost:3000
echo.
echo Jangan tutup jendela ini selama Anda menggunakan OpenRAB.
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
call npm run dev
