$ErrorActionPreference = "Continue"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$env:KMP_DUPLICATE_LIB_OK = "TRUE"

& "D:\TOOLS\anaconda\python.exe" "app.py" *> (Join-Path $projectRoot "backend.log")
