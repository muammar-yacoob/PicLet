' PicLet Hidden Launcher
' Runs WSL commands without showing cmd.exe window
' Usage: wscript.exe launcher.vbs <tool> <filepath> <flags>

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set args = WScript.Arguments

If args.Count < 2 Then
    WScript.Quit 1
End If

tool = args(0)
filePath = args(1)

' Get the directory where this script is located
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
loadingHta = scriptDir & "\gui\loading.hta"

' Show frameless loading window immediately using HTA
If fso.FileExists(loadingHta) Then
    WshShell.Run "mshta """ & loadingHta & """", 1, False
End If

' Convert Windows path to WSL path format
' D:\path\to\file.png -> /mnt/d/path/to/file.png
If Mid(filePath, 2, 1) = ":" Then
    driveLetter = LCase(Left(filePath, 1))
    restOfPath = Mid(filePath, 3)
    restOfPath = Replace(restOfPath, "\", "/")
    wslPath = "/mnt/" & driveLetter & restOfPath
Else
    wslPath = Replace(filePath, "\", "/")
End If

' Build flags from remaining arguments
flags = ""
For i = 2 To args.Count - 1
    flags = flags & " " & args(i)
Next

' Run wsl command hidden (0 = hidden, False = don't wait)
cmd = "wsl piclet " & tool & " """ & wslPath & """" & flags
WshShell.Run cmd, 0, False
