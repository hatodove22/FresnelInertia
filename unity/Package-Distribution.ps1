param()
$ErrorActionPreference = 'Stop'
$distributionPackage = Join-Path $PSScriptRoot 'FresnelContainerDemo/Packages/com.fresnel.container-materials'
$distributionBuilds = Join-Path $PSScriptRoot 'FresnelContainerDemo/Builds'
New-Item -ItemType Directory -Path $distributionBuilds -Force | Out-Null
Push-Location -LiteralPath $distributionPackage
try {
    $distributionResult = & npm.cmd pack --json --pack-destination $distributionBuilds
    if ($LASTEXITCODE -ne 0) { throw 'UPM package creation failed.' }
    ($distributionResult -join "`n" | ConvertFrom-Json) | Select-Object filename,size,entryCount
} finally { Pop-Location }
& python (Join-Path $PSScriptRoot 'package_distribution.py')
if ($LASTEXITCODE -ne 0) { throw 'Distribution validation failed.' }
