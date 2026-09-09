// Session-only scalar receipts. No imports, startup work, network, body reads,
// storage, timers or listeners; only terminal request publication writes here.
const recentTransportReceipts = [];
let lastTransportStamp = 0;

export function sanitizeExternalTransportSummary(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const integer = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
    const tri = value => typeof value === 'boolean' ? value : null;
    const status = integer(value.status);
    const mime = String(value.contentType || '').split(';', 1)[0].trim().toLowerCase();
    const finish = String(value.finishReason || 'unknown');
    const format = String(value.parserFormat || 'unknown');
    const termination = String(value.termination || 'unknown');
    const category = String(value.failureCategory || 'none');
    return {
        status: status >= 100 && status <= 599 ? status : null,
        contentType: /^(?:text\/(?:event-stream|plain|html)|application\/(?:json|x-ndjson|ndjson|octet-stream|problem\+json))$/.test(mime) ? mime : (mime ? 'other' : null),
        parserFormat: /^(?:sse|ndjson|json|text|host-adapter|unknown)$/.test(format) ? format : 'unknown',
        receivedBytes: integer(value.receivedBytes), receivedBytesExact: value.receivedBytesExact === true,
        contentChars: integer(value.contentChars),
        finishReason: /^(?:stop|length|max_tokens|max_output_tokens|end_turn|stop_sequence|tool_calls|function_call|content_filter|safety|recitation|other|unknown)$/.test(finish) ? finish : 'other',
        terminalObserved: tri(value.terminalObserved), readerReachedEof: tri(value.readerReachedEof),
        termination: /^(?:protocol-done|provider-finish|json-complete|eof-unconfirmed|local-abort|response-limit|stream-error|host-complete|fetch-error|not-dispatched)$/.test(termination) ? termination : 'unknown',
        failureCategory: /^(?:none|unknown|authentication|rate-limit|concurrency|network|response-boundary|local-preflight)$/.test(category) ? category : 'unknown',
        endedNormally: tri(value.endedNormally), prematureClose: tri(value.prematureClose),
    };
}

export function rememberIndependentTransportDiagnostic(value) {
    const summary = sanitizeExternalTransportSummary(value?.transport);
    if (!summary) return null;
    const retainedStamp = Number(value?.transportRequestStamp);
    const stamp = Number(value?.ts);
    const ts = Number.isSafeInteger(retainedStamp) && retainedStamp > 0 ? retainedStamp
        : Math.max(Number.isSafeInteger(stamp) && stamp > 0 ? stamp : Date.now(), lastTransportStamp + 1);
    lastTransportStamp = Math.max(lastTransportStamp, ts);
    const existing = recentTransportReceipts.find(row => row.ts === ts);
    if (existing) existing.summary = Object.freeze(summary);
    else recentTransportReceipts.push({ ts, summary: Object.freeze(summary) });
    if (recentTransportReceipts.length > 12) recentTransportReceipts.splice(0, recentTransportReceipts.length - 12);
    return ts;
}

export function getRecentIndependentTransportDiagnostics() {
    return recentTransportReceipts.map(row => ({ ts: row.ts, summary: { ...row.summary } }));
}

export function clearRecentIndependentTransportDiagnostics() {
    recentTransportReceipts.length = 0;
    lastTransportStamp = 0;
}
