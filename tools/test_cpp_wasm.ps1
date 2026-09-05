# Run the production C++ host tests with an already installed Unity Editor SDK.
# This is a Wasm/Node fallback, not proof of native Windows or hardware behavior.
# No installation, PlatformIO invocation, device access, or global setting changes.
[CmdletBinding()]
param(
  [string]$EmscriptenRoot,
  [string]$TestSource = 'test/native_layers/test_native_layers/test_main.cpp',
  [string[]]$Source,
  [string[]]$IncludeDirectory = @(),
  [string[]]$Define = @(),
  [ValidatePattern('^[a-zA-Z0-9_-]+$')]
  [string]$Name = 'native-layers',
  [switch]$WithoutUnity
)

$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
if (-not $EmscriptenRoot) {
  $editorRoot = Join-Path $env:ProgramFiles 'Unity/Hub/Editor'
  $EmscriptenRoot = Get-ChildItem -LiteralPath $editorRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object { Join-Path $_.FullName 'Editor/Data/PlaybackEngines/WebGLSupport/BuildTools/Emscripten' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'emscripten/em++.py') } |
    Select-Object -First 1
}
if (-not $EmscriptenRoot) {
  throw 'An installed Unity Editor WebGL Emscripten SDK is required; no software was installed.'
}
$EmscriptenRoot = (Resolve-Path -LiteralPath $EmscriptenRoot).Path
$python = Join-Path $EmscriptenRoot 'python/python.exe'
$node = Join-Path $EmscriptenRoot 'node/node.exe'
$config = Join-Path $EmscriptenRoot '.emscripten'
foreach ($required in @($python, $node, $config)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Missing SDK file: $required" }
}

$previousConfig = $env:EM_CONFIG
$previousCache = $env:EM_CACHE
$previousFrozen = $env:EM_FROZEN_CACHE
Push-Location $repository
try {
  $env:EM_CONFIG = $config
  Remove-Item Env:EM_CACHE -ErrorAction SilentlyContinue
  $env:EM_FROZEN_CACHE = '1'
  if (-not $Source) {
    $ini = Get-Content -Raw -LiteralPath 'platformio.ini'
    $native = [regex]::Match($ini, '(?ms)^\[env:native-layers\]\s*\r?\n(.*?)(?=^\[|\z)').Groups[1].Value
    $Source = @([regex]::Matches($native, '\+<([^>]+\.cpp)>') |
      ForEach-Object { Join-Path 'src' $_.Groups[1].Value })
    if (-not $Source.Count) { throw 'No explicit native-layer production sources found in platformio.ini.' }
  }
  foreach ($inputFile in @($TestSource) + $Source) {
    if (-not (Test-Path -LiteralPath $inputFile -PathType Leaf)) { throw "Missing source: $inputFile" }
  }
  $output = Join-Path $repository ".pio/build/$Name-wasm"
  New-Item -ItemType Directory -Path $output -Force | Out-Null
  $arguments = @('-std=gnu++17', '-O0', '-Wall', '-Wextra', '-Wpedantic', '-I', 'include')
  foreach ($directory in $IncludeDirectory) { $arguments += @('-I', $directory) }
  foreach ($definition in $Define) { $arguments += "-D$definition" }

  if (-not $WithoutUnity) {
    $unityRoot = '.pio/libdeps/native-layers/Unity'
    $manifest = Get-Content -Raw -LiteralPath "$unityRoot/library.json" | ConvertFrom-Json
    if ($manifest.version -ne '2.6.1') { throw 'The existing test dependency must be Unity 2.6.1.' }
    # Wasm32 supports int64, but Unity does not enable its assertions by default.
    $arguments += @('-DUNITY_SUPPORT_64', '-I', "$unityRoot/src")
    $unityObject = Join-Path $output 'unity.o'
    & $python -E (Join-Path $EmscriptenRoot 'emscripten/emcc.py') -O0 -DUNITY_SUPPORT_64 -I "$unityRoot/src" -c "$unityRoot/src/unity.c" -o $unityObject
    if ($LASTEXITCODE -ne 0) { throw "Unity compilation failed ($LASTEXITCODE)." }
    $Source += $unityObject
  }
  $executable = Join-Path $output 'tests.cjs'
  $arguments += $Source + @($TestSource, '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-sSINGLE_FILE=1', '-o', $executable)
  Write-Host "Compiling C++ as WebAssembly using $EmscriptenRoot"
  & $python -E (Join-Path $EmscriptenRoot 'emscripten/em++.py') @arguments
  if ($LASTEXITCODE -ne 0) { throw "C++ compilation failed ($LASTEXITCODE)." }
  Write-Host 'Running Wasm/Node tests (not native Windows or a hardware test).'
  & $node $executable
  if ($LASTEXITCODE -ne 0) { throw "C++ tests failed ($LASTEXITCODE)." }
} finally {
  Pop-Location
  foreach ($entry in @(@('EM_CONFIG', $previousConfig), @('EM_CACHE', $previousCache), @('EM_FROZEN_CACHE', $previousFrozen))) {
    if ($null -eq $entry[1]) {
      Remove-Item "Env:$($entry[0])" -ErrorAction SilentlyContinue
    } else {
      Set-Item "Env:$($entry[0])" $entry[1]
    }
  }
}
