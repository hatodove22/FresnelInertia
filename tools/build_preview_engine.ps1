# Rebuild the checked-in browser-only production engine. npm build needs no SDK.
[CmdletBinding()]
param([string]$EmscriptenRoot)

$ErrorActionPreference = 'Stop'
$previewRepository = Split-Path -Parent $PSScriptRoot
if (-not $EmscriptenRoot) {
  $previewEditorRoot = Join-Path $env:ProgramFiles 'Unity/Hub/Editor'
  $EmscriptenRoot = Get-ChildItem -LiteralPath $previewEditorRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object { Join-Path $_.FullName 'Editor/Data/PlaybackEngines/WebGLSupport/BuildTools/Emscripten' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'emscripten/em++.py') } |
    Select-Object -First 1
}
if (-not $EmscriptenRoot) { throw 'An existing Emscripten SDK is needed only to regenerate the preview; none was installed.' }
$EmscriptenRoot = (Resolve-Path -LiteralPath $EmscriptenRoot).Path
$previewPython = Join-Path $EmscriptenRoot 'python/python.exe'
$previewConfig = Join-Path $EmscriptenRoot '.emscripten'
foreach ($previewRequired in @($previewPython, $previewConfig)) {
  if (-not (Test-Path -LiteralPath $previewRequired)) { throw "Missing SDK file: $previewRequired" }
}
$previewPreviousConfig = $env:EM_CONFIG
$previewPreviousCache = $env:EM_CACHE
$previewPreviousFrozen = $env:EM_FROZEN_CACHE
Push-Location $previewRepository
try {
  $env:EM_CONFIG = $previewConfig
  Remove-Item Env:EM_CACHE -ErrorAction SilentlyContinue
  $env:EM_FROZEN_CACHE = '1'
  $previewOutput = Join-Path $previewRepository 'webxr/src/lab/generated'
  New-Item -ItemType Directory -Path $previewOutput -Force | Out-Null
  $previewSources = @('HapticSynthesisCore', 'MassMotionLayer', 'MotionActivityFilter', 'EventLayer', 'TextureLayer', 'ResonanceLayer', 'SpatialRenderer4', 'TiltPseudoForceModel') |
    ForEach-Object { "src/$_.cpp" }
  $previewArguments = @('-std=gnu++17', '-O2', '-Wall', '-Wextra', '-Wpedantic', '-I', 'include', '-DHAPTICS_PREVIEW_ENGINE=1') +
    $previewSources + @('src/preview_engine_main.cpp', '--no-entry', '-sMODULARIZE=1', '-sEXPORT_ES6=1',
      '-sEXPORT_NAME=createPreviewEngineModule', '-sENVIRONMENT=web,worker', '-sSINGLE_FILE=1',
      '-sEXPORTED_RUNTIME_METHODS=["ccall"]', '-sALLOW_MEMORY_GROWTH=1',
      '-o', (Join-Path $previewOutput 'preview-engine.js'))
  Write-Host 'Compiling browser preview from production C++ layers; no firmware or device access.'
  & $previewPython -E (Join-Path $EmscriptenRoot 'emscripten/em++.py') @previewArguments
  if ($LASTEXITCODE -ne 0) { throw "Preview engine compilation failed ($LASTEXITCODE)." }
  Write-Host 'Generated webxr/src/lab/generated/preview-engine.js (ES module with embedded Wasm).'
} finally {
  Pop-Location
  foreach ($previewEntry in @(@('EM_CONFIG', $previewPreviousConfig), @('EM_CACHE', $previewPreviousCache), @('EM_FROZEN_CACHE', $previewPreviousFrozen))) {
    if ($null -eq $previewEntry[1]) { Remove-Item "Env:$($previewEntry[0])" -ErrorAction SilentlyContinue }
    else { Set-Item "Env:$($previewEntry[0])" $previewEntry[1] }
  }
}
