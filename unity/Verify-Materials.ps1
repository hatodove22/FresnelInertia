param([switch]$Visible)
$ErrorActionPreference = 'Stop'
$materialsExecutable = Join-Path $PSScriptRoot 'FresnelContainerDemo/Builds/Windows/FresnelContainerDemo.exe'
$materialsEvidence = Join-Path (Split-Path $PSScriptRoot -Parent) 'output/unity'
if (-not (Test-Path -LiteralPath $materialsExecutable -PathType Leaf)) { throw 'Build the Windows demo first.' }
New-Item -ItemType Directory -Path $materialsEvidence -Force | Out-Null
$materialsLog = Join-Path $materialsEvidence 'materials-player.log'
$materialsArgs = @('--materials-test', '--evidence-dir', ('"' + $materialsEvidence + '"'), '-screen-width', '1600', '-screen-height', '900', '-screen-fullscreen', '0', '-logFile', ('"' + $materialsLog + '"'))
$materialsStyle = if ($Visible) { 'Normal' } else { 'Hidden' }
$materialsStarted = [DateTime]::UtcNow
$materialsProcess = Start-Process -FilePath $materialsExecutable -ArgumentList $materialsArgs -WindowStyle $materialsStyle -PassThru
if (-not $materialsProcess.WaitForExit(200000)) { $materialsProcess.Kill(); throw "Materials verification timed out. See $materialsLog" }
$materialsPointer = Join-Path $materialsEvidence 'materials-latest.txt'
if (-not (Test-Path -LiteralPath $materialsPointer -PathType Leaf) -or (Get-Item -LiteralPath $materialsPointer).LastWriteTimeUtc -lt $materialsStarted) {
    throw "The player did not create evidence for this materials run. Rebuild with --materials-test support. See $materialsLog"
}
$materialsRun = (Get-Content -LiteralPath $materialsPointer -Raw).Trim()
$materialsReport = Join-Path $materialsRun 'materials-runtime.txt'
$materialsPassed = $false
if (Test-Path -LiteralPath $materialsReport -PathType Leaf) {
    $materialsText = Get-Content -LiteralPath $materialsReport -Raw
    Write-Output $materialsText
    $materialsPassed = $materialsText -match '(?m)^ERRORS: 0\r?$'
}
$materialsRuntimeErrors = Select-String -LiteralPath $materialsLog -Pattern 'Exception:|Shader error|FRESNEL_MATERIALS_VERIFICATION FAIL' -ErrorAction SilentlyContinue
if ($materialsProcess.ExitCode -ne 0 -or -not $materialsPassed -or $materialsRuntimeErrors) { throw "Materials verification failed. See $materialsRun and $materialsLog" }
Write-Output "Evidence: $materialsRun"
