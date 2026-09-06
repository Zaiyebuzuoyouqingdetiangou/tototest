import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Only the two unavailable SillyTavern host imports are replaced. All capability
// detection, reads, upsert decisions, saving, read-back, and UI-open behavior run
// through the production module's public exports, without copying that logic.
const productionSource = readFileSync(new URL('../src/regexConfigurator.js', import.meta.url), 'utf8');
let moduleSequence = 0;

function replaceHostImport(source, expression, replacement) {
    assert.equal(source.split(expression).length - 1, 1, `Expected one host import seam: ${expression}`);
    return source.replace(expression, replacement);
}

function clone(value) {
    return structuredClone(value);
}

async function runtime(options = {}) {
    let scripts = clone(options.scripts || []);
    const trace = { reads: [], writes: [] };
    const engine = {
        SCRIPT_TYPES: { GLOBAL: 0 },
        getScriptsByType(type) {
            trace.reads.push(type);
            if (options.read) return options.read({ scripts: clone(scripts), readCount: trace.reads.length, type });
            return clone(scripts);
        },
        async saveScriptsByType(next, type) {
            trace.writes.push({ type, scripts: clone(next) });
            const saved = options.save ? await options.save({ scripts: clone(scripts), next: clone(next), type }) : undefined;
            if (saved !== false) scripts = clone(Array.isArray(saved) ? saved : next);
        },
        ...(options.enginePatch || {}),
    };
    const key = `__rabbitMirrorRegexRuntimeTest${++moduleSequence}`;
    globalThis[key] = {
        async loadEngine() {
            if (options.engineLoadError) throw options.engineLoadError;
            return engine;
        },
        async loadExtensions() {
            if (options.extensionsLoadError) throw options.extensionsLoadError;
            return Object.hasOwn(options, 'extensions') ? options.extensions : { extension_settings: { disabledExtensions: [] } };
        },
    };
    let source = `const __regexHost = globalThis[${JSON.stringify(key)}];\n${productionSource}`;
    source = replaceHostImport(source, "import('../../../../extensions/regex/engine.js')", '__regexHost.loadEngine()');
    source = replaceHostImport(source, "import('../../../../extensions.js')", '__regexHost.loadExtensions()');
    try {
        const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
        return { api, trace, get scripts() { return clone(scripts); } };
    } finally {
        delete globalThis[key];
    }
}

const userRule = {
    id: 'user-other-rule',
    scriptName: 'User-owned formatting',
    findRegex: '/unrelated/g',
    replaceString: 'replacement',
    placement: [1],
    disabled: true,
    markdownOnly: true,
    customMetadata: { preserve: ['nested', 'values'] },
};

test('GLOBAL 0 is supported and ten sequential configure clicks save one global rule', async () => {
    const host = await runtime({ scripts: [userRule] });
    for (let index = 0; index < 10; index += 1) {
        const result = await host.api.configureRabbitMirrorNoSendRegex();
        assert.equal(result.ok, true);
        assert.equal(result.status, index === 0 ? 'created' : 'configured');
    }
    assert.equal(host.trace.writes.length, 1, 'A repeated click must not save again');
    assert.ok(host.trace.reads.every(type => type === 0), 'Every read must explicitly target GLOBAL, including the valid zero enum');
    assert.ok(host.trace.writes.every(write => write.type === 0), 'Every write must explicitly target GLOBAL');
    assert.equal(host.scripts.length, 2);
    assert.deepEqual(host.scripts[0], userRule, 'Unrelated fields and list order must be preserved');
    assert.equal(host.scripts[1].findRegex, '/<toto\\b[^>]*>[\\s\\S]*?<\\/toto>\\s*/gi');
    assert.equal(host.scripts[1].replaceString, '');
    assert.deepEqual(host.scripts[1].placement, [2]);
    assert.equal(host.scripts[1].disabled, false);
    assert.equal(host.scripts[1].markdownOnly, false);
    assert.equal(host.scripts[1].promptOnly, true);
    assert.equal((await host.api.inspectRabbitMirrorNoSendRegex()).status, 'configured');
});

test('missing host capabilities fail closed rather than passing an undefined global scope', async t => {
    const cases = [
        ['engine import unavailable', { engineLoadError: new Error('not installed') }],
        ['read API missing', { enginePatch: { getScriptsByType: undefined } }],
        ['save API missing', { enginePatch: { saveScriptsByType: undefined } }],
        ['SCRIPT_TYPES missing', { enginePatch: { SCRIPT_TYPES: undefined } }],
        ['GLOBAL missing', { enginePatch: { SCRIPT_TYPES: {} } }],
        ['GLOBAL undefined', { enginePatch: { SCRIPT_TYPES: { GLOBAL: undefined } } }],
        ['GLOBAL null', { enginePatch: { SCRIPT_TYPES: { GLOBAL: null } } }],
    ];
    for (const [name, options] of cases) {
        await t.test(name, async () => {
            const host = await runtime({ scripts: [userRule], ...options });
            const inspection = await host.api.inspectRabbitMirrorNoSendRegex();
            const configured = await host.api.configureRabbitMirrorNoSendRegex();
            assert.equal(inspection.available, false);
            assert.equal(configured.available, false);
            assert.equal(configured.ok, false);
            assert.equal(configured.status, 'unavailable');
            assert.equal(host.trace.reads.length, 0);
            assert.equal(host.trace.writes.length, 0);
            assert.deepEqual(host.scripts, [userRule]);
        });
    }
});

test('failed or non-array reads never become an empty replacement list', async t => {
    const cases = [
        ['throws', () => { throw new Error('read failed'); }],
        ['undefined', () => undefined],
        ['null', () => null],
        ['object', () => ({ scripts: [] })],
        ['string', () => '[]'],
    ];
    for (const [name, read] of cases) {
        await t.test(name, async () => {
            const host = await runtime({ scripts: [userRule], read });
            const inspection = await host.api.inspectRabbitMirrorNoSendRegex();
            const configured = await host.api.configureRabbitMirrorNoSendRegex();
            assert.equal(inspection.status, 'read-failed');
            assert.equal(configured.ok, false);
            assert.equal(configured.status, 'read-failed');
            assert.equal(configured.saveAttempted, false);
            assert.equal(host.trace.writes.length, 0);
            assert.deepEqual(host.scripts, [userRule]);
        });
    }
});

test('a managed old rule updates only its own slot', async () => {
    const template = await runtime();
    const old = { ...template.api.rabbitMirrorNoSendRegexScript(), findRegex: '/old-rabbit/g', promptOnly: false };
    const trailing = { ...userRule, id: 'trailing-user', scriptName: 'Trailing user rule' };
    const host = await runtime({ scripts: [userRule, old, trailing] });
    const result = await host.api.configureRabbitMirrorNoSendRegex();
    assert.equal(result.ok, true);
    assert.equal(result.status, 'updated');
    assert.equal(host.trace.writes.length, 1);
    assert.deepEqual(host.scripts, [userRule, host.api.rabbitMirrorNoSendRegexScript(), trailing]);
});

test('a same-name user-modified rule is not overwritten', async () => {
    const template = await runtime();
    const custom = { ...template.api.rabbitMirrorNoSendRegexScript(), id: 'user-owned-rabbit', findRegex: '/custom/g' };
    const host = await runtime({ scripts: [userRule, custom] });
    const result = await host.api.configureRabbitMirrorNoSendRegex();
    assert.equal(result.ok, false);
    assert.equal(result.status, 'conflict');
    assert.equal(host.trace.writes.length, 0);
    assert.deepEqual(host.scripts, [userRule, custom]);
});

test('an equivalent differently named user rule is reused without duplication', async () => {
    const template = await runtime();
    const equivalent = { ...template.api.rabbitMirrorNoSendRegexScript(), id: 'user-equivalent', scriptName: 'Already installed by user' };
    const host = await runtime({ scripts: [userRule, equivalent] });
    for (let index = 0; index < 10; index += 1) {
        const result = await host.api.configureRabbitMirrorNoSendRegex();
        assert.equal(result.ok, true);
        assert.equal(result.status, 'configured');
    }
    assert.equal(host.trace.writes.length, 0);
    assert.deepEqual(host.scripts, [userRule, equivalent]);
});

test('ten concurrent clicks share one save without a timer or repeated request', async () => {
    let releaseSave;
    const waitForRelease = new Promise(resolve => { releaseSave = resolve; });
    let notifySave;
    const saveEntered = new Promise(resolve => { notifySave = resolve; });
    const host = await runtime({ save: async () => { notifySave(); await waitForRelease; } });
    const requests = Array.from({ length: 10 }, () => host.api.configureRabbitMirrorNoSendRegex());
    await saveEntered;
    const writesWhilePending = host.trace.writes.length;
    releaseSave();
    const results = await Promise.all(requests);
    assert.equal(writesWhilePending, 1);
    assert.ok(results.every(result => result.ok === true));
    assert.equal(host.trace.writes.length, 1);
    assert.equal(host.scripts.length, 1);
    assert.equal((await host.api.configureRabbitMirrorNoSendRegex()).status, 'configured');
    assert.equal(host.trace.writes.length, 1);
});

test('save failure is reported without automatic retry or changing unrelated scripts', async () => {
    const host = await runtime({ scripts: [userRule], save: () => { throw new Error('save unavailable'); } });
    const result = await host.api.configureRabbitMirrorNoSendRegex();
    assert.equal(result.ok, false);
    assert.equal(result.status, 'save-failed');
    assert.equal(result.saveAttempted, true);
    assert.equal(host.trace.writes.length, 1);
    assert.deepEqual(host.scripts, [userRule]);
});

test('read-back verifies actual saved values rather than trusting a fulfilled save promise', async t => {
    const cases = [
        ['silent no-op save', { save: () => false }],
        ['read-back throws', { read: ({ scripts, readCount }) => {
            if (readCount > 1) throw new Error('read-back unavailable');
            return scripts;
        } }],
        ['read-back non-array', { read: ({ scripts, readCount }) => readCount > 1 ? null : scripts }],
        ['host discarded unrelated script', { save: ({ next }) => next.slice(1) }],
        ['host reordered scripts', { save: ({ next }) => [...next].reverse() }],
        ['host changed required field', { save: ({ next }) => next.map((script, index) => index === 1 ? { ...script, promptOnly: false } : script) }],
    ];
    for (const [name, options] of cases) {
        await t.test(name, async () => {
            const host = await runtime({ scripts: [userRule], ...options });
            const result = await host.api.configureRabbitMirrorNoSendRegex();
            assert.equal(result.ok, false);
            assert.equal(result.status, 'verification-failed');
            assert.equal(result.saveAttempted, true);
            assert.equal(host.trace.writes.length, 1, 'Uncertain save must not trigger retry or rollback writes');
        });
    }
});

test('extension enabled, disabled, and unknown are distinct runtime results', async t => {
    const cases = [
        ['enabled', { extensions: { extension_settings: { disabledExtensions: [] } } }, false],
        ['disabled', { extensions: { extension_settings: { disabledExtensions: ['regex'] } } }, true],
        ['unrelated extension disabled', { extensions: { extension_settings: { disabledExtensions: ['other'] } } }, false],
        ['unknown import error', { extensionsLoadError: new Error('host unavailable') }, null],
        ['unknown settings missing', { extensions: {} }, null],
        ['unknown list missing', { extensions: { extension_settings: {} } }, null],
        ['unknown list invalid', { extensions: { extension_settings: { disabledExtensions: 'regex' } } }, null],
    ];
    for (const [name, options, expectedDisabled] of cases) {
        await t.test(name, async () => {
            const originalExtensions = options.extensions ? clone(options.extensions) : null;
            const host = await runtime(options);
            const result = await host.api.configureRabbitMirrorNoSendRegex();
            assert.equal(result.ok, true, 'An unavailable enabled-state indicator must not change the saved script');
            assert.equal(result.disabled, expectedDisabled);
            assert.equal((await host.api.inspectRabbitMirrorNoSendRegex()).disabled, expectedDisabled);
            assert.equal(host.scripts[0].disabled, false, 'The managed script is enabled; the host extension state is not rewritten');
            if (options.extensions) assert.deepEqual(options.extensions, originalExtensions, 'Configuring the rule must not enable or otherwise rewrite host extensions');
        });
    }
});

test('opening an unavailable host Regex UI cannot undo successfully saved configuration', async t => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    t.after(() => {
        if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
        else delete globalThis.document;
    });
    const host = await runtime();
    const configured = await host.api.configureRabbitMirrorNoSendRegex();
    assert.equal(configured.ok, true);
    const saved = host.scripts;
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { getElementById: () => null, querySelector: () => null },
    });
    const opened = await host.api.openSillyTavernRegexSettings();
    assert.equal(opened.ok, false);
    assert.equal(opened.reason, 'regex-ui-unavailable');
    assert.equal(host.trace.writes.length, 1);
    assert.deepEqual(host.scripts, saved);
    assert.equal((await host.api.inspectRabbitMirrorNoSendRegex()).status, 'configured');
    assert.equal((await host.api.configureRabbitMirrorNoSendRegex()).status, 'configured');
    assert.equal(host.trace.writes.length, 1);
});
