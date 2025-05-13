@echo off
setlocal enabledelayedexpansion

set "ROOT_DIR=%ProgramFiles%\PicLet"
set "CONVERT=%ROOT_DIR%\libs\convert.exe"

set "INPUT=%~1"
set "TEMP_TRIMMED=%~dpn1_trimmed.png"
set "TEMP_RESIZED=%~dpn1_trimmed_scaled.png"
set "OUTPUT=%~dpn1.ico"

:: Check if convert.exe exists
if not exist "!CONVERT!" (
    color 0C
    echo Error: convert.exe not found at "!CONVERT!"
    echo Please ensure PicLet is installed correctly.
    pause
    exit /b 1
)

echo Creating icon from image...

:: Delete existing output files if they exist
if exist "!TEMP_TRIMMED!" del "!TEMP_TRIMMED!"
if exist "!TEMP_RESIZED!" del "!TEMP_RESIZED!"
if exist "!OUTPUT!" del "!OUTPUT!"

:: Step 1: Trim transparent areas and resize to 512x512
echo Step 1/3: Trimming image...
"!CONVERT!" "!INPUT!" -trim +repage "!TEMP_TRIMMED!"

:: Check if trimming was successful
if !errorlevel! neq 0 (
    color 0C
    echo Error: Image trimming failed.
    pause
    exit /b 1
)

:: Step 2: Scale the trimmed image to 512px width
echo.
echo Step 2/3: Scaling image to 512px width...

:: Directly use convert.exe for scaling to ensure it works reliably
"!CONVERT!" "!TEMP_TRIMMED!" -resize 512 "!TEMP_RESIZED!"

:: Check if scaling was successful
if !errorlevel! neq 0 (
    color 0C
    echo Error: Scaling failed with error code !errorlevel!
    pause
    exit /b 1
)

:: Check if file was created
if not exist "!TEMP_RESIZED!" (
    color 0C
    echo Error: Scaled image was not created.
    pause
    exit /b 1
)

:: Step 3: Convert to ICO with multiple sizes
echo Step 3/3: Creating icon with standard sizes...
"!CONVERT!" "!TEMP_RESIZED!" -define icon:auto-resize=256,128,64,48,32,16 "!OUTPUT!"

:: Check if conversion was successful
if !errorlevel! equ 0 (
    color 0A
    echo.
    echo Icon creation complete: !OUTPUT!
    
    :: Clean up temporary files
    if exist "!TEMP_TRIMMED!" del "!TEMP_TRIMMED!" 2>nul
    if exist "!TEMP_RESIZED!" del "!TEMP_RESIZED!" 2>nul
) else (
    color 0C
    echo.
    echo Error: Icon creation failed with error code !errorlevel!
)

endlocal
echo.
echo Press any key to close this window...
pause > nul 