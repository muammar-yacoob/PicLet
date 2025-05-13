@echo off
setlocal enabledelayedexpansion
color 0A

:: Set paths and create directories
set "CURRENT_DIR=%~dp0"
set "INSTALL_DIR=%ProgramFiles%\PicLet"

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    color 04
    echo Administrator privileges required!
    pause
    exit /b 1
)

echo ================================
echo   PicLet Image Tools Installer  
echo ================================
echo.

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%" 2>nul
if not exist "%INSTALL_DIR%\src" mkdir "%INSTALL_DIR%\src" 2>nul
if not exist "%INSTALL_DIR%\src\icons" mkdir "%INSTALL_DIR%\src\icons" 2>nul
if not exist "%INSTALL_DIR%\libs" mkdir "%INSTALL_DIR%\libs" 2>nul

:: Copy files
echo Installing PicLet...

:: Suppress individual file copy messages
set "files_copied=0"
echo n | xcopy /y "%CURRENT_DIR%src\png2ico.bat" "%INSTALL_DIR%\src\" /i /q >nul && set /a "files_copied+=1"
echo n | xcopy /y "%CURRENT_DIR%src\remove-bg.bat" "%INSTALL_DIR%\src\" /i /q >nul && set /a "files_copied+=1"
echo n | xcopy /y "%CURRENT_DIR%src\icons\*.ico" "%INSTALL_DIR%\src\icons\" /i /q >nul && set /a "files_copied+=2"
echo n | xcopy /y "%CURRENT_DIR%src\piclet.reg" "%INSTALL_DIR%\src\" /i /q >nul && set /a "files_copied+=1"

:: Copy convert.exe
echo Copying convert.exe...
echo n | xcopy /y "%CURRENT_DIR%libs\convert.exe" "%INSTALL_DIR%\libs\" /i /q >nul && set /a "files_copied+=1"

echo %files_copied% files copied successfully.
echo.

:: Import registry file
echo Installing context menu integration...
reg import "%CURRENT_DIR%src\piclet.reg" || (
    color 04
    echo Registry import failed! Path: "%CURRENT_DIR%src\piclet.reg"
    pause
    exit /b 1
)

echo Installation complete
echo.
echo * PNG to ICO conversion
echo * PNG background removal
echo.
echo PicLet has been successfully installed to %INSTALL_DIR%
echo.
echo How to use:
echo 1. Right-click on a PNG file -^> Select "Make Icon"
echo 2. Right-click on a PNG file -^> Select "Remove Background"
echo.
echo You may need to restart Windows Explorer for changes to take effect.

pause
endlocal 