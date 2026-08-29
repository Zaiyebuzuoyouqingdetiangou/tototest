import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');
const independent = readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../src/settings.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');

function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `missing ${name}`);
    const parametersStart = source.indexOf('(', start);
    let parameterDepth = 0;
    let parametersEnd = -1;
    for (let index = parametersStart; index < source.length; index += 1) {
        if (source[index] === '(') parameterDepth += 1;
        else if (source[index] === ')') {
            parameterDepth -= 1;
            if (parameterDepth === 0) { parametersEnd = index; break; }
        }
    }
    assert.notEqual(parametersEnd, -1, `unterminated parameters for ${name}`);
    const bodyStart = source.indexOf('{', parametersEnd);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error(`unterminated ${name}`);
}

const emojiSandbox = {
    MAINTENANCE_STATES: {
        idle: 'idle', checking: 'checking', healthy: 'healthy', repairable: 'repairable', notice: 'notice', unknown: 'unknown',
    },
};
vm.createContext(emojiSandbox);
vm.runInContext([
    extractFunction('maintenanceProblemEmoji'),
    extractFunction('decorateMaintenanceRabbitReason'),
    extractFunction('maintenanceRabbitGlyph'),
    extractFunction('maintenanceMenuProblemText'),
    extractFunction('stripMaintenanceRabbitGlyphs'),
    'globalThis.probe={maintenanceProblemEmoji,decorateMaintenanceRabbitReason,maintenanceRabbitGlyph,maintenanceMenuProblemText,stripMaintenanceRabbitGlyphs};',
].join('\n'), emojiSandbox);
const emoji = emojiSandbox.probe;

for (const [state, reason, expected] of [
    ['repairable', '源码：空白或显示代码', '📄'],
    ['repairable', '结构／样式：CSS 异常', '🎨'],
    ['repairable', '显示：手机端裁切', '📱'],
    ['repairable', '交互：checkbox 点击无反应', '🖱️'],
    ['notice', '可见文案英文占比偏高', '🌐'],
    ['unknown', '独立 API 生成失败', '📡'],
    ['unknown', '无法安全判断，请生成全链路诊断', '📋'],
    ['unknown', '维修执行失败', '❌'],
    ['unknown', '当前单镜结构过大，为避免卡死未执行', '⚠️'],
    ['idle', '巡逻未完成，可点击重试', '❌'],
]) {
    assert.equal(emoji.maintenanceProblemEmoji(state, reason), expected, `${reason} needs its category emoji`);
    const expectedGlyph = state === 'unknown' ? '🐇🔴' : (state === 'repairable' || state === 'notice') ? '🐇🟡' : '🐇⚪';
    assert.equal(emoji.maintenanceRabbitGlyph(state, reason), expectedGlyph, 'the compact rabbit glyph must not carry a problem-category emoji');
    const decorated = emoji.decorateMaintenanceRabbitReason(state, reason);
    assert.ok(decorated.startsWith(expected));
    assert.equal(emoji.decorateMaintenanceRabbitReason(state, decorated), decorated, 'emoji decoration must be idempotent');
    assert.match(emoji.maintenanceMenuProblemText(state, reason), new RegExp(`^${expected}`), 'the category emoji belongs in the menu problem text');
}
assert.equal(emoji.maintenanceProblemEmoji('healthy', '未发现高置信异常'), '');
assert.equal(emoji.maintenanceProblemEmoji('checking', '正在检查 HTML、CSS、源码与交互链'), '');
assert.equal(emoji.maintenanceRabbitGlyph('healthy', '未发现高置信异常'), '🐇🟢');
assert.equal(emoji.maintenanceRabbitGlyph('checking', '正在检查 HTML、CSS、源码与交互链'), '🐇⚪');
assert.doesNotMatch(emoji.maintenanceMenuProblemText('healthy', '未发现高置信异常'), /[📄🎨📱🌐📡📋❌⚠️]|🖱️/u);
assert.doesNotMatch(emoji.maintenanceMenuProblemText('checking', '正在检查 HTML、CSS、源码与交互链'), /[📄🎨📱🌐📡📋❌⚠️]|🖱️/u);
assert.equal(emoji.stripMaintenanceRabbitGlyphs('标题🐇🟡🖱️ 尾巴'), '标题 尾巴');

const menuSource = extractFunction('showMaintenanceRabbitMenu');
assert.match(menuSource, /MAINTENANCE_STATE_ATTR/);
assert.match(menuSource, /MAINTENANCE_REASON_ATTR/);
assert.match(menuSource, /maintenanceMenuProblemText/);
assert.match(menuSource, /recommendation\.textContent\s*=/, 'problem reasons must be placed with textContent, never interpolated as HTML');

const selectorSandbox = {
    normalizeMaintenanceSummaryText: value => String(value || '').trim(),
    getRabbitMirrorSummaryText: candidate => candidate?.summary || '',
    maintenanceRenderedSameSummaryOrdinal: root => Number(root?.ordinal || 0),
};
vm.createContext(selectorSandbox);
vm.runInContext(`${extractFunction('chooseMaintenanceMirrorCandidate')}\nglobalThis.choose=chooseMaintenanceMirrorCandidate;`, selectorSandbox);
const rawCandidates = [{ summary: '兔子镜' }, { summary: '兔子镜' }];
assert.equal(selectorSandbox.choose(rawCandidates, { summary: '兔子镜', ordinal: 1 }), rawCandidates[1], 'same-title second mirror must select the second raw mirror');
assert.equal(selectorSandbox.choose([rawCandidates[0]], { summary: '兔子镜', ordinal: 1 }), null, 'missing same-title ordinal must fail closed');

const nestedSourceSelector = extractFunction('extractMaintenanceMirrorSourceBySummary');
assert.match(nestedSourceSelector, /chooseMatchingRawRabbitMirrorRoot/, 'nested summaries must not participate in the top-level mirror ordinal');
assert.doesNotMatch(nestedSourceSelector, /summaryRe|matchingOccurrence/);
const nestedSandbox = {
    normalizeMaintenanceSummaryText: value => String(value || '').trim(),
    getRabbitMirrorSummaryText: root => root?.summary || '',
    chooseMatchingRawRabbitMirrorRoot: () => ({ outerHTML: '<details><summary>兔子镜</summary><p>第二面</p></details>' }),
    TRANSIENT_RERENDER_REASONING_ENVELOPE_RE: /<thinking/i,
};
vm.createContext(nestedSandbox);
vm.runInContext(`${nestedSourceSelector}\nglobalThis.extract=extractMaintenanceMirrorSourceBySummary;`, nestedSandbox);
assert.match(nestedSandbox.extract('<details><summary>兔子镜</summary><details><summary>兔子镜</summary></details></details><details><summary>兔子镜</summary></details>', { summary: '兔子镜' }), /第二面/);

const liveRootSelector = extractFunction('findLiveMaintenanceRoot');
assert.match(liveRootSelector, /return exact \|\| null/);
assert.doesNotMatch(liveRootSelector, /\|\|\s*candidates\[0\]/, 'live-root relocation must not fall back to another mirror');

const outerOne = { parentElement: null };
const innerOne = { parentElement: { closest: selector => selector === 'details' ? outerOne : null } };
const outerTwo = { parentElement: null };
const rawRootSandbox = {
    MIRROR_TOTO_SELECTOR: 'toto[data-rabbit-mirror]',
    document: {
        createElement() {
            return {
                set innerHTML(_value) {},
                content: {
                    querySelectorAll(selector) {
                        return selector === 'details' ? [outerOne, innerOne, outerTwo] : [];
                    },
                },
            };
        },
    },
    validateRabbitMirrorMarkupLexicalBudget: () => true,
    rescueDamagedDataUriRabbitMirrorOutput: value => value,
    decodeHtmlEntities: value => value,
    normalizeMirrorAttribute: value => value,
    isRabbitMirrorDetails: () => true,
};
vm.createContext(rawRootSandbox);
vm.runInContext(`${extractFunction('collectRawRabbitMirrorRoots')}\nglobalThis.collect=collectRawRabbitMirrorRoots;`, rawRootSandbox);
assert.deepEqual([...rawRootSandbox.collect('<details></details>')], [outerOne, outerTwo], 'nested RabbitMirror-like details must not consume a top-level same-title ordinal');

const patrolMenuStart = source.indexOf("if (action === 'patrol')");
const patrolMenuEnd = source.indexOf("if (action === 'diagnostic')", patrolMenuStart);
const patrolMenu = source.slice(patrolMenuStart, patrolMenuEnd);
assert.match(patrolMenu, /patrolMaintenanceRabbit\(root, button\)/);
assert.doesNotMatch(patrolMenu, /inspectMaintenanceRabbit/);
const diagnosticTrigger = extractFunction('triggerDiagnosticForMaintenanceRoot');
assert.match(diagnosticTrigger, /try[\s\S]*catch[\s\S]*failDiagnostic/);
assert.match(diagnosticTrigger, /failMaintenanceRabbit[\s\S]*📋/);
assert.match(diagnosticTrigger, /captureLater[\s\S]*catch[\s\S]*failDiagnostic/);
assert.match(extractFunction('finalizeOneShotInteractionDiagnostic'), /catch[\s\S]*failMaintenanceRabbit[\s\S]*📋/);

const installStart = source.indexOf('function installMaintenanceRabbitsInScope');
const installEnd = source.indexOf('\nfunction installMaintenanceRabbitsInChatDom', installStart);
const installBlock = source.slice(installStart, installEnd);
assert.match(installBlock, /autoSafeForceCurrent[\s\S]*scheduleMaintenanceAutoSafeForRoot\(root, maintenanceButton/);

const safeAuto = extractFunction('runMaintenanceSafeAutomaticRepairs');
assert.match(safeAuto, /rejectOversizedMaintenanceRepair\(root, button, '自动巡逻'\)/);
assert.match(safeAuto, /beginMaintenanceRepairRun[\s\S]*finally[\s\S]*finishMaintenanceRepairRun/, 'auto-safe DOM writes must share the maintenance run lock');
const liveFingerprint = extractFunction('maintenanceAutoSafeLiveFingerprint');
assert.match(liveFingerprint, /maintenanceRepairRootBudget\(root\)/, 'deep clone must be budget-gated');
const autoScheduler = extractFunction('scheduleMaintenanceAutoSafeForRoot');
assert.ok(autoScheduler.indexOf("rejectOversizedMaintenanceRepair(root, button, '自动巡逻')") < autoScheduler.indexOf('maintenanceAutoSafeAttemptKey(root'), 'budget must run before live fingerprint');
const messageScheduler = extractFunction('scheduleMaintenanceAutoSafeForMessageIndex');
assert.match(messageScheduler, /^function[^]*if \(!isMaintenanceAutoSafeEnabled\(\)\) return false;/);
assert.match(settingsSource, /maintenanceRabbitAutoSafeEnabled:\s*false/);
assert.match(settingsSource, /maintenanceRabbitAutoSafeConsent:\s*false/);
assert.match(source, /maintenanceRabbitAutoSafeConsent === true/);

const manual = extractFunction('runMaintenanceUserRepair');
const automatic = extractFunction('runMaintenanceAutomaticRepairPlan');
const followups = extractFunction('scheduleMaintenanceScopedFollowups');
assert.match(manual, /beginMaintenanceRepairRun/);
assert.match(manual, /runMaintenanceAutomaticRepairPlan\(root, button, repairRun\)/);
assert.doesNotMatch(manual, /setTimeout\(/, 'manual repair delays must use the origin-checked scheduler');
assert.doesNotMatch(automatic, /setTimeout\(/, 'automatic repair delays must use the origin-checked scheduler');
assert.doesNotMatch(followups, /setTimeout\(/, 'follow-up replay must use the origin-checked scheduler');
assert.doesNotMatch(followups, /notifyIndependentRepairPersistence/, 'independent repair must persist only once after the final verification pass');
assert.equal((manual.match(/notifyIndependentRepairPersistence\(/g) || []).length, 1, 'manual repair must have exactly one persistence call');
assert.match(extractFunction('captureMaintenanceRepairOrigin'), /chatKey[\s\S]*index[\s\S]*swipe[\s\S]*sourceHash[\s\S]*mirrorIdentity/);
assert.match(extractFunction('maintenanceRepairRunIsCurrent'), /maintenanceRepairOriginIsCurrent/);
assert.match(extractFunction('maintenanceRepairOriginIsCurrent'), /mirrorIdentity[\s\S]*followMaintenanceMirrorIdentity/);
assert.match(extractFunction('cancelMaintenanceRepairRuns'), /maintenanceRepairRunRecords[\s\S]*failMaintenanceRabbit/);
assert.match(extractFunction('patrolMaintenanceRabbit'), /maintenanceRepairOriginIsCurrent/);

const followHost = { dataset: { rmSource: 'follow', rmKey: 'follow:chat:0:2' } };
const independentHost = { dataset: { rmSource: 'independent', rmKey: 'owner-1', rmSourceHash: 'h:visible正文' } };
const followRoot = {
    identity: 'mirror-1',
    matches: () => false,
    closest: () => followHost,
};
const secondFollowRoot = { ...followRoot, identity: 'mirror-2' };
const originSandbox = {
    getMessageIndexFromMirrorNode: () => 0,
    getAvailableHostChat: () => [{ is_user: false, swipe_id: 2, mes: 'visible正文' }],
    getCurrentChatKey: () => 'chat-a',
    getSelectedMessageSource: message => message.mes,
    messageUsesDistinctDisplaySource: () => false,
    hashInteractionSignature: value => `h:${value}`,
    followMaintenanceMirrorIdentity: root => root.identity,
    getRenderedMessageElement: () => ({ isConnected: true }),
    getRenderedRabbitMirrorInteractionRoots: () => [followRoot, secondFollowRoot],
};
vm.createContext(originSandbox);
vm.runInContext([
    extractFunction('captureMaintenanceRepairOrigin'),
    extractFunction('maintenanceRepairOriginIsCurrent'),
    extractFunction('maintenanceSnapshotKey'),
    'globalThis.probe={captureMaintenanceRepairOrigin,maintenanceRepairOriginIsCurrent,maintenanceSnapshotKey};',
].join('\n'), originSandbox);
const followOrigin = originSandbox.probe.captureMaintenanceRepairOrigin(followRoot);
assert.equal(followOrigin.ownerKey, '', 'follow external rmKey must not enter the independent-owner branch');
assert.equal(followOrigin.mirrorIdentity, 'mirror-1');
assert.equal(originSandbox.probe.maintenanceRepairOriginIsCurrent(followOrigin), true, 'follow-current origin must remain repairable');
assert.notEqual(originSandbox.probe.maintenanceSnapshotKey(followRoot), originSandbox.probe.maintenanceSnapshotKey(secondFollowRoot), 'same-message mirrors need isolated pre-repair snapshots');
followRoot.closest = () => independentHost;
const independentOrigin = originSandbox.probe.captureMaintenanceRepairOrigin(followRoot);
assert.equal(independentOrigin.ownerKey, 'owner-1', 'independent host must retain strict owner identity');
followRoot.closest = () => followHost;

const closeMenu = extractFunction('closeMaintenanceRabbitMenu');
assert.match(closeMenu, /maintenanceOutsideCloseCleanup/);
assert.match(source, /function bindMaintenanceOutsideClose\([\s\S]*removeEventListener\('pointerdown'/);
const maintenanceMenu = source.slice(source.indexOf("if (action === 'reset-interaction')"), source.indexOf("if (action === 'patrol')"));
assert.match(maintenanceMenu, /reset-interaction'[\s\S]*beginMaintenanceRepairRun/);
assert.match(maintenanceMenu, /restore-before'[\s\S]*beginMaintenanceRepairRun/);

const persistStart = independent.indexOf('function persistIndependentRepairFromEvent');
const persistEnd = independent.indexOf('\nfunction installRepairPersistenceListener', persistStart);
const persistBlock = independent.slice(persistStart, persistEnd);
assert.match(persistBlock, /detail\.persisted=false/);
assert.match(persistBlock, /detail\.persistenceReason=/);
assert.match(persistBlock, /detail\.persisted=true/);
assert.match(persistBlock, /mounted sourceHash missing/);
assert.match(persistBlock, /store read-back mismatch/);
assert.match(persistBlock, /owner lock read-back mismatch/);
assert.match(persistBlock, /chat metadata read-back mismatch/);

const persistenceSandbox = {
    MAINTENANCE_RABBIT_ATTR: 'data-maintenance',
    MAINTENANCE_REPAIR_ATTR: 'data-repaired',
    MAINTENANCE_STATES: { unknown: 'unknown' },
    INDEPENDENT_REPAIR_PERSIST_EVENT: 'persist-repair',
    persistenceMode: 'none',
    isIndependentMaintenanceRoot: root => root?.independent === true,
    releaseIndependentMaintenanceLiveRepair: () => {},
    states: [],
    setMaintenanceRabbitState: (_button, state, reason) => persistenceSandbox.states.push({ state, reason }),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    document: {
        dispatchEvent(event) {
            if (persistenceSandbox.persistenceMode === 'success') event.detail.persisted = true;
            if (persistenceSandbox.persistenceMode === 'failure') {
                event.detail.persisted = false;
                event.detail.persistenceReason = 'simulated failure';
            }
        },
    },
};
const persistenceButton = { isConnected: true, removeAttribute() {} };
const persistenceHost = { isConnected: true };
const persistenceRoot = { closest: () => persistenceHost, querySelector: () => persistenceButton };
vm.createContext(persistenceSandbox);
vm.runInContext(`${extractFunction('notifyIndependentRepairPersistence')}\nglobalThis.notify=notifyIndependentRepairPersistence;`, persistenceSandbox);
assert.equal(persistenceSandbox.notify(persistenceRoot), false, 'missing persistence listener must fail closed');
assert.match(persistenceSandbox.states.at(-1).reason, /保存桥未响应/);
persistenceSandbox.states.length = 0;
assert.equal(persistenceSandbox.notify({ closest: () => null, querySelector: () => persistenceButton }), false, 'ordinary follow root needs no independent persistence');
assert.equal(persistenceSandbox.states.length, 0, 'ordinary follow root must not receive a false persistence error');
assert.equal(persistenceSandbox.notify({ independent: true, closest: () => null, querySelector: () => persistenceButton }), false, 'orphaned independent root must fail closed');
assert.match(persistenceSandbox.states.at(-1).reason, /❌/);
persistenceSandbox.persistenceMode = 'failure';
assert.equal(persistenceSandbox.notify(persistenceRoot), false);
persistenceSandbox.persistenceMode = 'success';
assert.equal(persistenceSandbox.notify(persistenceRoot), true);

assert.match(uiSource, /data-rabbit-mirror-ui-ready[^]*=== 'true'/);
assert.match(uiSource, /\$advanced\.length === 1[^]*\$worldPrompt\.length === 1[^]*\$tagFilter\.length === 1/);
assert.match(uiSource, /data-rabbit-mirror-ui-ready', 'true'/);

console.log('maintenance repair safety: emoji, opt-in budget, shared lock, strict mirror identity, UI readiness and persistence tri-state passed');
