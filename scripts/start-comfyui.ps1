# Start ComfyUI with CPU speed optimizations for Consequences Local engine.
# Usage: .\scripts\start-comfyui.ps1
# Requires ComfyUI at $env:COMFYUI_HOME or C:\Users\<you>\ComfyUI

$ComfyHome = if ($env:COMFYUI_HOME) { $env:COMFYUI_HOME } else { "$env:USERPROFILE\ComfyUI" }
$Python = Join-Path $ComfyHome "venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
  Write-Error "ComfyUI venv not found at $Python — set COMFYUI_HOME or install ComfyUI first."
  exit 1
}

# Stop any existing ComfyUI on port 8188 (duplicate processes slow everything down).
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
  Where-Object { $_.CommandLine -match "main\.py.*8188" } |
  ForEach-Object {
    Write-Host "Stopping ComfyUI pid $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Start-Sleep -Seconds 1

Push-Location $ComfyHome
Write-Host "Starting ComfyUI (CPU + --fast + split attention) at http://127.0.0.1:8188 ..."
& $Python main.py --listen 127.0.0.1 --port 8188 --cpu --fast --use-split-cross-attention
Pop-Location
