param([string]$EditorPath = (Join-Path $env:LOCALAPPDATA 'Unity/Editors/6000.3.23f1/Editor/Unity.exe'))
$ErrorActionPreference = 'Stop'
$demoProject = Join-Path $PSScriptRoot 'FresnelContainerDemo'
$demoOutput = Join-Path (Split-Path $PSScriptRoot -Parent) 'output/unity'
if (-not (Test-Path -LiteralPath $EditorPath -PathType Leaf)) { throw 'Unity 6000.3.23f1 is missing; supply -EditorPath for your Unity 6.3 installation.' }
New-Item -ItemType Directory -Path $demoOutput -Force | Out-Null
$demoLog = Join-Path $demoOutput 'build.log'
$demoArgs = @('-batchmode', '-buildTarget', 'Win64', '-projectPath', ('"' + $demoProject + '"'), '-executeMethod', 'Fresnel.UnityDemo.Editor.DemoBuilder.BuildBatch', '-logFile', ('"' + $demoLog + '"'))
$demoProcess = Start-Process -FilePath $EditorPath -ArgumentList $demoArgs -WindowStyle Hidden -PassThru
if (-not $demoProcess.WaitForExit(600000)) { $demoProcess.Kill(); throw "Unity build timed out. See $demoLog" }
if ($demoProcess.ExitCode -ne 0) { throw "Unity build failed. See $demoLog" }
Write-Output (Join-Path $demoProject 'Builds/Windows/FresnelContainerDemo.exe')
