@echo off
chcp 65001 > nul
echo ===================================================
echo  1. Compiling Launcher.cs to PoliceLauncher.exe...
echo ===================================================
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /out:PoliceLauncher.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll Launcher.cs

if errorlevel 1 (
    echo Error: Failed to compile Launcher.cs
    pause
    exit /b 1
)

echo.
echo ===================================================
echo  2. Building Installer with Inno Setup...
echo ===================================================
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" setup_installer.iss
) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    "C:\Program Files\Inno Setup 6\ISCC.exe" setup_installer.iss
) else (
    echo Warning: ISCC.exe not found in standard paths. You can compile setup_installer.iss directly in Inno Setup GUI.
    pause
    exit /b 0
)

echo.
echo ===================================================
echo  Installer build complete!
echo  Output file: build_installer\PoliceProject_Setup_v1.0.0.exe
echo ===================================================
pause
