@echo off
setlocal enabledelayedexpansion

set "ROOT_DIR=%ProgramFiles%\PicLet"
set "CONVERT=%ROOT_DIR%\libs\convert.exe"

set "INPUT=%~1"
set "OUTPUT=%~dpn1_scaled%~x1"

:: Check if input parameter was provided
if "%~1"=="" (
    color 0C
    echo.
    echo Error: No input file specified.
    echo Please right-click on an image file and select "Scale Image".
    echo.
    goto :pauseExit
)

:: Check if input file exists
if not exist "%INPUT%" (
    color 0C
    echo.
    echo Error: Input file not found: "%INPUT%"
    echo.
    goto :pauseExit
)

:: Check if convert.exe exists
if not exist "!CONVERT!" (
    color 0C
    echo.
    echo Error: convert.exe not found at "!CONVERT!"
    echo The program may not be installed correctly.
    echo.
    goto :pauseExit
)

echo Processing file: "%INPUT%"
echo Output will be saved as: "%OUTPUT%"

:: Create a temporary file for error output
set "ERROR_LOG=%TEMP%\piclet_error.log"
if exist "!ERROR_LOG!" del "!ERROR_LOG!"

:: Get original image dimensions with error logging
"!CONVERT!" "%INPUT%" -ping -format "%%w" info: > "%TEMP%\width.txt" 2>"!ERROR_LOG!"
if exist "%TEMP%\width.txt" (
    set /p ORIG_WIDTH=<"%TEMP%\width.txt"
    del "%TEMP%\width.txt"
) else (
    set "ORIG_WIDTH="
)

"!CONVERT!" "%INPUT%" -ping -format "%%h" info: > "%TEMP%\height.txt" 2>>"!ERROR_LOG!"
if exist "%TEMP%\height.txt" (
    set /p ORIG_HEIGHT=<"%TEMP%\height.txt"
    del "%TEMP%\height.txt"
) else (
    set "ORIG_HEIGHT="
)

if not defined ORIG_WIDTH (
    color 0C
    echo.
    echo Error: Could not read image dimensions.
    echo Make sure "%INPUT%" is a valid image format supported by ImageMagick.
    echo.
    
    :: Display convert.exe error if available
    if exist "!ERROR_LOG!" (
        echo ImageMagick reported the following error:
        type "!ERROR_LOG!"
        echo.
    )
    
    goto :pauseExit
)

echo Size: !ORIG_WIDTH!x!ORIG_HEIGHT!

:: Delete existing output file if it exists
if exist "!OUTPUT!" del "!OUTPUT!"

:: Prompt for scale factors
echo.
set /p "WIDTH=Width (blank=auto): "
set /p "HEIGHT=Height (blank=auto): "

:: Handle empty inputs
if "!WIDTH!"=="" if "!HEIGHT!"=="" (
    set "SCALE_PARAM=50%%"
    echo Using default scale: 50%%
) else if "!WIDTH!"=="" (
    set "SCALE_PARAM=x!HEIGHT!"
    echo Using height: !HEIGHT! (width will be calculated automatically)
) else if "!HEIGHT!"=="" (
    set "SCALE_PARAM=!WIDTH!"
    echo Using width: !WIDTH! (height will be calculated automatically)
) else (
    set "SCALE_PARAM=!WIDTH!x!HEIGHT!"
    echo Using dimensions: !WIDTH!x!HEIGHT!
)

:: Scale the image
echo.
echo Running command: "!CONVERT!" "%INPUT%" -resize "!SCALE_PARAM!" "%OUTPUT%"
echo Processing...

"!CONVERT!" "%INPUT%" -resize "!SCALE_PARAM!" "%OUTPUT%" 2>"!ERROR_LOG!"

:: Check if conversion was successful and file was created
if !errorlevel! equ 0 (
    if exist "%OUTPUT%" (
        color 0A
        
        :: Get new dimensions
        for /f %%a in ('"!CONVERT!" "%OUTPUT%" -ping -format "%%w" info:"') do set "NEW_WIDTH=%%a"
        for /f %%a in ('"!CONVERT!" "%OUTPUT%" -ping -format "%%h" info:"') do set "NEW_HEIGHT=%%a"
        
        echo Done: !OUTPUT! (!NEW_WIDTH!x!NEW_HEIGHT!)
    ) else (
        color 0C
        echo Error: ImageMagick did not report errors, but no output file was created.
        echo Attempted to create: "%OUTPUT%"
        echo Please check directory permissions.
    )
) else (
    color 0C
    echo Error: Scaling failed with code !errorlevel!
    
    :: Display convert.exe error if available
    if exist "!ERROR_LOG!" (
        echo ImageMagick reported the following error:
        type "!ERROR_LOG!"
        echo.
    )
)

:: Clean up
if exist "!ERROR_LOG!" del "!ERROR_LOG!"

:pauseExit
echo.
echo Press any key to close...
pause > nul
endlocal 