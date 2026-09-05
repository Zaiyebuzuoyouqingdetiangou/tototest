#!/usr/bin/env node

import {
    existsSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');

const LIBRARIES = [
    {
        kind: 'presentation',
        rawFile: 'data/raw/rawPresentationFormats.js',
        rawExport: 'RAW_PRESENTATION_FORMATS',
        metadataFile: 'data/metadata/presentationIndexMetadata.json',
        outputFile: 'data/structured/presentationIndex.js',
        outputExport: 'PRESENTATION_FORMATS',
    },
    {
        kind: 'theme',
        rawFile: 'data/raw/rawThematicCategories.js',
        rawExport: 'RAW_THEMATIC_CATEGORIES',
        metadataFile: 'data/metadata/thematicIndexMetadata.json',
        outputFile: 'data/structured/thematicIndex.js',
        outputExport: 'THEMATIC_CATEGORIES',
    },
];

function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function fail(message) {
    throw new Error(`[library-index-builder] ${message}`);
}

function normalizeLineEndings(value) {
    return String(value || '').replace(/\r\n?/g, '\n');
}

function readRawTemplate(filePath, exportName) {
    const source = normalizeLineEndings(readFileSync(filePath, 'utf8'));
    const marker = `export const ${exportName} = String.raw\``;
    const start = source.indexOf(marker);
    if (start < 0) fail(`${relative(DEFAULT_ROOT, filePath)}: missing ${marker}`);
    const contentStart = start + marker.length;
    const end = source.indexOf('\`;', contentStart);
    if (end < 0) fail(`${relative(DEFAULT_ROOT, filePath)}: unterminated String.raw template`);
    if (source.indexOf('\`', contentStart) !== end) fail(`${relative(DEFAULT_ROOT, filePath)}: raw mother library must not contain extra backticks`);
    const raw = source.slice(contentStart, end);
    if (raw.includes('${')) fail(`${relative(DEFAULT_ROOT, filePath)}: interpolation is not allowed in mother libraries`);
    return raw;
}

function isMotherStructureLine(sourceLine, kind) {
    const trimmed = String(sourceLine || '').trim();
    if (!trimmed) return true;
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    if (/^-{3,}$/.test(trimmed)) return true;
    const wrapper = kind === 'presentation' ? 'PresentationFormats' : 'ThematicCategories';
    return trimmed === `<${wrapper}>` || trimmed === `</${wrapper}>`;
}

function leadingWhitespaceWidth(sourceLine) {
    const match = String(sourceLine || '').match(/^\s*/);
    return match ? match[0].replace(/\t/g, '    ').length : 0;
}

function isExplicitAuxiliaryBullet(sourceLine, parentIndent) {
    // The current mother library deliberately uses a small number of indented,
    // non-indexed child bullets as raw-only supplements. They remain available to
    // rawSegmentLookup, while ordinary wrapped prose must fail closed instead of
    // being silently dropped from the generated structured index.
    return leadingWhitespaceWidth(sourceLine) > parentIndent
        && /^\s+[-*]\s+(?!\*\*)\S/.test(String(sourceLine || ''));
}

function parseMotherEntries(rawText, kind, fileLabel = `${kind} mother library`) {
    const entries = [];
    const sourceIdPattern = kind === 'presentation'
        ? /^(\d+(?:\.\d+)+(?:\.[a-z])?)\s*(.*)$/
        : /^([A-I](?:\.\d+)+)\s*(.*)$/;
    let lastEntry = null;

    for (const [lineIndex, sourceLine] of normalizeLineEndings(rawText).split('\n').entries()) {
        const match = sourceLine.match(/^\s*[-*]\s+\*\*(.+?)\*\*\s*(?:(:|：)\s*(.*))?\s*$/);
        if (!match) {
            if (isMotherStructureLine(sourceLine, kind)) continue;
            if (lastEntry && isExplicitAuxiliaryBullet(sourceLine, lastEntry.indent)) continue;
            const nearest = lastEntry
                ? ` after ${lastEntry.sourceId || '<no-id>'} ${lastEntry.title}`
                : '';
            fail(`${fileLabel}:${lineIndex + 1}: unsupported non-empty mother-library line${nearest}; mother entries must remain on one line. Use a numbered bold item for a new entry or an explicitly indented bullet for a deliberate raw-only supplement.`);
        }
        const marker = match[1].trim();
        const idMatch = marker.match(sourceIdPattern);
        const sourceId = idMatch ? idMatch[1] : '';
        const title = (idMatch ? idMatch[2] : marker).trim();
        if (!title) fail(`${fileLabel}:${lineIndex + 1}: empty title`);
        lastEntry = {
            sourceId,
            title,
            summary: String(match[3] || '').trim(),
            rawLine: sourceLine.trim(),
            lineNumber: lineIndex + 1,
            indent: leadingWhitespaceWidth(sourceLine),
        };
        entries.push(lastEntry);
    }

    if (!entries.length) fail(`${kind}: no mother-library entries were parsed`);
    return entries;
}

function parseGeneratedIndex(source, exportName, fileLabel) {
    const normalized = normalizeLineEndings(source);
    const prefix = `export const ${exportName} = `;
    const start = normalized.indexOf(prefix);
    if (start < 0) fail(`${fileLabel}: missing export ${exportName}`);
    const bodyStart = start + prefix.length;
    const end = normalized.lastIndexOf(';');
    if (end < bodyStart) fail(`${fileLabel}: missing trailing semicolon`);
    const body = normalized.slice(bodyStart, end).trim();
    let parsed;
    try {
        parsed = JSON.parse(body);
    } catch (error) {
        fail(`${fileLabel}: generated index is not canonical JSON (${error.message})`);
    }
    if (!Array.isArray(parsed)) fail(`${fileLabel}: generated export must be an array`);
    return parsed;
}

function readMetadata(filePath, config) {
    let metadata;
    try {
        metadata = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (error) {
        fail(`${relative(DEFAULT_ROOT, filePath)}: invalid metadata JSON (${error.message})`);
    }
    const allowedTopLevel = new Set(['schema', 'kind', 'source', 'generated', 'entries']);
    const unknownTopLevel = Object.keys(metadata || {}).filter(key => !allowedTopLevel.has(key));
    if (unknownTopLevel.length) fail(`${relative(DEFAULT_ROOT, filePath)}: unknown top-level keys: ${unknownTopLevel.join(', ')}`);
    if (metadata?.schema !== 1) fail(`${relative(DEFAULT_ROOT, filePath)}: unsupported metadata schema`);
    if (metadata.kind !== config.kind) fail(`${relative(DEFAULT_ROOT, filePath)}: expected kind ${config.kind}`);
    if (metadata.source !== config.rawFile) fail(`${relative(DEFAULT_ROOT, filePath)}: source must be ${config.rawFile}`);
    if (metadata.generated !== config.outputFile) fail(`${relative(DEFAULT_ROOT, filePath)}: generated must be ${config.outputFile}`);
    if (!Array.isArray(metadata.entries) || !metadata.entries.length) fail(`${relative(DEFAULT_ROOT, filePath)}: entries must be a non-empty array`);
    return metadata;
}

function validateMetadataEntry(meta, index, kind) {
    const label = `${kind} metadata[${index}]`;
    const allowedKeys = new Set([
        'id', 'group', 'tags', 'aliases', 'sourceId', 'sourceTitle',
        'summaryOverride', 'rawIndent', 'aliasesBeforeSummary',
    ]);
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) fail(`${label}: entry must be an object`);
    const unknownKeys = Object.keys(meta).filter(key => !allowedKeys.has(key));
    if (unknownKeys.length) fail(`${label}: unknown keys: ${unknownKeys.join(', ')}`);
    if (typeof meta.id !== 'string' || !meta.id.trim()) fail(`${label}: id must be a non-empty string`);
    if (typeof meta.group !== 'string' || !meta.group.trim()) fail(`${label} ${meta.id}: group must be a non-empty string`);
    if (!Array.isArray(meta.tags) || !meta.tags.length || meta.tags.some(tag => typeof tag !== 'string' || !tag.trim())) {
        fail(`${label} ${meta.id}: tags must be a non-empty string array`);
    }
    if (new Set(meta.tags).size !== meta.tags.length) fail(`${label} ${meta.id}: duplicate tags are not allowed`);
    if (own(meta, 'aliases')) {
        if (!Array.isArray(meta.aliases) || meta.aliases.some(alias => typeof alias !== 'string' || !alias.trim())) {
            fail(`${label} ${meta.id}: aliases must be a string array`);
        }
        if (new Set(meta.aliases).size !== meta.aliases.length) fail(`${label} ${meta.id}: duplicate aliases are not allowed`);
    }
    if (own(meta, 'sourceId') && meta.sourceId !== null && (typeof meta.sourceId !== 'string' || !meta.sourceId.trim())) {
        fail(`${label} ${meta.id}: sourceId must be null or a non-empty string`);
    }
    if (own(meta, 'sourceTitle') && (typeof meta.sourceTitle !== 'string' || !meta.sourceTitle.trim())) {
        fail(`${label} ${meta.id}: sourceTitle must be a non-empty string`);
    }
    if (own(meta, 'summaryOverride') && (typeof meta.summaryOverride !== 'string' || !meta.summaryOverride.trim())) {
        fail(`${label} ${meta.id}: summaryOverride must be a non-empty string`);
    }
    if (own(meta, 'rawIndent') && (!Number.isInteger(meta.rawIndent) || meta.rawIndent < 0 || meta.rawIndent > 16)) {
        fail(`${label} ${meta.id}: rawIndent must be an integer from 0 to 16`);
    }
    if (own(meta, 'aliasesBeforeSummary') && meta.aliasesBeforeSummary !== true) {
        fail(`${label} ${meta.id}: aliasesBeforeSummary may only be literal true`);
    }
}

function expectedSourceId(meta) {
    return own(meta, 'sourceId') ? String(meta.sourceId || '') : meta.id;
}

function generatedItem(meta, rawEntry) {
    const item = {
        id: meta.id,
        group: meta.group,
        title: rawEntry.title,
    };
    if (meta.aliasesBeforeSummary && meta.aliases?.length) item.aliases = [...meta.aliases];
    item.summary = own(meta, 'summaryOverride') ? meta.summaryOverride : rawEntry.summary;
    item.tags = [...meta.tags];
    item.raw = `${' '.repeat(meta.rawIndent || 0)}${rawEntry.rawLine}`;
    if (!meta.aliasesBeforeSummary && meta.aliases?.length) item.aliases = [...meta.aliases];
    return item;
}

function validateTitleCompatibility(currentItems, nextItems, metadataEntries, kind) {
    if (!currentItems?.length) return;
    const currentById = new Map(currentItems.map(item => [item.id, item]));
    for (let index = 0; index < nextItems.length; index += 1) {
        const next = nextItems[index];
        const current = currentById.get(next.id);
        if (!current || current.title === next.title) continue;
        const aliases = metadataEntries[index].aliases || [];
        if (!aliases.includes(current.title)) {
            fail(`${kind} ${next.id}: title changed from "${current.title}" to "${next.title}"; add the old title to metadata aliases before writing`);
        }
    }
}

function validateGeneratedItems(items, metadataEntries, rawEntries, kind) {
    const ids = new Set();
    const consumedSourceKeys = new Set();
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const meta = metadataEntries[index];
        const rawEntry = rawEntries[index];
        if (ids.has(item.id)) fail(`${kind}: duplicate generated id ${item.id}`);
        ids.add(item.id);
        if (!item.title.trim()) fail(`${kind} ${item.id}: empty generated title`);
        if (!Array.isArray(item.tags) || !item.tags.length) fail(`${kind} ${item.id}: empty generated tags`);
        if (item.aliases?.includes(item.title)) fail(`${kind} ${item.id}: aliases must not repeat the current title`);
        const sourceKey = `${rawEntry.sourceId}\u0000${rawEntry.title}`;
        if (consumedSourceKeys.has(sourceKey)) fail(`${kind} ${item.id}: duplicate mother source ${sourceKey}`);
        consumedSourceKeys.add(sourceKey);

        const prefix = item.id.split('.')[0];
        if (/^(?:\d+|[A-I])$/.test(prefix) && prefix !== item.group) {
            fail(`${kind} ${item.id}: group ${item.group} disagrees with id prefix ${prefix}`);
        }
        if (own(meta, 'summaryOverride') && meta.summaryOverride === rawEntry.summary) {
            fail(`${kind} ${item.id}: summaryOverride duplicates the mother summary and should be removed`);
        }
    }
}

function serializeIndex(exportName, items) {
    return `export const ${exportName} = ${JSON.stringify(items, null, 2)};\n`;
}

function firstLineDiff(expected, actual, maxLines = 18) {
    const expectedLines = normalizeLineEndings(expected).split('\n');
    const actualLines = normalizeLineEndings(actual).split('\n');
    const out = [];
    const limit = Math.max(expectedLines.length, actualLines.length);
    for (let index = 0; index < limit && out.length < maxLines; index += 1) {
        if (expectedLines[index] === actualLines[index]) continue;
        out.push(`line ${index + 1}`);
        out.push(`  current:   ${expectedLines[index] ?? '<missing>'}`);
        out.push(`  generated: ${actualLines[index] ?? '<missing>'}`);
    }
    return out.join('\n');
}

export function buildLibraryIndex(config, root = DEFAULT_ROOT) {
    const rawPath = resolve(root, config.rawFile);
    const metadataPath = resolve(root, config.metadataFile);
    const outputPath = resolve(root, config.outputFile);
    const metadata = readMetadata(metadataPath, config);
    const rawEntries = parseMotherEntries(readRawTemplate(rawPath, config.rawExport), config.kind, config.rawFile);

    if (rawEntries.length !== metadata.entries.length) {
        const rawTail = rawEntries.slice(metadata.entries.length).map(entry => `${entry.lineNumber}:${entry.sourceId || '<no-id>'}:${entry.title}`);
        const metadataTail = metadata.entries.slice(rawEntries.length).map(entry => entry.id);
        fail(`${config.kind}: mother entries ${rawEntries.length} != metadata entries ${metadata.entries.length}`
            + `${rawTail.length ? `; unindexed mother entries: ${rawTail.join(', ')}` : ''}`
            + `${metadataTail.length ? `; metadata without mother entries: ${metadataTail.join(', ')}` : ''}`);
    }

    const metadataIds = new Set();
    const items = [];
    for (let index = 0; index < metadata.entries.length; index += 1) {
        const meta = metadata.entries[index];
        const rawEntry = rawEntries[index];
        validateMetadataEntry(meta, index, config.kind);
        if (metadataIds.has(meta.id)) fail(`${config.kind}: duplicate metadata id ${meta.id}`);
        metadataIds.add(meta.id);

        const expectedId = expectedSourceId(meta);
        if (rawEntry.sourceId !== expectedId) {
            fail(`${config.kind} ${meta.id}: raw order/source mismatch at line ${rawEntry.lineNumber}; expected source id "${expectedId || '<no-id>'}", got "${rawEntry.sourceId || '<no-id>'}" (${rawEntry.title})`);
        }
        if (meta.sourceTitle && rawEntry.title !== meta.sourceTitle) {
            fail(`${config.kind} ${meta.id}: expected source title "${meta.sourceTitle}", got "${rawEntry.title}" at line ${rawEntry.lineNumber}`);
        }
        if (!expectedId && !meta.sourceTitle) {
            fail(`${config.kind} ${meta.id}: id-less mother entries require sourceTitle metadata`);
        }
        items.push(generatedItem(meta, rawEntry));
    }

    validateGeneratedItems(items, metadata.entries, rawEntries, config.kind);

    const currentSource = existsSync(outputPath) ? normalizeLineEndings(readFileSync(outputPath, 'utf8')) : '';
    const currentItems = currentSource ? parseGeneratedIndex(currentSource, config.outputExport, config.outputFile) : [];
    validateTitleCompatibility(currentItems, items, metadata.entries, config.kind);
    const generatedSource = serializeIndex(config.outputExport, items);

    return {
        config,
        root,
        metadata,
        rawEntries,
        items,
        outputPath,
        currentSource,
        currentItems,
        generatedSource,
        changed: currentSource !== generatedSource,
    };
}

export function buildAllLibraryIndexes(root = DEFAULT_ROOT) {
    return LIBRARIES.map(config => buildLibraryIndex(config, root));
}

export function checkLibraryIndexes(root = DEFAULT_ROOT, { quiet = false } = {}) {
    const results = buildAllLibraryIndexes(root);
    const changed = results.filter(result => result.changed);
    if (changed.length) {
        const details = changed.map(result => {
            const rel = relative(root, result.outputPath);
            return `${rel} differs from its generated form:\n${firstLineDiff(result.currentSource, result.generatedSource)}`;
        }).join('\n\n');
        fail(`generated indexes are stale\n${details}`);
    }
    if (!quiet) {
        const summary = results.map(result => `${result.config.kind}=${result.items.length}`).join(', ');
        console.log(`[library-index-builder] check passed (${summary})`);
    }
    return results;
}

function atomicWriteBatch(results) {
    const originals = new Map(results.map(result => [result.outputPath, result.currentSource]));
    const tempPaths = [];
    try {
        for (const result of results) {
            const tempPath = `${result.outputPath}.tmp-${process.pid}`;
            writeFileSync(tempPath, result.generatedSource, 'utf8');
            tempPaths.push(tempPath);
        }
        for (let index = 0; index < results.length; index += 1) {
            renameSync(tempPaths[index], results[index].outputPath);
        }
    } catch (error) {
        for (const tempPath of tempPaths) rmSync(tempPath, { force: true });
        for (const [outputPath, source] of originals) {
            if (source) writeFileSync(outputPath, source, 'utf8');
        }
        throw error;
    }
}

export function writeLibraryIndexes(root = DEFAULT_ROOT, { quiet = false } = {}) {
    const results = buildAllLibraryIndexes(root);
    const changed = results.filter(result => result.changed);
    if (changed.length) atomicWriteBatch(changed);
    checkLibraryIndexes(root, { quiet: true });
    if (!quiet) {
        if (!changed.length) console.log('[library-index-builder] indexes already current; no files written');
        else console.log(`[library-index-builder] wrote ${changed.map(result => relative(root, result.outputPath)).join(', ')}`);
    }
    return { results, changed };
}

function parseCliArgs(argv) {
    let mode = '';
    let root = DEFAULT_ROOT;
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--check' || arg === '--write') {
            if (mode) fail('choose exactly one of --check or --write');
            mode = arg.slice(2);
            continue;
        }
        if (arg === '--root') {
            const next = argv[index + 1];
            if (!next) fail('--root requires a path');
            root = resolve(next);
            index += 1;
            continue;
        }
        if (arg === '--help' || arg === '-h') {
            return { help: true, mode: '', root };
        }
        fail(`unknown argument ${arg}`);
    }
    if (!mode) fail('choose --check or --write');
    return { help: false, mode, root };
}

function printHelp() {
    console.log(`RabbitMirror mother-library index builder\n\n`
        + `Usage:\n`
        + `  node scripts/build-library-indexes.mjs --check [--root PATH]\n`
        + `  node scripts/build-library-indexes.mjs --write [--root PATH]\n\n`
        + `--check  Rebuild both indexes in memory and fail if checked-in files differ.\n`
        + `--write  Validate both libraries first, write temporary files, then replace stale indexes and re-check.\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
    try {
        const args = parseCliArgs(process.argv.slice(2));
        if (args.help) printHelp();
        else if (args.mode === 'check') checkLibraryIndexes(args.root);
        else writeLibraryIndexes(args.root);
    } catch (error) {
        console.error(error?.stack || String(error));
        process.exitCode = 1;
    }
}
