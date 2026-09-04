[CmdletBinding()]
param(
  [string]$PioExecutable = "pio",
  [string]$PioArduinoCoreDir = (
    Join-Path ([Environment]::GetFolderPath("UserProfile")) ".pioarduino-pch"
  )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$standardEnvironments = @(
  "m5stack-sticks3",
  "m5stack-sticks3-audio",
  "m5stack-sticks3-audio-storageless",
  "m5stack-sticks3-audio-direct-display",
  "m5stack-sticks3-audio-smoke",
  "m5stack-sticks3-display-probe",
  "m5stack-sticks3-main-boot-probe",
  "m5stack-sticks3-main-pipeline-probe",
  "m5stack-sticks3-main-loop-probe",
  "m5stack-sticks3-main-audio-probe",
  "m5stack-sticks3-main-delta-probe",
  "m5stack-sticks3-transducer-probe",
  "m5stack-sticks3-raw-i2s-probe",
  "m5stack-sticks3-remote",
  "m5stack-sticks3-tilt",
  "m5stack-atoms3-dxl2-probe",
  "m5stack-atoms3-dxl2-provision-id2",
  "m5stack-atoms3-dxl2-motion-probe",
  "m5stack-atoms3-max98357a-tdm-probe",
  "m5stack-atoms3-combined-probe",
  "m5stack-atoms3-pipeline"
)
$pioArduinoEnvironment = "m5stack-sticks3-audio-smoke-pioarduino"
$completedEnvironments = [System.Collections.Generic.List[string]]::new()

function Invoke-FirmwareBuild {
  param([Parameter(Mandatory = $true)][string]$EnvironmentName)

  Write-Output "BUILD $EnvironmentName"
  & $PioExecutable run -e $EnvironmentName
  if ($LASTEXITCODE -ne 0) {
    throw "PlatformIO build failed for $EnvironmentName (exit $LASTEXITCODE)."
  }
  $completedEnvironments.Add($EnvironmentName)
  Write-Output "PASS $EnvironmentName"
}

$previousCoreDir = $env:PLATFORMIO_CORE_DIR
Push-Location $repositoryRoot
try {
  foreach ($environmentName in $standardEnvironments) {
    Invoke-FirmwareBuild -EnvironmentName $environmentName
  }

  # Official espressif32 and pioarduino intentionally publish packages with
  # identical names but incompatible versions. Keep the pioarduino smoke
  # environment in a separate, short cache so a sequential Windows matrix is
  # deterministic and does not hit MAX_PATH during first-time extraction.
  $env:PLATFORMIO_CORE_DIR = $PioArduinoCoreDir
  Invoke-FirmwareBuild -EnvironmentName $pioArduinoEnvironment
} finally {
  if ($null -eq $previousCoreDir) {
    Remove-Item Env:PLATFORMIO_CORE_DIR -ErrorAction SilentlyContinue
  } else {
    $env:PLATFORMIO_CORE_DIR = $previousCoreDir
  }
  Pop-Location
}

Write-Output "ALL_PASS $($completedEnvironments.Count)"
