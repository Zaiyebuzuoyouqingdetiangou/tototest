import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getCurrentChatKey } from '../src/storage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/independentApi.js'), 'utf8');
const classifierStart = source.indexOf('function isRabbitMirrorToolResultMessage(');
const classifierEnd = source.indexOf('function recentAssistantMessages(', classifierStart);
const lifecycleStart = source.indexOf('function ensureAutomaticGenerationCutover(');
const lifecycleEnd = source.indexOf('\nfunction recoverDeferredIndependentGenerations(', lifecycleStart);

assert.ok(classifierStart >= 0 && classifierEnd > classifierStart, 'assistant/system classifier block must exist');
assert.ok(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart, 'automatic host lifecycle block must exist');

const previousSillyTavern = globalThis.SillyTavern;
let activeChat = [];

function useTemporaryChat(chat) {
    activeChat = chat;
    return getCurrentChatKey(chat);
}

function assistantNote(sendDate) {
    return {
        is_user: false,
        is_system: true,
        name: 'SillyTavern System',
        mes: 'Temporary chat assistant note',
        send_date: sendDate,
        extra: { isSmallSys: true, type: 'assistant_note' },
    };
}

globalThis.SillyTavern = {
    getContext: () => ({
        chat: activeChat,
        characterId: undefined,
        groupId: undefined,
        chatId: undefined,
        chatMetadata: {},
        name2: 'SillyTavern System',
    }),
};

try {
    // SillyTavern Temporary Chat has no persisted character/group/chat id. Its
    // ASSISTANT_NOTE must provide one stable identity throughout later turns.
    const identityChat = [assistantNote('2026-08-29T01:02:03.004Z')];
    const identityKeys = [useTemporaryChat(identityChat)];
    identityChat.push(
        { is_user: true, mes: 'USER ONE' },
        { is_user: false, mes: 'ASSISTANT ONE' },
    );
    identityKeys.push(useTemporaryChat(identityChat));
    identityChat.push(
        { is_user: true, mes: 'USER TWO' },
        { is_user: false, mes: 'ASSISTANT TWO' },
    );
    identityKeys.push(useTemporaryChat(identityChat));

    assert.match(identityKeys[0], /^fallback:/, 'Temporary Chat without persisted ids must use a fallback identity');
    assert.equal(new Set(identityKeys).size, 1, 'Temporary Chat identity must not drift after its first or second turn');

    let now = 10_000;
    const sandbox = {
        automaticGenerationCutovers: new Map(),
        INDEPENDENT_GENERATION_INTENTS_KEY: '__testIntents',
        INDEPENDENT_GENERATION_STOPS_KEY: '__testStops',
        INDEPENDENT_GENERATION_INTENT_TYPES: new Set(['normal', 'continue', 'swipe', 'regenerate']),
        runtimeMode: () => 'independent',
        hostModule: { main_api: 'openai', streamingProcessor: null },
        chatKey: ctx => useTemporaryChat(ctx?.chat || []),
        automaticCutoverVersionToken: message => `${Number(message?.swipe_id ?? message?.swipeId ?? 0) || 0}:${String(message?.mes || '')}`,
        Date: { now: () => ++now },
        clearTimeout: () => {},
        Number,
        String,
        Map,
        Object,
        Array,
        globalThis: {},
    };

    vm.createContext(sandbox);
    vm.runInContext(`${source.slice(classifierStart, classifierEnd)}
${source.slice(lifecycleStart, lifecycleEnd)}
globalThis.begin = beginAutomaticHostGeneration;
globalThis.render = noteAutomaticHostGenerationRender;
globalThis.terminal = noteAutomaticHostGenerationTerminal;
globalThis.candidate = automaticHostGenerationSettlementCandidate;
globalThis.settle = settleAutomaticHostGeneration;
globalThis.suppresses = suppressesAutomaticGeneration;
globalThis.toolTail = automaticHostToolResultTail;`, sandbox);

    function finishNormalTurn(ctx, userText, assistantText, expectedIndex) {
        // Official ST emits GENERATION_STARTED before appending the new user row.
        assert.equal(sandbox.globalThis.begin(ctx, 'normal', false, false), 'new');
        ctx.chat.push(
            { is_user: true, mes: userText },
            { is_user: false, mes: assistantText },
        );
        assert.equal(sandbox.globalThis.render(ctx, expectedIndex), true);
        assert.equal(sandbox.globalThis.terminal(ctx, `end-${expectedIndex}`), 'terminal');
        assert.equal(sandbox.globalThis.candidate(ctx, { externalActive: false })?.index, expectedIndex);
        assert.equal(sandbox.globalThis.settle(ctx, expectedIndex, `settled-${expectedIndex}`), true);
        assert.equal(sandbox.globalThis.settle(ctx, expectedIndex, `duplicate-${expectedIndex}`), false,
            'one normal operation must not be authorized twice');
    }

    // Two ordinary Temporary Chat turns authorize their own exact assistant rows,
    // once each, while retaining one stable chat identity.
    const twoTurnChat = [assistantNote('2026-08-29T02:00:00.000Z')];
    const twoTurnContext = { chat: twoTurnChat, canPerformToolCalls: () => false };
    finishNormalTurn(twoTurnContext, 'USER ONE', 'ASSISTANT ONE', 2);
    finishNormalTurn(twoTurnContext, 'USER TWO', 'ASSISTANT TWO', 4);
    const twoTurnCutover = sandbox.automaticGenerationCutovers.get(useTemporaryChat(twoTurnChat));
    assert.deepEqual([...twoTurnCutover.authorized.keys()], [2, 4]);
    assert.equal(twoTurnCutover.activeHostGeneration, null);
    assert.equal(sandbox.globalThis.suppresses(twoTurnContext, 2), false);
    assert.equal(sandbox.globalThis.suppresses(twoTurnContext, 4), false);

    // Even if the first operation loses both exact RENDER and END, the next plain
    // normal START is a fresh owner. It must not inherit the stale first owner.
    const staleChat = [assistantNote('2026-08-29T03:00:00.000Z')];
    const staleContext = { chat: staleChat, canPerformToolCalls: () => false };
    assert.equal(sandbox.globalThis.begin(staleContext, 'normal', false, false), 'new');
    staleChat.push(
        { is_user: true, mes: 'MISSED USER ONE' },
        { is_user: false, mes: 'MISSED ASSISTANT ONE' },
    );
    const staleCutover = sandbox.automaticGenerationCutovers.get(useTemporaryChat(staleChat));
    const firstOwner = staleCutover.activeHostGeneration;
    assert.equal(sandbox.globalThis.toolTail(staleContext), false);
    assert.equal(sandbox.globalThis.begin(staleContext, 'normal', false, false), 'new');
    assert.notEqual(staleCutover.activeHostGeneration, firstOwner, 'fresh normal START must replace a stale non-tool owner');
    staleChat.push(
        { is_user: true, mes: 'USER TWO AFTER MISSED EVENTS' },
        { is_user: false, mes: 'ASSISTANT TWO AFTER MISSED EVENTS' },
    );
    assert.equal(sandbox.globalThis.render(staleContext, 4), true);
    assert.equal(sandbox.globalThis.terminal(staleContext, 'second-end'), 'terminal');
    assert.equal(sandbox.globalThis.candidate(staleContext, { externalActive: false })?.index, 4);
    assert.equal(sandbox.globalThis.settle(staleContext, 4, 'second-settled'), true);
    assert.deepEqual([...staleCutover.authorized.keys()], [4], 'the unproven first reply must remain denied');
    assert.equal(staleCutover.activeHostGeneration, null);

    // Nested ownership requires an actual performed tool invocation at the live
    // tail. Ordinary system rows and empty markers are not recursion evidence.
    assert.equal(sandbox.globalThis.toolTail({ chat: [{ is_system: true, mes: 'NOTICE' }] }), false);
    assert.equal(sandbox.globalThis.toolTail({ chat: [{ is_system: true, mes: 'EMPTY', extra: { tool_invocations: [] } }] }), false);
    assert.equal(sandbox.globalThis.toolTail({ chat: [{ is_system: true, mes: 'TOOL RESULT', extra: { tool_invocations: [{}] } }] }), true);

    const toolChat = [assistantNote('2026-08-29T04:00:00.000Z')];
    const toolContext = { chat: toolChat, canPerformToolCalls: () => true };
    assert.equal(sandbox.globalThis.begin(toolContext, 'normal', false, false), 'new');
    toolChat.push(
        { is_user: true, mes: 'USE TOOL' },
        { is_user: false, mes: 'TOOL CALL FRAME' },
        { is_user: false, is_system: true, mes: 'TOOL RESULT', extra: { isSmallSys: true, tool_invocations: [{ name: 'actual-tool' }] } },
    );
    const toolCutover = sandbox.automaticGenerationCutovers.get(useTemporaryChat(toolChat));
    const outerOwner = toolCutover.activeHostGeneration;
    assert.equal(sandbox.globalThis.toolTail(toolContext), true);
    assert.equal(sandbox.globalThis.begin(toolContext, 'normal', true, false), 'nested');
    assert.equal(toolCutover.activeHostGeneration, outerOwner, 'real tool recursion must retain the outer visible owner');
    assert.equal(toolCutover.activeHostGeneration.phase, 1);

    console.log('temporaryChatTwoTurnLifecycle: stable fallback identity, two fresh turns, stale-owner replacement, and strong tool-tail nesting passed');
} finally {
    if (previousSillyTavern === undefined) delete globalThis.SillyTavern;
    else globalThis.SillyTavern = previousSillyTavern;
}
