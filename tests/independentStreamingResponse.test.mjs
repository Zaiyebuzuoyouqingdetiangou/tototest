import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/independentApi.js'), 'utf8');
const start = source.indexOf('function textFromContent(value)');
const end = source.indexOf('function extractMirrorInner(raw)', start);
assert.ok(start >= 0 && end > start, 'stream response helper block must exist');

const sandbox = { TextDecoder, JSON, String, Array, Object, Number, console, globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(`${source.slice(start, end)}
globalThis.__readApiResponse=readApiResponse;
globalThis.__parseSsePayload=parseSsePayload;
globalThis.__parseNdjsonPayload=parseNdjsonPayload;`, sandbox);

const readApiResponse = sandbox.globalThis.__readApiResponse;
const encoder = new TextEncoder();

function streamingResponse(contentType, byteChunks, { close = true } = {}) {
    let cancelCount = 0;
    let getReaderCount = 0;
    const body = new ReadableStream({
        start(controller) {
            for (const chunk of byteChunks) controller.enqueue(chunk);
            if (close) controller.close();
        },
        cancel() { cancelCount += 1; },
    });
    const originalGetReader = body.getReader.bind(body);
    body.getReader = (...args) => { getReaderCount += 1; return originalGetReader(...args); };
    return {
        headers: { get: name => String(name).toLowerCase() === 'content-type' ? contentType : '' },
        body,
        text: async () => { throw new Error('recognized streaming response must not be buffered with response.text()'); },
        counts: () => ({ cancelCount, getReaderCount }),
    };
}

{
    const raw = [
        ': keepalive\r\n\r\n',
        'data: {"choices":[{"delta":{"reasoning_content":"SECRET"}}]}\r\n\r\n',
        'data: {"choices":\r\n',
        'data: [{"delta":{"content":"<toto>你"}}]}\r\n\r\n',
        'data: {"choices":[{"delta":{"content":"好</toto>"}}]}\r\n\r\n',
        'data: [DONE]\r\n\r\n',
    ].join('');
    const bytes = encoder.encode(raw);
    const response = streamingResponse('text/event-stream; charset=utf-8', [...bytes].map(value => Uint8Array.of(value)), { close: false });
    const result = await readApiResponse(response);
    assert.equal(result.text, '<toto>你好</toto>');
    assert.doesNotMatch(result.text, /SECRET/);
    assert.equal(result.streamed, true);
    assert.deepEqual(response.counts(), { cancelCount: 1, getReaderCount: 1 }, 'DONE must finish and cancel the same reader exactly once');
}

{
    const raw = [
        JSON.stringify({ choices: [{ delta: { content: 'A' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'AB' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'C' } }] }),
        '[DONE]',
    ].join('\n') + '\n';
    const response = streamingResponse('application/x-ndjson', [encoder.encode(raw)], { close: false });
    const result = await readApiResponse(response);
    assert.equal(result.text, 'ABC', 'cumulative snapshots must not duplicate the already received prefix');
    assert.equal(response.counts().cancelCount, 1);
}

{
    const raw = 'data: {"choices":[{"delta":{"content":"MISLABELED"}}]}\n\ndata: [DONE]\n\n';
    let textCalls = 0;
    const result = await readApiResponse({
        headers: { get: () => 'text/plain' },
        body: null,
        text: async () => { textCalls += 1; return raw; },
    });
    assert.equal(result.text, 'MISLABELED');
    assert.equal(result.streamed, true);
    assert.equal(textCalls, 1);
}

{
    const raw = JSON.stringify({ choices: [{ message: { content: 'NON_STREAM' } }] });
    let textCalls = 0;
    const result = await readApiResponse({
        headers: { get: () => 'application/json' },
        body: null,
        text: async () => { textCalls += 1; return raw; },
    });
    assert.equal(result.text, 'NON_STREAM');
    assert.equal(result.streamed, false);
    assert.equal(textCalls, 1);
}

assert.doesNotMatch(source.slice(start, end), /response\.clone\s*\(/, 'streaming must not clone or race a second response body');
assert.match(source, /const \{response:r,result,profile,attempts,requestDiagnostic,semanticError\}=await requestIndependentCompletion/);

console.log('independentStreamingResponse: incremental SSE/NDJSON, UTF-8 chunk boundaries, DONE cancel and buffered compatibility passed');
