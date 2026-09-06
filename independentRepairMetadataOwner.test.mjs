import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The real identity producer, repair consumer, local storage and metadata
// compactors run together. Only host/DOM, interaction scrubbing and owner-lock
// boundaries are doubled. No host save, network, private chat or model is used.
const source = readFileSync(process.env.RM_REPAIR_BASELINE_ROOT
    ? resolve(process.env.RM_REPAIR_BASELINE_ROOT, 'src/independentApi.js')
    : new URL('../src/independentApi.js', import.meta.url), 'utf8');
function block(name) {
    const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
    assert.ok(match, `production ${name}`);
    const ends = ['\nfunction ', '\nasync function ', '\nexport function ', '\nexport async function ']
        .map(marker => source.indexOf(marker, match.index + match[0].length)).filter(index => index > match.index);
    return source.slice(match.index, Math.min(...ends));
}
const production = ['byteLength', 'independentRecordWithinBudget', 'readStore', 'compactOutputStore', 'writeStore',
    'normalizeHistoryEntry', 'copyIndependentReplacementReceipt', 'sealIndependentTextReplacementRecord',
    'emptyChatOutputMetadata', 'chatMetadataObject', 'compactChatPersistedRecord', 'saveChatOutputMetadata',
    'chatOwnerKey', 'swipeId', 'persistedOwnerForMessage', 'writePersistedOwner',
    'slotSearchKeys', 'findSavedRecord', 'saveRecordForSlot', 'currentGenerationIdentity',
    'persistIndependentRepairFromEvent'].map(block).join('\n');

function fixture({ faceCount = 1, index = 3, swipe = 2, metadata = true, large = false } = {}) {
    const message = { is_user: false, mes: 'Synthetic lighthouse scene.', swipe_id: swipe };
    const ctx = { chat: Array(index + 1).fill(null), ...(metadata ? { chatMetadata: {} } : {}) };
    ctx.chat[index] = message;
    const sourceHash = 'synthetic-source';
    const base = `synthetic-chat:${index}:${swipe}`;
    const slot = `${base}:${sourceHash}`;
    const html = Array.from({ length: faceCount }, (_, i) => `<details><summary>Original lighthouse ${i}</summary><p>Repaired synthetic scene ${i}${large ? 'x'.repeat(330 * 1024) : ''}</p></details>`).join('');
    const faces = Array.from({ length: faceCount }, () => ({
        setAttribute() {}, contains() { return false; },
        cloneNode() { return { outerHTML: html, setAttribute() {}, querySelectorAll() { return []; } }; },
    }));
    const host = { isConnected: true, dataset: { rmState: 'ready', rmSourceHash: sourceHash }, matches() { return true; } };
    const storage = new Map(), locks = new Map();
    const receipt = { version: 1, ownerKey: slot, htmlHash: 'a'.repeat(64), rulesHash: 'b'.repeat(64) };
    const initial = { html, sourceHash, textReplacementReceipt: receipt,
        ...(faceCount > 1 ? { apiRequest: { faces: faces.map((_, i) => ({ themeIds: [`T${i}`], formatIds: [`F${i}`] })) }, textReplacementReceipts: faces.map(() => receipt) } : {}) };
    storage.set('local-outputs', JSON.stringify({ [slot]: initial }));
    const box = {
        TextEncoder, Date, console: { debug() {}, warn() {} },
        STORE_KEY: 'local-outputs', CHAT_OUTPUT_METADATA_KEY: 'metadata-outputs', CHAT_OUTPUT_METADATA_SCHEMA: 2,
        INDEPENDENT_HTML_BUDGET_BYTES: 512 * 1024, INDEPENDENT_RECORD_BUDGET_BYTES: 640 * 1024,
        OUTPUT_STORE_BUDGET_BYTES: 1600000, RUNTIME_VERSION: 'synthetic-test',
        SOURCE_ATTR: 'data-source', MAINTENANCE_PERSISTED_LAYOUT_ATTR: 'data-repaired',
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
        getContext: () => ctx, getSettings: () => ({ rabbitMirrorBannedWords: [] }),
        isRabbitMirrorEligibleAssistantMessage: msg => !!msg && msg.is_user !== true && typeof msg.mes === 'string',
        observeMessageSourceRevision: () => ({ slot, sourceHash, bodyHash: sourceHash, displayHash: '', reasoningHash: '', legacySlots: [] }),
        messageBaseSlotKey: () => base, recordKey: () => slot, baseSlotOf: () => base,
        messageIndexForExternalHost: () => index, externalFaceDetails: () => faces,
        readyDetailsFromHost: () => faces[0], usableReadyDetails: () => true, serializeExternalFaceDetails: () => html,
        initialHtmlForRecord: (_slot, record) => record?.html || '', scrubIndependentInteractionState: value => value,
        independentStoredHtmlRestorable: value => value.startsWith('<details>'),
        appendHistoryEntry() {}, independentPaletteFingerprintFromHtml: () => null, hashText: () => 'hash',
        setOwnerLockForBase: (key, value, hash) => locks.set(key, { slot: value, sourceHash: hash }),
        ownerLockForBase: key => locks.get(key), warnStorageTrimmed() {},
        clearExternalHostFreshSourceState() {}, scheduleExternalShellTint() {},
    };
    vm.createContext(box);
    vm.runInContext(production, box);
    const event = { detail: { host, root: faces[faceCount - 1] } };
    return { box, ctx, message, event, html, index, swipe, sourceHash, slot, storage, receipt };
}

test('production identity preserves numeric owner index including message zero', () => {
    for (const index of [0, 3]) {
        const f = fixture({ index });
        assert.equal(f.box.currentGenerationIdentity(index).index, index);
    }
});

for (const faceCount of [1, 5]) {
    test(`repair ${faceCount} face(s) persists exact bytes under the producer owner and preserves receipts`, () => {
        const f = fixture({ faceCount });
        const result = f.box.persistIndependentRepairFromEvent(f.event);
        assert.equal(result, true, f.event.detail.persistenceReason);
        const saved = f.box.persistedOwnerForMessage(f.ctx, f.index, f.message);
        assert.equal(saved.html, f.html);
        assert.equal(saved.sourceHash, f.sourceHash);
        assert.equal(saved.repairedByMaintenance, true);
        assert.deepEqual(JSON.parse(JSON.stringify(saved.textReplacementReceipt)), f.receipt);
        if (faceCount > 1) {
            assert.equal(saved.apiRequest.faces.length, faceCount);
            assert.equal(saved.textReplacementReceipts.length, faceCount);
        }
        assert.deepEqual(Object.keys(f.ctx.chatMetadata['metadata-outputs'].owners), [`${f.index}:${f.swipe}`]);
        assert.equal(f.message.mes, 'Synthetic lighthouse scene.');
        assert.equal(f.event.detail.persisted, true);
    });
}

test('unavailable metadata fails visibly after local fallback without claiming server persistence', () => {
    const f = fixture({ metadata: false });
    assert.equal(f.box.persistIndependentRepairFromEvent(f.event), false);
    assert.equal(f.event.detail.persistenceReason, 'chat metadata read-back mismatch');
    assert.equal(JSON.parse(f.storage.get('local-outputs'))[f.slot].html, f.html);
    assert.equal(f.event.detail.persisted, false);
});

test('wrong mounted source fails before either local or metadata write', () => {
    const f = fixture({ faceCount: 5 });
    const before = f.storage.get('local-outputs');
    f.event.detail.host.dataset.rmSourceHash = 'different-source';
    assert.equal(f.box.persistIndependentRepairFromEvent(f.event), false);
    assert.equal(f.event.detail.persistenceReason, 'mounted sourceHash no longer matches current source');
    assert.equal(f.storage.get('local-outputs'), before);
    assert.deepEqual(f.ctx.chatMetadata, {});
});

test('over-budget repair rejects before replacing the previous local result', () => {
    const f = fixture({ large: true });
    const before = f.storage.get('local-outputs');
    assert.equal(f.box.persistIndependentRepairFromEvent(f.event), false);
    assert.equal(f.storage.get('local-outputs') === before, true, 'budget failure must not remove the last recoverable local result');
    assert.equal(f.event.detail.persistenceReason, 'repaired mirror exceeds storage budget');
    assert.deepEqual(f.ctx.chatMetadata, {});
});
