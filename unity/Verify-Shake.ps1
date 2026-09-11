param([switch]$Visible,[switch]$Uncapped,[switch]$WaterNormals,[switch]$NoCapture)
$ErrorActionPreference = 'Stop'
$shakeExecutable = Join-Path $PSScriptRoot 'FresnelContainerDemo/Builds/Windows/FresnelContainerDemo.exe'
$shakeEvidence = Join-Path (Split-Path $PSScriptRoot -Parent) 'output/unity'
$shakeLog = Join-Path $shakeEvidence 'shake-review-player.log'
if (-not (Test-Path -LiteralPath $shakeExecutable -PathType Leaf)) { throw 'Build the Windows demo first.' }
New-Item -ItemType Directory -Path $shakeEvidence -Force | Out-Null
$shakeArgs = @('--shake-review','--evidence-dir',('"'+$shakeEvidence+'"'),'-screen-width','1600','-screen-height','900','-screen-fullscreen','0','-logFile',('"'+$shakeLog+'"'))
if ($Uncapped) { $shakeArgs += '--uncapped' }
if ($WaterNormals) { $shakeArgs += '--water-normals' }
if ($NoCapture) { $shakeArgs += '--no-captures' }
$shakeStarted = [DateTime]::UtcNow
$shakeStyle = if ($Visible) { 'Normal' } else { 'Hidden' }
$shakeProcess = Start-Process -FilePath $shakeExecutable -ArgumentList $shakeArgs -WindowStyle $shakeStyle -PassThru
if (-not $shakeProcess.WaitForExit(150000)) { $shakeProcess.Kill(); throw "Shake review timed out. See $shakeLog" }
$shakePointer = Join-Path $shakeEvidence 'shake-review-latest.txt'
if (-not (Test-Path -LiteralPath $shakePointer -PathType Leaf) -or (Get-Item -LiteralPath $shakePointer).LastWriteTimeUtc -lt $shakeStarted) { throw 'No fresh shake evidence.' }
$shakeRun = (Get-Content -LiteralPath $shakePointer -Raw).Trim()
$shakeReport = Get-Content -LiteralPath (Join-Path $shakeRun 'shake-review.txt') -Raw
Write-Output $shakeReport
Write-Output "Evidence: $shakeRun"
if ($shakeProcess.ExitCode -ne 0 -or $shakeReport -notmatch '(?m)^Runtime errors: 0\r?$' -or (Select-String -LiteralPath $shakeLog -Pattern 'Exception:|Shader error|FRESNEL_SHAKE_REVIEW FAIL')) { throw "Shake review failed. See $shakeRun" }
