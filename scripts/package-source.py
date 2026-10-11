#!/usr/bin/env python3
"""Create the complete reproducible source package, excluding generated/runtime state."""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'public/downloads/curveguard-launch-source.zip'
output.parent.mkdir(parents=True, exist_ok=True)
excluded_dirs = {'.git', 'node_modules', 'dist', '.sites-runtime', '.wrangler', '.next', '.vinext', '.agents', '.codex', 'outputs', 'work', 'coverage', '__pycache__'}
files = []
for item in sorted(root.rglob('*')):
    if not item.is_file() or item.is_symlink():
        continue
    relative = item.relative_to(root)
    if any(part in excluded_dirs for part in relative.parts):
        continue
    if relative.parts[:2] == ('public', 'downloads'):
        continue
    if item.name.startswith('.env') or item.suffix in {'.zip', '.tgz', '.tar', '.pem', '.pyc'} or item.name.endswith('.tsbuildinfo'):
        continue
    if item.name.endswith('.log') or item.name == '.DS_Store':
        continue
    files.append((item, relative.as_posix()))
manifest = {'project': 'CurveGuard Launch', 'format': 1, 'files': [{'path': name, 'sha256': hashlib.sha256(item.read_bytes()).hexdigest()} for item, name in files], 'excluded': ['installed dependencies', 'generated build output', 'repository/runtime state', 'credentials and environment files', 'recursive source archives']}
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for item, name in files:
        archive.write(item, 'curveguard-launch/' + name)
    archive.writestr('curveguard-launch/SOURCE-MANIFEST.json', json.dumps(manifest, indent=2) + '\n')
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert 'curveguard-launch/app/launch-app.tsx' in archive.namelist()
    assert 'curveguard-launch/pnpm-lock.yaml' in archive.namelist()
    assert 'curveguard-launch/README.md' in archive.namelist()
print(json.dumps({'source_archive': str(output), 'files': len(files), 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))
