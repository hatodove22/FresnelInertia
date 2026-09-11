param(
    [string]$UnityEditor = (Join-Path $env:LOCALAPPDATA 'Unity/Editors/6000.3.23f1/Editor'),
    [string]$NewtonsoftAssembly = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$artifacts = Join-Path $repoRoot 'output/unity/link-protocol'
$mono = Join-Path $UnityEditor 'Data/MonoBleedingEdge/bin/mono.exe'
$compiler = Join-Path $UnityEditor 'Data/MonoBleedingEdge/lib/mono/4.5/csc.exe'
$facade = Join-Path $UnityEditor 'Data/MonoBleedingEdge/lib/mono/4.5/Facades/netstandard.dll'
$project = Join-Path $repoRoot 'unity/FresnelContainerDemo'
foreach ($tool in @($mono, $compiler, $facade)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
        throw "Unity compiler component is missing: $tool. Supply -UnityEditor with your Unity 6.3 Editor directory."
    }
}
if ($NewtonsoftAssembly) {
    $json = (Resolve-Path -LiteralPath $NewtonsoftAssembly).Path
}
else {
    $packageName = 'com.unity.nuget.newtonsoft-json'
    $manifest = Get-Content -LiteralPath (Join-Path $project 'Packages/manifest.json') -Raw | ConvertFrom-Json
    $expectedVersion = $manifest.dependencies.$packageName
    $lockPath = Join-Path $project 'Packages/packages-lock.json'
    if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
        $packageLock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
        if ($packageLock.dependencies.$packageName.version) {
            $expectedVersion = $packageLock.dependencies.$packageName.version
        }
    }
    # Unity 6 names resolved cache directories with content hashes. Read their
    # package metadata rather than assuming an @version directory name.
    $cache = Join-Path $project 'Library/PackageCache'
    $candidates = @()
    if (Test-Path -LiteralPath $cache -PathType Container) {
        $candidates = @(Get-ChildItem -LiteralPath $cache -Directory -Filter "$packageName@*" | Sort-Object Name)
    }
    $json = $null
    foreach ($candidate in $candidates) {
        $metadataPath = Join-Path $candidate.FullName 'package.json'
        if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) { continue }
        $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
        $assemblyPath = Join-Path $candidate.FullName 'Runtime/Newtonsoft.Json.dll'
        if ($metadata.name -eq $packageName -and $metadata.version -eq $expectedVersion -and
            (Test-Path -LiteralPath $assemblyPath -PathType Leaf)) {
            $json = $assemblyPath
            break
        }
    }
    if (-not $json) {
        throw "Resolved $packageName $expectedVersion was not found. Open/build the Unity project to restore packages, or supply -NewtonsoftAssembly."
    }
}
if (-not (Test-Path -LiteralPath $json -PathType Leaf)) { throw 'NewtonsoftAssembly must name a DLL file.' }
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
$source = Join-Path $repoRoot 'unity/FresnelContainerDemo/Assets/Scripts/Link'
$program = Join-Path $PSScriptRoot 'Program.cs'
$exe = Join-Path $artifacts 'LinkProtocolRegression.exe'
$files = @('HapticLinkProtocol.cs', 'HapticLinkClient.cs', 'WindowsSerialTransport.cs', 'MockHapticTransport.cs', 'DemoLoopbackTransport.cs', 'ProtocolRegression.cs') | ForEach-Object { Join-Path $source $_ }
& $mono $compiler /nologo /debug:portable /langversion:latest /define:FRESNEL_WINDOWS_TEST /target:exe "/out:$exe" "/r:$json" "/r:$facade" $files $program
if ($LASTEXITCODE -ne 0) { throw 'Protocol regression compilation failed' }
Copy-Item -LiteralPath $json -Destination (Join-Path $artifacts 'Newtonsoft.Json.dll') -Force
$samples = Join-Path $artifacts 'canonical-samples.json'
& $mono --debug $exe $samples
if ($LASTEXITCODE -ne 0) { throw 'Protocol regression failed' }
& node (Join-Path $PSScriptRoot 'validate-schema.mjs') $samples
if ($LASTEXITCODE -ne 0) { throw 'Canonical snapshot schema validation failed' }
