import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = new URL('../src/externalDiagnostics.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('function sensitivePathSegment(');
const end = source.indexOf('\nfunction isRabbitMirrorPath', start);
assert.ok(start >= 0 && end > start, 'pathOf helper must exist');

const sandbox = { location: { href: 'https://host.invalid/extensions/rabbit/' }, URL, safeString: value => String(value ?? '').slice(0, 180) };
vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.probe = pathOf;`, sandbox, { filename: sourcePath.pathname });

assert.equal(
    sandbox.probe('https://user:secret@example.invalid/frame.js?api_key=secret#private'),
    '/frame.js',
);
assert.equal(
    sandbox.probe('/scripts/extensions/third-party/example.js?token=secret#private'),
    '/scripts/extensions/third-party/example.js',
);
assert.equal(
    sandbox.probe('/frame/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlMTIzNDU2Nzg5MA/script.js'),
    '/frame/[redacted]/script.js',
);
assert.equal(sandbox.probe('/session-0123456789abcdef0123456789abcdef/frame.js'), '/[redacted]/frame.js');
assert.equal(sandbox.probe('/proxy/sk-secret-value/frame.js'), '/proxy/[redacted]/frame.js');
assert.equal(sandbox.probe('/proxy/Bearer%20privatecredential/frame.js'), '/proxy/[redacted]/frame.js');
assert.equal(sandbox.probe('/proxy/abcDEF0123456789/frame.js'), '/proxy/[redacted]/frame.js');
assert.equal(sandbox.probe('data:text/plain,secret-body'), '/');
assert.equal(sandbox.probe('blob:https://user:secret@example.invalid/private-id?token=secret'), '/');
assert.equal(sandbox.probe('file:///private/path/secret.txt'), '/');

const longTaskBlock = source.slice(source.indexOf("supported.includes('longtask')"), source.indexOf("supported.includes('long-animation-frame')"));
assert.match(longTaskBlock, /attribution\?\.containerSrc\s*\?\s*pathOf\(attribution\.containerSrc\)/);
assert.doesNotMatch(longTaskBlock, /safeString\(attribution\?\.containerSrc/);
assert.doesNotMatch(longTaskBlock, /containerName/, 'arbitrary browsing-context names must not enter the report');
assert.match(source, /row\.container \? \{ container: redactReportPath\(row\.container\) \}/, 'report must redact old buffered container paths again');
assert.doesNotMatch(source, /target\?\.textContent|target\.textContent/, 'external diagnostics must not read assistant正文');
assert.match(source, /host\.assistantFirstDomMutation/);
assert.match(source, /const SAFE_META_KEYS = new Set/, 'diagnostic meta must use an allowlist');
assert.match(source, /externalDiag\.externalMark/, 'public mark names must be collapsed to a non-sensitive event');

console.log('external diagnostic container URL privacy: PASS');
