#!/usr/bin/env python3
"""Create and verify a deterministic RabbitMirror extension ZIP using stdlib only."""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import stat
import sys
import zipfile
from pathlib import Path

FIXED_TIME = (2026, 1, 1, 0, 0, 0)
EXCLUDED_DIRS = {'.git', 'node_modules', '__pycache__', '.pytest_cache'}
EXCLUDED_FILES = {'.DS_Store'}


def should_include(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    if any(part in EXCLUDED_DIRS for part in rel.parts):
        return False
    if path.name in EXCLUDED_FILES or path.suffix == '.pyc':
        return False
    if '.tmp-' in path.name or path.name.endswith('.generated'):
        return False
    return True


def iter_files(root: Path):
    for path in sorted(root.rglob('*'), key=lambda value: value.relative_to(root).as_posix()):
        if path.is_file() and should_include(path, root):
            yield path


def zip_info(arcname: str, mode: int = 0o644) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(arcname, FIXED_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = ((stat.S_IFREG | mode) & 0xFFFF) << 16
    return info


def create_zip(root: Path, output: Path) -> None:
    root = root.resolve()
    output = output.resolve()
    if not root.is_dir():
        raise ValueError(f'root is not a directory: {root}')
    try:
        output.relative_to(root)
    except ValueError:
        pass
    else:
        raise ValueError('output ZIP must be outside the packaged root')

    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_name(f'.{output.name}.tmp-{os.getpid()}')
    temp.unlink(missing_ok=True)
    package_root = root.name

    with zipfile.ZipFile(temp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        directory = zipfile.ZipInfo(f'{package_root}/', FIXED_TIME)
        directory.create_system = 3
        directory.external_attr = ((stat.S_IFDIR | 0o755) & 0xFFFF) << 16
        directory.compress_type = zipfile.ZIP_STORED
        archive.writestr(directory, b'')
        for path in iter_files(root):
            rel = path.relative_to(root).as_posix()
            mode = 0o755 if os.access(path, os.X_OK) else 0o644
            archive.writestr(zip_info(f'{package_root}/{rel}', mode), path.read_bytes())

    with zipfile.ZipFile(temp, 'r') as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError(f'ZIP CRC failed for {bad}')
    os.replace(temp, output)


def extract_zip(archive_path: Path, destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path, 'r') as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError(f'ZIP CRC failed for {bad}')
        archive.extractall(destination)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)

    create = sub.add_parser('create')
    create.add_argument('--root', required=True, type=Path)
    create.add_argument('--output', required=True, type=Path)

    extract = sub.add_parser('extract')
    extract.add_argument('--archive', required=True, type=Path)
    extract.add_argument('--destination', required=True, type=Path)

    verify = sub.add_parser('verify')
    verify.add_argument('--archive', required=True, type=Path)

    args = parser.parse_args()
    if args.command == 'create':
        create_zip(args.root, args.output)
        print(f'{sha256(args.output)}  {args.output}')
    elif args.command == 'extract':
        extract_zip(args.archive, args.destination)
    elif args.command == 'verify':
        with zipfile.ZipFile(args.archive, 'r') as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError(f'ZIP CRC failed for {bad}')
            print(f'ZIP CRC OK: {len(archive.infolist())} entries')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover - CLI guard
        print(f'[create-extension-zip] {exc}', file=sys.stderr)
        raise SystemExit(1)
