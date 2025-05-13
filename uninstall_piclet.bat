@echo off
setlocal enabledelayedexpansion
color 0C

echo ================================
echo   PicLet - Uninstallation
echo ================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Administrator privileges required!
    pause
    exit /b 1
)

:: Set paths
set "INSTALL_DIR=%ProgramFiles%\PicLet"

:: Remove registry entries
echo Removing registry entries...
reg delete "HKEY_CLASSES_ROOT\SystemFileAssociations\.png\Shell\MakeIcon" /f
reg delete "HKEY_CLASSES_ROOT\SystemFileAssociations\.png\Shell\RemoveBackground" /f
reg delete "HKEY_CLASSES_ROOT\SystemFileAssociations\.png\Shell\ScaleImage" /f
reg delete "HKEY_CLASSES_ROOT\SystemFileAssociations\.jpg\Shell\ScaleImage" /f
reg delete "HKEY_CLASSES_ROOT\SystemFileAssociations\.jpeg\Shell\ScaleImage" /f
reg delete "HKEY_CLASSES_ROOT\SystemFileAssociations\.gif\Shell\ScaleImage" /f
reg delete "HKEY_CLASSES_ROOT\SystemFileAssociations\.bmp\Shell\ScaleImage" /f

:: Remove installation directory
echo Removing installation directory...
if exist "%INSTALL_DIR%" (
    :: Remove specific files first to ensure they're gone
    if exist "%INSTALL_DIR%\src\makeicon.bat" del /f /q "%INSTALL_DIR%\src\makeicon.bat"
    if exist "%INSTALL_DIR%\src\remove-bg.bat" del /f /q "%INSTALL_DIR%\src\remove-bg.bat"
    if exist "%INSTALL_DIR%\src\rescale.bat" del /f /q "%INSTALL_DIR%\src\rescale.bat"
    if exist "%INSTALL_DIR%\src\piclet.reg" del /f /q "%INSTALL_DIR%\src\piclet.reg"
    if exist "%INSTALL_DIR%\src\icons\*.ico" del /f /q "%INSTALL_DIR%\src\icons\*.ico"
    
    :: Remove convert.exe
    if exist "%INSTALL_DIR%\libs\convert.exe" del /f /q "%INSTALL_DIR%\libs\convert.exe"
    
    :: Then remove directories
    rd /s /q "%INSTALL_DIR%" 2>nul
)

echo.
echo Uninstallation complete!
echo.
echo PicLet has been successfully removed from your system.
echo All icons (makeicon.ico, removebg.ico, rescale.ico) and scripts have been removed.
echo You may need to restart Windows Explorer for changes to take effect.

pause
endlocal 