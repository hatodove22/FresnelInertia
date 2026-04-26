param(
  [int]$Port = 8082,
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$PreviewOut = Join-Path $Root "webxr-preview.out.log"
$PreviewErr = Join-Path $Root "webxr-preview.err.log"
$TunnelOut = Join-Path $Root "webxr-cloudflared.out.log"
$TunnelErr = Join-Path $Root "webxr-cloudflared.err.log"

function Test-LocalPreview {
  param([int]$PreviewPort)
  try {
    curl.exe -k -I "https://127.0.0.1:$PreviewPort" --max-time 3 *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Stop-Tree {
  param([int]$ProcessId)
  $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessId }
  foreach ($child in $children) {
    Stop-Tree -ProcessId $child.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

$previewProcess = $null
$tunnelProcess = $null

try {
  if (-not $NoBuild) {
    Write-Host "Building WebXR app..."
    npm.cmd run build
  }

  if (-not (Test-LocalPreview -PreviewPort $Port)) {
    Remove-Item -LiteralPath $PreviewOut, $PreviewErr -ErrorAction SilentlyContinue
    Write-Host "Starting local production preview on https://127.0.0.1:$Port ..."
    $previewProcess = Start-Process `
      -FilePath "npm.cmd" `
      -ArgumentList @("run", "preview", "--", "--host", "127.0.0.1", "--port", "$Port") `
      -WorkingDirectory $Root `
      -RedirectStandardOutput $PreviewOut `
      -RedirectStandardError $PreviewErr `
      -PassThru

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-LocalPreview -PreviewPort $Port) {
        $ready = $true
        break
      }
      if ($previewProcess.HasExited) {
        throw "Preview server exited early. See $PreviewOut and $PreviewErr"
      }
    }
    if (-not $ready) {
      throw "Preview server did not become reachable on port $Port."
    }
  } else {
    Write-Host "Reusing existing preview at https://127.0.0.1:$Port"
  }

  Remove-Item -LiteralPath $TunnelOut, $TunnelErr -ErrorAction SilentlyContinue
  Write-Host "Starting Cloudflare Quick Tunnel..."
  $tunnelProcess = Start-Process `
    -FilePath "npx.cmd" `
    -ArgumentList @("cloudflared", "tunnel", "--url", "https://127.0.0.1:$Port", "--no-tls-verify", "--loglevel", "info") `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $TunnelOut `
    -RedirectStandardError $TunnelErr `
    -PassThru

  $publicUrl = $null
  for ($i = 0; $i -lt 80; $i++) {
    Start-Sleep -Milliseconds 500
    $logs = ""
    if (Test-Path $TunnelOut) { $logs += "`n" + (Get-Content $TunnelOut -Raw -ErrorAction SilentlyContinue) }
    if (Test-Path $TunnelErr) { $logs += "`n" + (Get-Content $TunnelErr -Raw -ErrorAction SilentlyContinue) }
    $match = [regex]::Match($logs, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($match.Success) {
      $publicUrl = $match.Value
      break
    }
    if ($tunnelProcess.HasExited) {
      throw "Cloudflare tunnel exited early. See $TunnelOut and $TunnelErr"
    }
  }

  if (-not $publicUrl) {
    throw "Cloudflare tunnel URL was not found in the logs."
  }

  Write-Host ""
  Write-Host "Quest URL:"
  Write-Host $publicUrl
  Write-Host ""
  Write-Host "Open this URL in Quest Browser. Press Ctrl+C here to stop the tunnel."

  while (-not $tunnelProcess.HasExited) {
    Start-Sleep -Seconds 1
  }
} finally {
  if ($tunnelProcess -and -not $tunnelProcess.HasExited) {
    Stop-Tree -ProcessId $tunnelProcess.Id
  }
  if ($previewProcess -and -not $previewProcess.HasExited) {
    Stop-Tree -ProcessId $previewProcess.Id
  }
}
