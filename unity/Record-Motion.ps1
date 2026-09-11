param([switch]$Visible)
$ErrorActionPreference = 'Stop'
$filmExecutable = Join-Path $PSScriptRoot 'FresnelContainerDemo/Builds/Windows/FresnelContainerDemo.exe'
$filmEvidence = Join-Path (Split-Path $PSScriptRoot -Parent) 'output/unity'
$filmLog = Join-Path $filmEvidence 'motion-film-player.log'
$filmEncoder = (Get-Command ffmpeg -ErrorAction Stop).Source
$filmProbe = (Get-Command ffprobe -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $filmExecutable -PathType Leaf)) { throw 'Build the Windows demo first.' }
New-Item -ItemType Directory -Path $filmEvidence -Force | Out-Null
$filmStarted = [DateTime]::UtcNow
$filmStyle = if ($Visible) { 'Normal' } else { 'Hidden' }
$filmProcess = Start-Process -FilePath $filmExecutable -ArgumentList @('--motion-film','--evidence-dir',('"'+$filmEvidence+'"'),'-screen-width','1600','-screen-height','900','-screen-fullscreen','0','-logFile',('"'+$filmLog+'"')) -WindowStyle $filmStyle -PassThru
if (-not $filmProcess.WaitForExit(240000)) { $filmProcess.Kill(); throw "Film capture timed out. See $filmLog" }
$filmPointer = Join-Path $filmEvidence 'motion-film-latest.txt'
if ($filmProcess.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $filmPointer) -or (Get-Item -LiteralPath $filmPointer).LastWriteTimeUtc -lt $filmStarted) { throw "Film capture failed. See $filmLog" }
$filmRun = (Get-Content -LiteralPath $filmPointer -Raw).Trim()
$filmReport = Get-Content -LiteralPath (Join-Path $filmRun 'motion-film.txt') -Raw
Write-Output $filmReport
$filmOutput = Join-Path $PSScriptRoot 'FresnelContainerDemo/Builds/Fresnel-Motion.mp4'
$filmFrames = Join-Path $filmRun 'frames/frame_%06d.png'
& $filmEncoder -hide_banner -loglevel error -y -framerate 30 -i $filmFrames -frames:v 720 -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart -an $filmOutput
if ($LASTEXITCODE -ne 0) { throw 'Film encoding failed.' }
$filmMetadata = (& $filmProbe -v error -count_frames -select_streams v:0 -show_entries 'stream=width,height,nb_read_frames,r_frame_rate:format=duration' -of json $filmOutput) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'Encoded film verification failed.' }
$filmVerified = $filmMetadata | ConvertFrom-Json
if ($filmVerified.streams[0].nb_read_frames -ne '720' -or $filmVerified.streams[0].r_frame_rate -ne '30/1' -or [Math]::Abs([double]$filmVerified.format.duration - 24) -gt .01) { throw 'Encoded frame count or duration is incorrect.' }
$filmMetadata | Set-Content -LiteralPath (Join-Path $filmRun 'encoded-video.json') -Encoding utf8
Write-Output $filmOutput
