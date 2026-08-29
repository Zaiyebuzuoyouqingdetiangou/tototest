import { eventSource, event_types, setExtensionPrompt, extension_prompt_types, extension_prompt_roles } from '../../../../../script.js';
import * as hostRuntime from '../../../../../script.js';
import { MODULE_NAME, getSettings } from './settings.js?rmv=1.5-qualityfix3';
import {
    buildFeedbackCatFinalCheck,
    buildFeedbackCatPrompt,
    clearFeedbackCatExtensionPrompt,
    getActiveFeedbackForCurrentChat,
    markFeedbackCatInjected,
} from './feedbackCat.js?rmv=1.5-qualityfix3';
import { recordRabbitMirrorInjection, recordRabbitMirrorNoInjection } from './tokenMeter.js?rmv=1.5-qualityfix3';
import { getCurrentChatKey } from './storage.js?rmv=1.5-qualityfix3';

const INJECT_KEY = `${MODULE_NAME}:auto_injection`;

let generationInvocationSequence = 0;
let independentGenerationIntentSequence = 0;
let promptBuilderPromise = null;
let generationGuardPromise = null;

const INDEPENDENT_GENERATION_INTENTS_KEY = '__rabbitMirrorIndependentGenerationIntents';
const INDEPENDENT_GENERATION_STOPS_KEY = '__rabbitMirrorIndependentStoppedHostOperations';
const INDEPENDENT_GENERATION_INTENT_BRIDGE_CLEANUP_KEY = '__rabbitMirrorIndependentGenerationIntentBridgeCleanup';
const INDEPENDENT_GENERATION_INTENT_TTL_MS = 5 * 60 * 1000;
const INDEPENDENT_GENERATION_INTENT_MAX = 8;
const INDEPENDENT_GENERATION_INTENT_TYPES = new Set(['normal', 'continue', 'swipe', 'regenerate']);
let independentIntentBridgeSubscriptions = [];
let independentCoreRuntimeWakeTimer = 0;

function hashIndependentIntentText(text = '') {
    let hash = 2166136261;
    for (const char of String(text || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function currentIndependentIntentContext() {
    try {
        return globalThis.SillyTavern?.getContext?.() || {};
    } catch {
        return {};
    }
}

function currentIndependentIntentChat() {
    const chat = currentIndependentIntentContext().chat;
    return Array.isArray(chat) ? chat : [];
}

function currentIndependentGenerationIntents() {
    const now = Date.now();
    const source = Array.isArray(globalThis[INDEPENDENT_GENERATION_INTENTS_KEY])
        ? globalThis[INDEPENDENT_GENERATION_INTENTS_KEY]
        : [];
    const current = source.filter(item => item && now - Number(item.startedAt || 0) <= INDEPENDENT_GENERATION_INTENT_TTL_MS);
    if (current.length !== source.length) globalThis[INDEPENDENT_GENERATION_INTENTS_KEY] = current;
    return current;
}

function isIndependentToolResultMessage(message) {
    const extra = message?.extra;
    return message?.is_system === true
        || extra?.isSmallSys === true
        || !!(extra && Object.prototype.hasOwnProperty.call(extra, 'tool_invocations'));
}

function isIndependentEligibleAssistantMessage(message) {
    return !!message
        && message.is_user !== true
        && !isIndependentToolResultMessage(message)
        && typeof message.mes === 'string';
}

function independentIntentTailRole(message) {
    if (message?.is_user === true) return 'user';
    if (isIndependentToolResultMessage(message)) return 'system';
    if (isIndependentEligibleAssistantMessage(message)) return 'assistant';
    return '';
}

function independentHostGenerationMayUseTools(type, ctx = currentIndependentIntentContext()) {
    const normalized = String(type || '').trim().toLowerCase();
    if (!['normal', 'swipe', 'regenerate'].includes(normalized)) return false;
    const mainApi = String(ctx?.mainApi || hostRuntime?.main_api || '').trim().toLowerCase();
    if (mainApi && mainApi !== 'openai') return false;
    try {
        if (typeof ctx?.canPerformToolCalls === 'function') return ctx.canPerformToolCalls(normalized) !== false;
        if (typeof ctx?.ToolManager?.canPerformToolCalls === 'function') return ctx.ToolManager.canPerformToolCalls(normalized) !== false;
    } catch { return true; }
    if (ctx?.chatCompletionSettings?.function_calling === false) return false;
    return true;
}

function independentHostRenderProof(index, toolCapable = true) {
    const processor = hostRuntime?.streamingProcessor;
    if (processor && Number(processor.messageId) === Number(index) && processor.isFinished === true) {
        return Array.isArray(processor.toolCalls) && processor.toolCalls.length > 0
            ? 'stream-tool-intermediate'
            : 'stream-final';
    }
    return toolCapable === false ? 'non-tool-final' : 'exact-render';
}

function independentIntentCandidateIndex(intent, chat) {
    if (!intent || !INDEPENDENT_GENERATION_INTENT_TYPES.has(String(intent.type || ''))) return null;
    const messages = Array.isArray(chat) ? chat : [];
    const tailIndex = Number(intent.tailIndex);
    if (!Number.isInteger(tailIndex) || tailIndex < 0) return null;
    const tail = messages[tailIndex];
    const tailRole = String(intent.tailRole || '');
    const type = String(intent.type || '');
    if (type === 'normal') {
        if (independentIntentTailRole(tail) !== tailRole
            || hashIndependentIntentText(tail?.mes || '') !== String(intent.tailBodyHash || '')
            || (Number(tail?.swipe_id ?? tail?.swipeId ?? 0) || 0) !== Number(intent.tailSwipeId || 0)) return null;
        const candidate = messages[tailIndex + 1];
        return isIndependentEligibleAssistantMessage(candidate) && String(candidate.mes || '').trim() ? tailIndex + 1 : null;
    }
    if (['continue', 'swipe', 'regenerate'].includes(type)
        && tailRole === 'assistant'
        && isIndependentEligibleAssistantMessage(tail)) {
        const changed = hashIndependentIntentText(tail.mes || '') !== String(intent.tailBodyHash || '')
            || (Number(tail?.swipe_id ?? tail?.swipeId ?? 0) || 0) !== Number(intent.tailSwipeId || 0);
        return changed ? tailIndex : null;
    }
    return null;
}

function resolveIndependentIntentCompletionIndex(payload, chat) {
    const candidates = [payload, payload?.messageId, payload?.message_id, payload?.mesid, payload?.id];
    for (const value of candidates) {
        const index = Number(value);
        if (Number.isInteger(index) && index >= 0 && isIndependentEligibleAssistantMessage(chat[index])) return index;
    }
    return null;
}

function markIndependentGenerationIntentCompleted(payload, reason = 'host-completed') {
    const intents = currentIndependentGenerationIntents();
    if (!intents.length) return false;
    const chat = currentIndependentIntentChat();
    const chatKey = String(getCurrentChatKey(chat) || '');
    if (!chatKey || !intents.some(intent => String(intent?.chatKey || '') === chatKey)) return false;
    const index = resolveIndependentIntentCompletionIndex(payload, chat);
    if (!Number.isInteger(index)) return false;
    const message = chat[index];
    const finalBodyHash = hashIndependentIntentText(message?.mes || '');
    if (!finalBodyHash || !String(message?.mes || '').trim()) return false;
    let changed = false;
    const next = intents.map(intent => {
        if (String(intent.chatKey || '') !== chatKey || independentIntentCandidateIndex(intent, chat) !== index) return intent;
        changed = true;
        const toolCapable = intent.toolCapable !== false || independentHostGenerationMayUseTools(intent.type);
        const finalProof = independentHostRenderProof(index, toolCapable);
        const next = { ...intent, toolCapable };
        if (finalProof === 'stream-tool-intermediate') {
            delete next.completedAt;
            delete next.completionReason;
            delete next.finalIndex;
            delete next.finalBodyHash;
            delete next.finalProof;
            next.intermediateAt = Date.now();
            next.intermediateIndex = index;
            return Object.freeze(next);
        }
        return Object.freeze({ ...next,
            completedAt: Date.now(), completionReason: String(reason || '').slice(0, 64),
            finalIndex: index, finalBodyHash, finalProof,
        });
    });
    globalThis[INDEPENDENT_GENERATION_INTENTS_KEY] = next;
    return changed;
}

function markIndependentGenerationIntentTerminal(reason = 'host-terminal') {
    const intents = currentIndependentGenerationIntents();
    if (!intents.length) return false;
    const chat = currentIndependentIntentChat();
    const chatKey = String(getCurrentChatKey(chat) || '');
    if (!chatKey || !intents.some(intent => String(intent?.chatKey || '') === chatKey)) return false;
    let changed = false;
    const next = intents.map(intent => {
        if (String(intent?.chatKey || '') !== chatKey) return intent;
        changed = true;
        if (intent.auxiliaryTerminalPending === true) {
            const next = { ...intent, auxiliaryTerminalAt: Date.now(), auxiliaryTerminalReason: String(reason || '').slice(0, 64) };
            delete next.auxiliaryTerminalPending;
            delete next.auxiliaryStartedAt;
            return Object.freeze(next);
        }
        return Object.freeze({ ...intent,
            terminalAt: Date.now(), terminalReason: String(reason || '').slice(0, 64),
        });
    });
    globalThis[INDEPENDENT_GENERATION_INTENTS_KEY] = next;
    return changed;
}

function scheduleIndependentCoreRuntimeWake() {
    if (independentCoreRuntimeWakeTimer || typeof globalThis.setTimeout !== 'function') return false;
    // Intent proof is recorded synchronously, but the 2 MiB deferred graph starts in
    // the next task so SillyTavern can dispatch its main request first.
    independentCoreRuntimeWakeTimer = globalThis.setTimeout(() => {
        independentCoreRuntimeWakeTimer = 0;
        try {
            const runtimeLoad = globalThis.__rabbitMirrorEnsureDeferredCoreRuntime?.('independent-generation-intent');
            if (runtimeLoad && typeof runtimeLoad.catch === 'function') void runtimeLoad.catch(() => {});
        } catch {}
    }, 0);
    return true;
}

function recordIndependentGenerationIntent(chat, type = '') {
    const messages = Array.isArray(chat) ? chat : [];
    const normalizedType = String(type || 'normal').trim().toLowerCase() || 'normal';
    const chatKey = String(getCurrentChatKey(messages) || '');
    const previous = currentIndependentGenerationIntents();
    if (!INDEPENDENT_GENERATION_INTENT_TYPES.has(normalizedType)) {
        let changed = false;
        const next = previous.map(intent => {
            if (!chatKey || String(intent?.chatKey || '') !== chatKey) return intent;
            changed = true;
            return Object.freeze({ ...intent, auxiliaryTerminalPending: true, auxiliaryStartedAt: Date.now() });
        });
        if (changed) globalThis[INDEPENDENT_GENERATION_INTENTS_KEY] = next;
        return null;
    }
    const tailIndex = messages.length - 1;
    const tail = tailIndex >= 0 ? messages[tailIndex] : null;
    if (!tail || typeof tail?.is_user !== 'boolean') return null;
    // Host prompt transforms may clone or alter `_chat`. When the same tail exists in
    // SillyTavern's current raw chat, anchor the proof to that raw正文 instead.
    const hostContext = currentIndependentIntentContext();
    const rawTail = hostContext.chat?.[tailIndex];
    const hostTail = Array.isArray(hostContext.chat) ? hostContext.chat.at(-1) : messages.at(-1);
    const toolTail = Array.isArray(hostTail?.extra?.tool_invocations) && hostTail.extra.tool_invocations.length > 0;
    const stops = Array.isArray(globalThis[INDEPENDENT_GENERATION_STOPS_KEY]) ? globalThis[INDEPENDENT_GENERATION_STOPS_KEY] : [];
    if (normalizedType === 'normal' && toolTail && stops.some(stop => stop?.chatKey === chatKey)) return null;
    if (stops.length) globalThis[INDEPENDENT_GENERATION_STOPS_KEY] = stops.filter(stop => stop?.chatKey !== chatKey);
    const proofTail = rawTail && independentIntentTailRole(rawTail) === independentIntentTailRole(tail) ? rawTail : tail;
    const tailRole = independentIntentTailRole(proofTail);
    if (!tailRole) return null;
    const now = Date.now();
    independentGenerationIntentSequence += 1;
    const intent = Object.freeze({
        id: `${now.toString(36)}:${independentGenerationIntentSequence.toString(36)}`,
        chatKey,
        startedAt: now,
        type: normalizedType,
        toolCapable: independentHostGenerationMayUseTools(normalizedType, hostContext),
        tailIndex,
        tailRole,
        tailBodyHash: hashIndependentIntentText(proofTail.mes || ''),
        tailSwipeId: Number(proofTail?.swipe_id ?? proofTail?.swipeId ?? 0) || 0,
    });
    // Every visible START supersedes older proof for this chat. Tool recursion
    // therefore revokes the pre-tool assistant before the nested final can render.
    globalThis[INDEPENDENT_GENERATION_INTENTS_KEY] = [...previous.filter(item => String(item?.chatKey || '') !== chatKey), intent]
        .slice(-INDEPENDENT_GENERATION_INTENT_MAX);
    scheduleIndependentCoreRuntimeWake();
    return intent;
}

function clearIndependentGenerationIntents() {
    globalThis[INDEPENDENT_GENERATION_INTENTS_KEY] = [];
    globalThis[INDEPENDENT_GENERATION_STOPS_KEY] = [];
}

export function initIndependentGenerationIntentBridge() {
    try { globalThis[INDEPENDENT_GENERATION_INTENT_BRIDGE_CLEANUP_KEY]?.(); } catch {}
    destroyIndependentGenerationIntentBridge();
    const bindings = [
        // END/STOP carries no message owner in SillyTavern. Preserve only an
        // unscoped terminal hint; never fabricate a final正文 hash from the tail.
        [event_types?.GENERATION_ENDED, () => markIndependentGenerationIntentTerminal('generation-ended')],
        [event_types?.GENERATION_STOPPED, () => markIndependentGenerationIntentTerminal('generation-stopped')],
        [event_types?.CHARACTER_MESSAGE_RENDERED, payload => markIndependentGenerationIntentCompleted(payload, 'character-rendered')],
        [event_types?.CHAT_CHANGED, clearIndependentGenerationIntents],
    ].filter(([event]) => !!event);
    for (const [event, handler] of bindings) {
        try {
            eventSource?.on?.(event, handler);
            independentIntentBridgeSubscriptions.push({ event, handler });
        } catch {}
    }
    globalThis[INDEPENDENT_GENERATION_INTENT_BRIDGE_CLEANUP_KEY] = destroyIndependentGenerationIntentBridge;
}

export function destroyIndependentGenerationIntentBridge({ clearIntents = false } = {}) {
    if (independentCoreRuntimeWakeTimer) {
        try { globalThis.clearTimeout?.(independentCoreRuntimeWakeTimer); } catch {}
        independentCoreRuntimeWakeTimer = 0;
    }
    for (const { event, handler } of independentIntentBridgeSubscriptions) {
        try { eventSource?.off?.(event, handler); } catch {}
    }
    independentIntentBridgeSubscriptions = [];
    if (globalThis[INDEPENDENT_GENERATION_INTENT_BRIDGE_CLEANUP_KEY] === destroyIndependentGenerationIntentBridge) {
        try { delete globalThis[INDEPENDENT_GENERATION_INTENT_BRIDGE_CLEANUP_KEY]; } catch {}
    }
    if (clearIntents) {
        try { delete globalThis[INDEPENDENT_GENERATION_INTENTS_KEY]; } catch {}
        try { delete globalThis[INDEPENDENT_GENERATION_STOPS_KEY]; } catch {}
    }
}

function loadPromptBuilder() {
    if (!promptBuilderPromise) {
        promptBuilderPromise = import('./promptBuilder.js?rmv=1.5-qualityfix3').catch(error => {
            promptBuilderPromise = null;
            throw error;
        });
    }
    return promptBuilderPromise;
}

function loadGenerationGuard() {
    if (!generationGuardPromise) {
        generationGuardPromise = import('./generationGuard.js?rmv=1.5-qualityfix3').catch(error => {
            generationGuardPromise = null;
            throw error;
        });
    }
    return generationGuardPromise;
}

export function prewarmRabbitMirrorGenerationRuntime() {
    return Promise.all([loadPromptBuilder(), loadGenerationGuard()]).then(() => true);
}

function createGenerationScopeKey(type) {
    generationInvocationSequence += 1;
    const generationType = String(type || 'normal').replace(/[^a-z0-9_-]+/gi, '-');
    return `${generationType}:${Date.now().toString(36)}:${generationInvocationSequence.toString(36)}`;
}

export function clearRabbitMirrorPrompt(reason = 'cleared', generationType = '') {
    clearFeedbackCatExtensionPrompt();
    try {
        setExtensionPrompt(INJECT_KEY, '', extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
        recordRabbitMirrorNoInjection(reason, generationType);
    } catch (error) {
        console.warn('[RabbitMirror] Failed to clear extension prompt:', error);
    }
}

export async function rabbitMirrorGenerateInterceptor(_chat, _contextSize, _abort, type) {
    const settings = getSettings();

    if (settings.generationSource === 'independent') {
        // The full independent runtime is intentionally deferred during page startup.
        // Capture this exact host generation before returning so a fast model cannot
        // finish before the deferred event subscribers exist. Loading is fire-and-forget:
        // it never blocks or joins the host's paid main-generation request.
        if (settings.enabled && settings.autoRabbitMirrorInjection && settings.mode !== 'off') {
            recordIndependentGenerationIntent(_chat, type);
        }
        clearRabbitMirrorPrompt('independent-api', type);
        return;
    }

    const skipQuiet = settings.skipQuiet && type === 'quiet';
    const skipImpersonate = settings.skipImpersonate && type === 'impersonate';

    if (!settings.enabled || !settings.autoRabbitMirrorInjection || settings.mode === 'off' || skipQuiet || skipImpersonate) {
        const reason = skipQuiet
            ? 'quiet-skipped'
            : skipImpersonate
                ? 'impersonate-skipped'
                : 'disabled';
        clearRabbitMirrorPrompt(reason, type);
        return;
    }

    const activeFeedback = settings.feedbackCatEnabled !== false ? getActiveFeedbackForCurrentChat(_chat) : null;
    const feedbackPrompt = activeFeedback ? buildFeedbackCatPrompt(activeFeedback) : '';
    const feedbackFinalCheck = activeFeedback ? buildFeedbackCatFinalCheck(activeFeedback) : '';
    // 冻结 0.33.77 的基础生成 Prompt 与拼接位置：基础 Prompt 逐字保持，反馈仅在其后追加。
    // 未选择反馈时不追加任何字符，基础 Prompt 保持逐字不变。
    clearFeedbackCatExtensionPrompt();
    const generationScopeKey = createGenerationScopeKey(type);
    const [{ buildRabbitMirrorPromptDetails }, { attachRabbitMirrorGenerationSelection, beginRabbitMirrorGenerationAttempt }] = await Promise.all([
        loadPromptBuilder(),
        loadGenerationGuard(),
    ]);
    beginRabbitMirrorGenerationAttempt(_chat, generationScopeKey);
    const promptDetails = buildRabbitMirrorPromptDetails(settings, type, null, generationScopeKey, { chat: _chat });
    attachRabbitMirrorGenerationSelection(promptDetails.metadata);
    const basePrompt = promptDetails.prompt;
    if (!basePrompt) {
        clearRabbitMirrorPrompt(promptDetails.metadata?.disabled ? 'directive-skipped' : 'empty', type);
        return;
    }
    const prompt = feedbackPrompt
        ? `${basePrompt}\n\n${feedbackPrompt}${feedbackFinalCheck ? `\n\n${feedbackFinalCheck}` : ''}`
        : basePrompt;
    const role = settings.role === 'user' ? extension_prompt_roles.USER : settings.role === 'assistant' ? extension_prompt_roles.ASSISTANT : extension_prompt_roles.SYSTEM;

    setExtensionPrompt(
        INJECT_KEY,
        prompt,
        extension_prompt_types.IN_CHAT,
        Number(settings.depth) || 0,
        false,
        role,
    );
    recordRabbitMirrorInjection({
        prompt,
        basePrompt,
        generationType: type,
        metadata: promptDetails.metadata,
    });
    if (activeFeedback && feedbackPrompt) markFeedbackCatInjected(activeFeedback, type, feedbackPrompt);
}
