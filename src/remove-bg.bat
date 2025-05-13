@echo off
setlocal enabledelayedexpansion

set "ROOT_DIR=%ProgramFiles%\PicLet"
set "CONVERT=%ROOT_DIR%\libs\convert.exe"

set "INPUT=%~1"
set "OUTPUT_TEMP=%~dpn1_temp.png"
set "OUTPUT=%~dpn1_nobg.png"
set "TEMP_FILE=%TEMP%\border_color.txt"
set "FUZZ=10"
set "TRIM=Y"
set "PRESERVE_INNER=N"

:: Check if convert.exe exists
if not exist "!CONVERT!" (
    color 0C
    echo Error: convert.exe not found at "!CONVERT!"
    echo Please ensure PicLet is installed correctly.
    pause
    exit /b 1
)

:: Delete existing output files if they exist
if exist "!OUTPUT!" del "!OUTPUT!"
if exist "!OUTPUT_TEMP!" del "!OUTPUT_TEMP!"
if exist "!TEMP_FILE!" del "!TEMP_FILE!"

echo Analyzing image border...

:: Sample the border pixels and get average color
"!CONVERT!" "!INPUT!" -format "%%[pixel:u.p{0,0}]" info: > "!TEMP_FILE!"
set /p BORDER_COLOR=<"!TEMP_FILE!"
del "!TEMP_FILE!" 2>nul

echo Detected border color: !BORDER_COLOR!

:: Prompt for fuzz value
echo.
echo The fuzz value controls how strict the color matching is:
echo  - Low values (0-10%%) = Only remove exact or very similar colors
echo  - Medium values (10-30%%) = Remove somewhat similar background colors
echo  - Higher values (30-70%%) = More aggressive background removal
echo  - Very high values (70-100%%) = May affect non-background areas
echo.
set /p FUZZ=Enter fuzz value (0-100, default is 10): 

:: Validate input (use default if not a number or out of range)
echo !FUZZ!|findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo Invalid input, using default value of 10
    set "FUZZ=10"
) else (
    if !FUZZ! GTR 100 (
        echo Value too high, using maximum value of 100
        set "FUZZ=100"
    )
)

:: Ask about trimming
echo.
echo Do you want to trim transparent edges after background removal?
echo  - Trimming removes empty transparent space around the image
echo  - This produces a tightly cropped result
echo.
set /p TRIM=Trim transparent edges? (Y/N, default is Y): 

:: Convert to uppercase for easier comparison
set "TRIM=!TRIM:y=Y!"
set "TRIM=!TRIM:n=N!"

:: Default to Y if input is invalid
if not "!TRIM!"=="Y" if not "!TRIM!"=="N" (
    echo Invalid input, using default (Y)
    set "TRIM=Y"
)

:: Ask about preserving inner areas
echo.
echo Do you want to preserve inner areas of the same color?
echo  - Yes: Only removes background color from borders
echo  - No: Removes all pixels of the background color
echo  - (Advanced option that works best with solid background colors)
echo.
set /p PRESERVE_INNER=Preserve inner areas? (Y/N, default is N): 

:: Convert to uppercase for easier comparison
set "PRESERVE_INNER=!PRESERVE_INNER:y=Y!"
set "PRESERVE_INNER=!PRESERVE_INNER:n=N!"

:: Default to N if input is invalid
if not "!PRESERVE_INNER!"=="Y" if not "!PRESERVE_INNER!"=="N" (
    echo Invalid input, using default (N)
    set "PRESERVE_INNER=N"
)

:: Remove background based on border color
echo.
echo Removing background with fuzz value: !FUZZ!%%...
echo This may take a moment, please wait...

:: Choose removal method based on user preference
if "!PRESERVE_INNER!"=="Y" (
    echo Using border-only removal method...
    
    :: Try to use flood-fill from the edges only
    "!CONVERT!" "!INPUT!" ^
        -bordercolor "!BORDER_COLOR!" -border 1x1 ^
        -fill none -fuzz !FUZZ!%% -draw "matte 0,0 floodfill" ^
        -shave 1x1 "!OUTPUT_TEMP!" 2>nul
    
    :: Check if the operation was successful
    if !errorlevel! neq 0 (
        echo Border-only removal failed, falling back to standard method...
        "!CONVERT!" "!INPUT!" -fuzz !FUZZ!%% -transparent "!BORDER_COLOR!" "!OUTPUT_TEMP!"
    )
) else (
    :: Standard removal (all matching pixels)
    "!CONVERT!" "!INPUT!" -fuzz !FUZZ!%% -transparent "!BORDER_COLOR!" "!OUTPUT_TEMP!"
)

:: Trim transparent borders if requested
if "!TRIM!"=="Y" (
    echo Cropping transparent edges...
    "!CONVERT!" "!OUTPUT_TEMP!" -trim +repage "!OUTPUT!"
    if exist "!OUTPUT_TEMP!" del "!OUTPUT_TEMP!"
) else (
    echo Skipping trim operation...
    move /y "!OUTPUT_TEMP!" "!OUTPUT!" >nul
)

:: Check if conversion was successful
if !errorlevel! equ 0 (
    color 0A
    echo.
    if "!TRIM!"=="Y" (
        echo Background removal and cropping complete: !OUTPUT!
    ) else (
        echo Background removal complete: !OUTPUT!
    )
) else (
    color 0C
    echo.
    echo Error: Processing failed with error code !errorlevel!
)

endlocal
echo.
echo Press any key to close this window...
pause > nul 