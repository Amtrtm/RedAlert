Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & Replace(WScript.ScriptFullName, WScript.ScriptName, "") & "RedAlert.exe" & Chr(34), 0, False
