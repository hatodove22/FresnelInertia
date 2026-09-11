param([switch]$Visible,[string]$EditorPath = (Join-Path $env:LOCALAPPDATA 'Unity/Editors/6000.3.23f1/Editor/Unity.exe'),[switch]$PlayerOnly)
$ErrorActionPreference = 'Stop'
$studioProject = Join-Path $PSScriptRoot 'FresnelContainerDemo'
$studioEvidence = Join-Path (Split-Path $PSScriptRoot -Parent) 'output/unity'
New-Item -ItemType Directory -Path $studioEvidence -Force | Out-Null
if (-not $PlayerOnly) {
    if (-not (Test-Path -LiteralPath $EditorPath -PathType Leaf)) { throw 'Unity 6000.3.23f1 is missing; supply -EditorPath for your Unity 6.3 installation.' }
    $studioArgs = @('-batchmode','-quit','-buildTarget','Win64','-projectPath',('"' + $studioProject + '"'),'-executeMethod','Fresnel.UnityDemo.Editor.StudioRegression.Run','-logFile',('"' + (Join-Path $studioEvidence 'studio-editor.log') + '"'))
    $studioProcess = Start-Process -FilePath $EditorPath -ArgumentList $studioArgs -WindowStyle Hidden -PassThru
    if (-not $studioProcess.WaitForExit(240000)) { $studioProcess.Kill(); throw 'Studio regression timed out.' }
    if ($studioProcess.ExitCode -ne 0) { throw "Studio regression failed. See $studioEvidence/studio-editor.log" }
    Get-Content -LiteralPath (Join-Path $studioEvidence 'studio-regression.txt')
}
$studioExecutable = Join-Path $studioProject 'Builds/Windows/FresnelContainerDemo.exe'
if (-not (Test-Path -LiteralPath $studioExecutable -PathType Leaf)) { throw 'Build the Windows demo first.' }
$studioArgs = @('--studio-test','--evidence-dir',('"' + $studioEvidence + '"'),'-screen-width','1280','-screen-height','800','-screen-fullscreen','0','-logFile',('"' + (Join-Path $studioEvidence 'studio-player.log') + '"'))
$studioStyle = if ($Visible) { 'Normal' } else { 'Hidden' }
$studioProcess = Start-Process -FilePath $studioExecutable -ArgumentList $studioArgs -WindowStyle $studioStyle -PassThru
if (-not $studioProcess.WaitForExit(130000)) { $studioProcess.Kill(); throw 'Studio player verification timed out.' }
if ($studioProcess.ExitCode -ne 0) { throw "Studio player verification failed. See $studioEvidence/studio-runtime.txt" }
Get-Content -LiteralPath (Join-Path $studioEvidence 'studio-runtime.txt')
