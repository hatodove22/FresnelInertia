param([switch]$Visible)
$ErrorActionPreference = 'Stop'
$demoExecutable = Join-Path $PSScriptRoot 'FresnelContainerDemo/Builds/Windows/FresnelContainerDemo.exe'
$demoEvidence = Join-Path (Split-Path $PSScriptRoot -Parent) 'output/unity'
if (-not (Test-Path -LiteralPath $demoExecutable -PathType Leaf)) { throw 'Build the Windows demo first.' }
New-Item -ItemType Directory -Path $demoEvidence -Force | Out-Null
$demoArgs = @('--smoke-test', '--evidence-dir', ('"' + $demoEvidence + '"'), '-screen-width', '1280', '-screen-height', '800', '-screen-fullscreen', '0', '-logFile', ('"' + (Join-Path $demoEvidence 'player.log') + '"'))
$demoWindowStyle = if ($Visible) { 'Normal' } else { 'Hidden' }
$demoProcess = Start-Process -FilePath $demoExecutable -ArgumentList $demoArgs -WindowStyle $demoWindowStyle -PassThru
if (-not $demoProcess.WaitForExit(70000)) { $demoProcess.Kill(); throw 'Demo verification timed out.' }
if ($demoProcess.ExitCode -ne 0) { throw "Demo verification failed. See $demoEvidence" }
Get-Content -LiteralPath (Join-Path $demoEvidence 'verification.txt')
