"""Validate the UPM tarball and bundle the complete built Windows player.

Run Package-Distribution.ps1 after Build-Demo.ps1; Android and film are optional.
Python 3.10+ standard library only. Source files and build folders are preserved.
"""
from pathlib import Path
import hashlib
import json
import tarfile
import zipfile

root = Path(__file__).resolve().parents[1]
project = root / 'unity/FresnelContainerDemo'
package = project / 'Packages/com.fresnel.container-materials'
builds = project / 'Builds'
version = json.loads((package / 'package.json').read_text('utf-8'))['version']
archive = builds / f'com.fresnel.container-materials-{version}.tgz'
expected = {p.relative_to(package).as_posix(): p for p in package.rglob('*') if p.is_file()}
with tarfile.open(archive, 'r:gz') as tar:
    members = {m.name.removeprefix('package/'): m for m in tar.getmembers() if m.isfile()}
    if members.keys() != expected.keys():
        raise RuntimeError('UPM archive file list differs from package source.')
    for name, member in members.items():
        if tar.extractfile(member).read() != expected[name].read_bytes():
            raise RuntimeError(f'UPM source mismatch: {name}')
print(f'UPM {version}: {len(expected)} exact source files; {archive.stat().st_size:,} bytes')

player = builds / 'Windows'
if not (player / 'FresnelContainerDemo.exe').is_file() or not (player / 'FresnelContainerDemo_Data').is_dir():
    raise RuntimeError('Build the complete Windows demo before packaging.')
files = {p.relative_to(player).as_posix(): p for p in player.rglob('*') if p.is_file()}
bundle = builds / 'FresnelStudio-Windows.zip'
with zipfile.ZipFile(bundle, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name, path in sorted(files.items()):
        z.write(path, name)
with zipfile.ZipFile(bundle) as z:
    if z.testzip() is not None or set(z.namelist()) != files.keys():
        raise RuntimeError('Windows ZIP integrity or file list mismatch.')
    for name, path in files.items():
        if z.read(name) != path.read_bytes():
            raise RuntimeError(f'Windows ZIP content mismatch: {name}')
print(f'Windows ZIP: {len(files)} exact player files; {bundle.stat().st_size:,} bytes; CRC PASS')

artifacts = [bundle, archive]
for path in [builds / 'Android/FresnelContainerDemo.apk', builds / 'Fresnel-Motion.mp4']:
    if path.is_file():
        artifacts.append(path)
lines = [f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}' for p in artifacts]
(builds / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('SHA256SUMS.txt: ' + str(len(artifacts)) + ' distribution assets')
