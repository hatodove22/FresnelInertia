param([switch]$Visible,[switch]$Uncapped)
$ErrorActionPreference = 'Stop'
$visualExecutable = Join-Path $PSScriptRoot 'FresnelContainerDemo/Builds/Windows/FresnelContainerDemo.exe'
$visualEvidence = Join-Path (Split-Path $PSScriptRoot -Parent) 'output/unity'
if (-not (Test-Path -LiteralPath $visualExecutable -PathType Leaf)) { throw 'Build the Windows demo first.' }
New-Item -ItemType Directory -Path $visualEvidence -Force | Out-Null
$visualLog = Join-Path $visualEvidence 'visual-review-player.log'
$visualArgs = @('--visual-review','--evidence-dir',('"'+$visualEvidence+'"'),'-screen-width','1600','-screen-height','900','-screen-fullscreen','0','-logFile',('"'+$visualLog+'"'))
if ($Uncapped) { $visualArgs += '--uncapped' }
$visualStarted = [DateTime]::UtcNow
$visualStyle = if ($Visible) { 'Normal' } else { 'Hidden' }
$visualProcess = Start-Process -FilePath $visualExecutable -ArgumentList $visualArgs -WindowStyle $visualStyle -PassThru
if (-not $visualProcess.WaitForExit(120000)) { $visualProcess.Kill(); throw "Visual review timed out. See $visualLog" }
$visualPointer = Join-Path $visualEvidence 'visual-review-latest.txt'
if (-not (Test-Path -LiteralPath $visualPointer -PathType Leaf) -or (Get-Item -LiteralPath $visualPointer).LastWriteTimeUtc -lt $visualStarted) { throw 'This run did not produce fresh visual evidence.' }
$visualRun = (Get-Content -LiteralPath $visualPointer -Raw).Trim()
$visualReport = Get-Content -LiteralPath (Join-Path $visualRun 'visual-performance.txt') -Raw
if ($visualProcess.ExitCode -ne 0 -or $visualReport -notmatch '(?m)^Runtime errors: 0\r?$' -or
    (Select-String -LiteralPath $visualLog -Pattern 'Exception:|Shader error|FRESNEL_VISUAL_REVIEW FAIL')) { throw "Visual review failed. See $visualRun" }
Write-Output $visualReport
Write-Output "Evidence: $visualRun"
