@echo off
setlocal enabledelayedexpansion

set "ROOT_DIR=%ProgramFiles%\PicLet"
set "CONVERT=%ROOT_DIR%\libs\convert.exe"

set "INPUT=%~1"
set "OUTPUT=%~dpn1.ico"

:: Check if convert.exe exists
if not exist "!CONVERT!" (
    color 0C
    echo Error: convert.exe not found at "!CONVERT!"
    echo Please ensure PicLet is installed correctly.
    pause
    exit /b 1
)

:: Delete existing output file if it exists
if exist "!OUTPUT!" del "!OUTPUT!"

:: Convert PNG to ICO
echo Converting PNG to ICO...
echo This may take a moment, please wait...
echo.

:: Run convert
"!CONVERT!" "!INPUT!" -define icon:auto-resize=256,128,64,48,32,16 "!OUTPUT!"

:: Check if conversion was successful
if !errorlevel! equ 0 (
    color 0A
    echo.
    echo Conversion complete: !OUTPUT!
) else (
    color 0C
    echo.
    echo Error: Conversion failed with error code !errorlevel!
)

endlocal
echo.
echo Press any key to close this window...
pause > nul