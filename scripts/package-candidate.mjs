#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkLibraryIndexes, writeLibraryIndexes } from './build-library-indexes.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.pytest_cache']);
const EXCLUDED_FILES = new Set(['.DS_Store']);

function fail(message) {
    throw new Error(`[package-candidate] ${message}`);
}

function parseArgs(argv) {
    let root = DEFAULT_ROOT;
    let output = '';
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--root') {
            if (!argv[index + 1]) fail('--root requires a path');
            root = resolve(argv[++index]);
            continue;
        }
        if (arg === '--output') {
            if (!argv[index + 1]) fail('--output requires a path');
            output = resolve(argv[++index]);
            continue;
        }
        if (arg === '--help' || arg === '-h') return { help: true, root, output };
        fail(`unknown argument ${arg}`);
    }
    return { help: false, root, output };
}

function printHelp() {
    console.log(`RabbitMirror verified candidate packager\n\n`
        + `Usage:\n`
        + `  node scripts/package-candidate.mjs [--root PATH] [--output FILE.zip]\n\n`
        + `The command rebuilds both mother-library indexes, checks them, runs the full\n`
        + `test suite and JS/MJS syntax checks, creates a deterministic ZIP, extracts it,\n`
        + `then repeats the checks against the exact packaged bytes.\n`);
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd,
        env: { ...process.env, TERM: process.env.TERM || 'dumb' },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: options.capture ? 'pipe' : 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const detail = options.capture ? `\n${result.stdout || ''}${result.stderr || ''}` : '';
        fail(`${command} ${args.join(' ')} exited ${result.status}${detail}`);
    }
    return result;
}

function walkFiles(root, { jsOnly = false } = {}) {
    const out = [];
    function visit(dir) {
        for (const entry of readdirSync(dir)) {
            if (EXCLUDED_DIRS.has(entry)) continue;
            const full = join(dir, entry);
            const stat = statSync(full);
            if (stat.isDirectory()) visit(full);
            else {
                if (EXCLUDED_FILES.has(entry) || entry.endsWith('.pyc') || entry.includes('.tmp-') || entry.endsWith('.generated')) continue;
                if (jsOnly && !/\.m?js$/.test(entry)) continue;
                out.push(full);
            }
        }
    }
    visit(root);
    return out.sort((a, b) => relative(root, a).localeCompare(relative(root, b)));
}

function testFiles(root) {
    return readdirSync(join(root, 'tests'))
        .filter(name => name.endsWith('.test.mjs'))
        .sort()
        .map(name => `tests/${name}`);
}

function runTests(root) {
    const tests = testFiles(root);
    const loader = ['.', 'tests', 'hostLoader.mjs'].join('/');
    run(process.execPath, ['--test', '--loader', loader, ...tests], { cwd: root });
    return tests.length;
}

function runSyntaxChecks(root) {
    const files = walkFiles(root, { jsOnly: true });
    for (const file of files) run(process.execPath, ['--check', file], { cwd: root, capture: true });
    return files.length;
}

function fileHash(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function treeHashes(root) {
    return new Map(walkFiles(root).map(path => [relative(root, path).split('\\').join('/'), fileHash(path)]));
}

function compareTrees(sourceRoot, extractedRoot) {
    const source = treeHashes(sourceRoot);
    const extracted = treeHashes(extractedRoot);
    const all = new Set([...source.keys(), ...extracted.keys()]);
    const differences = [];
    for (const file of [...all].sort()) {
        if (source.get(file) !== extracted.get(file)) differences.push(file);
    }
    if (differences.length) fail(`packaged tree differs from source: ${differences.slice(0, 20).join(', ')}`);
    return source.size;
}

function sha256(path) {
    return fileHash(path);
}

function pythonZipScript(root) {
    return join(root, 'scripts', 'create-extension-zip.py');
}

function pythonCommand() {
    const candidates = [process.env.RABBIT_MIRROR_PYTHON, 'python3', 'python'].filter(Boolean);
    for (const command of candidates) {
        const probe = spawnSync(command, ['-c', 'import sys; print(sys.version_info.major)'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
        if (probe.status === 0 && probe.stdout.trim() === '3') return command;
    }
    fail('Python 3 is required; set RABBIT_MIRROR_PYTHON to its executable path.');
}

export function packageCandidate(root = DEFAULT_ROOT, output = '') {
    root = resolve(root);
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
    const finalOutput = output
        ? resolve(output)
        : resolve(root, '..', `RabbitMirror-${manifest.version}-candidate.zip`);
    const relativeOutput = relative(root, finalOutput);
    if (!relativeOutput.startsWith('..') || relativeOutput === '') fail('output ZIP must be outside the source root');

    console.log('[package-candidate] 1/7 rebuild mother-library indexes');
    writeLibraryIndexes(root);
    checkLibraryIndexes(root);

    console.log('[package-candidate] 2/7 run source tests');
    const sourceTestFiles = runTests(root);

    console.log('[package-candidate] 3/7 run source syntax checks');
    const sourceSyntaxFiles = runSyntaxChecks(root);

    console.log('[package-candidate] 4/7 create deterministic ZIP');
    const python = pythonCommand();
    run(python, [pythonZipScript(root), 'create', '--root', root, '--output', finalOutput], { cwd: root });
    run(python, [pythonZipScript(root), 'verify', '--archive', finalOutput], { cwd: root });

    const temp = mkdtempSync(join(tmpdir(), 'rabbitmirror-package-'));
    try {
        console.log('[package-candidate] 5/7 extract final ZIP');
        run(python, [pythonZipScript(root), 'extract', '--archive', finalOutput, '--destination', temp], { cwd: root });
        const extractedRoot = join(temp, basename(root));
        if (!statSync(extractedRoot).isDirectory()) fail(`missing extracted package root ${basename(root)}`);

        console.log('[package-candidate] 6/7 re-run checks from extracted ZIP');
        checkLibraryIndexes(extractedRoot);
        const extractedTestFiles = runTests(extractedRoot);
        const extractedSyntaxFiles = runSyntaxChecks(extractedRoot);
        if (sourceTestFiles !== extractedTestFiles) fail('test-file count changed after packaging');
        if (sourceSyntaxFiles !== extractedSyntaxFiles) fail('syntax-file count changed after packaging');

        console.log('[package-candidate] 7/7 compare packaged bytes');
        const fileCount = compareTrees(root, extractedRoot);
        const digest = sha256(finalOutput);
        console.log(`[package-candidate] PASS tests=${sourceTestFiles} syntax=${sourceSyntaxFiles} files=${fileCount}`);
        console.log(`[package-candidate] SHA-256 ${digest}`);
        console.log(`[package-candidate] ZIP ${finalOutput}`);
        return { output: finalOutput, digest, testFiles: sourceTestFiles, syntaxFiles: sourceSyntaxFiles, fileCount };
    } finally {
        const safeTemp = resolve(temp);
        if (dirname(safeTemp) !== resolve(tmpdir()) || !basename(safeTemp).startsWith('rabbitmirror-package-')) fail('refusing unsafe temporary cleanup');
        rmSync(temp, { recursive: true, force: true });
    }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) printHelp();
        else packageCandidate(args.root, args.output);
    } catch (error) {
        console.error(error?.stack || String(error));
        process.exitCode = 1;
    }
}
