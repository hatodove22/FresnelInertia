param(
    [string]$EditorPath = (Join-Path $env:LOCALAPPDATA 'Unity/Editors/6000.3.23f1/Editor/Unity.exe'),
    [string]$AndroidToolsPath = '',
    [switch]$IncludeArmV7
)
$ErrorActionPreference = 'Stop'
$demoProject = Join-Path $PSScriptRoot 'FresnelContainerDemo'
$demoOutput = Join-Path (Split-Path $PSScriptRoot -Parent) 'output/unity'
if (-not (Test-Path -LiteralPath $EditorPath -PathType Leaf)) { throw 'Unity 6000.3.23f1 is missing; supply -EditorPath for your Unity 6.3 installation.' }
if ($AndroidToolsPath -and -not (Test-Path -LiteralPath $AndroidToolsPath -PathType Container)) { throw 'AndroidToolsPath must name a Unity AndroidPlayer directory.' }
New-Item -ItemType Directory -Path $demoOutput -Force | Out-Null
$demoLog = Join-Path $demoOutput 'build-android.log'
$previousTools = $env:FRESNEL_ANDROID_TOOLS
$previousArmV7 = $env:FRESNEL_ANDROID_ARMV7
try {
    # A fresh APK avoids unused ZIP regions left by incremental Android packaging.
    # Keep compiled Gradle/IL2CPP caches and the previous delivery APK available.
    $packagingRoot = [IO.Path]::GetFullPath((Join-Path $demoProject 'Library/Bee/Android/Prj/IL2CPP/Gradle/launcher/build/outputs/apk/debug'))
    $generatedApk = [IO.Path]::GetFullPath((Join-Path $packagingRoot 'launcher-debug.apk'))
    $projectRoot = [IO.Path]::GetFullPath($demoProject).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $packagingRoot.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetDirectoryName($generatedApk) -ne $packagingRoot) {
        throw 'Generated APK path is outside the expected project packaging directory.'
    }
    if (Test-Path -LiteralPath $generatedApk -PathType Leaf) { Remove-Item -LiteralPath $generatedApk }
    if ($AndroidToolsPath) { $env:FRESNEL_ANDROID_TOOLS = (Resolve-Path -LiteralPath $AndroidToolsPath).Path }
    $env:FRESNEL_ANDROID_ARMV7 = if ($IncludeArmV7) { '1' } else { '0' }
    $demoArgs = @('-batchmode', '-buildTarget', 'Android', '-projectPath', ('"' + $demoProject + '"'), '-executeMethod', 'Fresnel.UnityDemo.Editor.AndroidDemoBuilder.BuildBatch', '-logFile', ('"' + $demoLog + '"'))
    $demoProcess = Start-Process -FilePath $EditorPath -ArgumentList $demoArgs -WindowStyle Hidden -PassThru
    if (-not $demoProcess.WaitForExit(1200000)) { $demoProcess.Kill(); throw "Android build timed out. See $demoLog" }
    if ($demoProcess.ExitCode -ne 0) { throw "Android build failed. See $demoLog" }
    Write-Output (Join-Path $demoProject 'Builds/Android/FresnelContainerDemo.apk')
}
finally {
    $env:FRESNEL_ANDROID_TOOLS = $previousTools
    $env:FRESNEL_ANDROID_ARMV7 = $previousArmV7
}
