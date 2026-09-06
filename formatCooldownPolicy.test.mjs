import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Run with --loader ./tests/hostLoader.mjs. This calls the production public
// picker and storage, replacing only host storage, context and entropy sources.
const values = new Map();
const originals = new Map();
function replaceGlobal(name, value) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
let entropy = 0.4;
let entropyCalls = 0;
let requestCount = 0;
replaceGlobal('crypto', {
    getRandomValues(array) {
        entropyCalls += 1;
        for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(entropy * 0x100000000);
        return array;
    },
});
replaceGlobal('localStorage', {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
});
replaceGlobal('SillyTavern', { getContext: () => ({ chatId: 'format-policy', chat: [] }) });
replaceGlobal('fetch', () => { requestCount += 1; throw new Error('Picker must not request the network'); });

// Resolve the exact production import URLs, including the current cache cohort,
// so mutable fixture objects and the picker never use different module copies.
const pickerUrl = new URL('../src/picker.js', import.meta.url);
const pickerSource = readFileSync(pickerUrl, 'utf8');
function importedUrl(source, ownerUrl, fileName) {
    const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`from\\s+['"]([^'"]*${escaped}(?:\\?[^'"]*)?)['"]`));
    assert.ok(match, `Production import must exist: ${fileName}`);
    return new URL(match[1], ownerUrl);
}
const storageUrl = importedUrl(pickerSource, pickerUrl, 'storage.js');
const blacklistUrl = importedUrl(pickerSource, pickerUrl, 'blacklist.js');
const settingsUrl = importedUrl(readFileSync(blacklistUrl, 'utf8'), blacklistUrl, 'settings.js');
const { defaultSettings } = await import(settingsUrl.href);
const { PRESENTATION_FORMATS } = await import(importedUrl(pickerSource, pickerUrl, 'presentationIndex.js').href);
const { THEMATIC_CATEGORIES } = await import(importedUrl(pickerSource, pickerUrl, 'thematicIndex.js').href);
const storage = await import(storageUrl.href);
const { pickCombination } = await import(pickerUrl.href);
const formatById = new Map(PRESENTATION_FORMATS.map(item => [item.id, item]));
const normalTheme = THEMATIC_CATEGORIES.find(item => !item.tags?.includes('if'));
const ifTheme = THEMATIC_CATEGORIES.find(item => item.tags?.includes('if') && item.title.includes('IF'));
assert.ok(normalTheme && ifTheme, 'Fixtures must use actual indexed themes with explicit metadata');
const RANK = '1.3.4';
const CHAT = '1.1.1.2';
const COMMENT = '1.3.3.review';
const FORUM = '7.2.1';
const MYSTIC = '5.3.1';
const HISTORY_KEY = 'rabbit_mirror_theater:last_combo:v11';
const PITY_KEY = 'rabbit_mirror_theater:format_eligible_misses:v1';
let scope = 0;
let assertionGroups = 0;

function config(ids = [RANK, MYSTIC], theme = normalTheme, extra = {}) {
    const allowed = new Set(ids);
    return {
        ...structuredClone(defaultSettings),
        userDirectivePriority: false,
        forceVisualScenery: false,
        samplingMode: 'classic',
        themesMin: 1, themesMax: 1,
        formatsMin: 1, formatsMax: 1,
        avoidRepeat: true,
        cooldownRounds: 10,
        blacklistEnabled: true,
        blacklistedThemeIds: THEMATIC_CATEGORIES.filter(item => item.id !== theme.id).map(item => item.id),
        blacklistedFormatIds: PRESENTATION_FORMATS.filter(item => !allowed.has(item.id)).map(item => item.id),
        favoriteThemeIds: [], favoriteFormatIds: [],
        favoriteThemeMultipliers: {}, favoriteFormatMultipliers: {},
        ...extra,
    };
}
function fresh(roll = 0.4) {
    values.clear();
    entropy = roll;
    entropyCalls = 0;
}
function pick(settings) {
    scope += 1;
    return pickCombination(settings, `format-policy:${scope}`, { chat: [] }).combo;
}
function picked(settings) { return pick(settings).formatIds[0]; }
function commitFixture(id) {
    const item = formatById.get(id);
    assert.ok(item, `Fixture ID must exist in the production index: ${id}`);
    storage.setLastCombo({
        themes: [], formats: [item], themeIds: [], themeGroups: [],
        formatIds: [item.id], formatGroups: [item.group], samplingMode: 'classic',
    });
    storage.commitPendingCombo(`fixture:${id}`);
    assert.ok(storage.getComboHistory(20).some(combo => combo.formatIds.includes(id)), 'Fixture uses the real successful-history commit');
}
function groupProbe(theme, roll = 0.4, extra = {}) {
    fresh(roll);
    commitFixture(CHAT); // Same group as RANK, but a different family.
    return picked(config([RANK, MYSTIC], theme, extra));
}

try {
    // Run the entropy and repeat-distance sentinels first so the corresponding
    // behavioral mutations fail for those properties, not an incidental later
    // coefficient assertion. The original checks below remain intact.
    fresh(0.1);
    const earlyLow = picked(config([CHAT, MYSTIC]));
    fresh(0.9);
    const earlyHigh = picked(config([CHAT, MYSTIC]));
    assert.notEqual(earlyLow, earlyHigh, 'Randomness sentinel: fresh selection must respond to entropy, not fixed rotation');
    fresh(0.1);
    assert.equal(picked(config([CHAT, MYSTIC])), earlyLow, 'Randomness sentinel: identical entropy and eligibility must reproduce a draw');
    for (let repetition = 0; repetition < 5; repetition += 1) {
        fresh(0.1);
        assert.equal(picked(config([CHAT, MYSTIC])), earlyLow, 'Randomness sentinel: repeated identical entropy cannot advance a hidden rotation');
    }
    fresh(0);
    const exactSentinel = [];
    for (let round = 0; round < 12; round += 1) {
        const id = picked(config(PRESENTATION_FORMATS.map(item => item.id)));
        assert.ok(!exactSentinel.slice(-10).includes(id), 'Exact repeat distance sentinel: no full-pool repeat within ten attempts');
        exactSentinel.push(id);
    }
    assertionGroups += 1;

    // One ticket per family here. Ordinary is 1:1; IF retains 0.35:1.
    assert.equal(groupProbe(normalTheme), RANK, 'Ordinary formats must not inherit another family\'s group debt');
    assert.equal(groupProbe(ifTheme), MYSTIC, 'An explicitly selected IF theme must retain group cooldown');
    assert.equal(groupProbe(ifTheme, 0.24), RANK, 'IF first group hit retains the original 0.35 factor');
    assert.equal(groupProbe(ifTheme, 0.28), MYSTIC, 'IF must not silently weaken the existing group factor');
    const groupHistory = PRESENTATION_FORMATS.filter(item => item.group === '1' && item.id.startsWith('1.1')).slice(0, 5);
    assert.equal(groupHistory.length, 5);
    for (const [roll, expected] of [[0.10, RANK], [0.12, MYSTIC]]) {
        fresh(roll);
        for (const item of groupHistory) commitFixture(item.id);
        assert.equal(picked(config([RANK, MYSTIC], ifTheme)), expected, 'Five IF group hits retain the original soft floor of 0.12');
    }
    assertionGroups += 1;

    // Do not infer IF from title, group, ID prefix, summary, or custom prose.
    const oldTags = ifTheme.tags;
    try {
        ifTheme.tags = [];
        assert.equal(groupProbe(ifTheme), RANK, 'An IF-looking title/ID without an explicit tag is ordinary');
        ifTheme.tags = [' IF '];
        assert.equal(groupProbe(ifTheme), MYSTIC, 'The existing exact trimmed, case-insensitive IF tag is authoritative');
    } finally { ifTheme.tags = oldTags; }
    const ordinaryTags = normalTheme.tags;
    try {
        normalTheme.tags = ['if'];
        assert.equal(groupProbe(normalTheme), MYSTIC, 'An explicit IF tag works without an IF-looking title or ID');
    } finally { normalTheme.tags = ordinaryTags; }
    assert.equal(groupProbe(ifTheme, 0.4, { samplingMode: 'format_only' }), RANK, 'Discarded random themes must not turn format_only into IF');
    fresh();
    commitFixture(CHAT);
    const custom = pickCombination(config([RANK, MYSTIC], normalTheme, { userDirectivePriority: true }),
        `custom:${++scope}`, { chat: [{ is_user: true, mesid: scope, mes: '兔子镜主题：虚构的 IF 特殊路线甲乙丙' }] });
    assert.equal(custom.combo.formatIds[0], RANK, 'Unresolved custom IF prose must safely remain ordinary');
    assertionGroups += 1;

    // Family remains 0.28:1. The last success has a different family so this
    // observes soft family debt, not immediate-family hard exclusion.
    for (const [roll, expected] of [[0.20, RANK], [0.24, MYSTIC]]) {
        fresh(roll);
        commitFixture(COMMENT);
        commitFixture(FORUM);
        assert.equal(picked(config()), expected, 'Ordinary family soft cooldown must retain the original 0.28 strength');
    }
    const familyHistory = PRESENTATION_FORMATS.filter(item => item.id.startsWith('1.3.') && item.id !== RANK).slice(0, 4);
    assert.equal(familyHistory.length, 4);
    for (const [roll, expected] of [[0.10, RANK], [0.12, MYSTIC]]) {
        fresh(roll);
        for (const item of familyHistory) commitFixture(item.id);
        commitFixture(FORUM);
        assert.equal(picked(config()), expected, 'Four successful family hits retain the original soft floor of 0.12');
    }
    fresh(0);
    commitFixture(COMMENT);
    assert.equal(picked(config()), MYSTIC, 'The immediately previous successful family remains hard-avoided when alternatives exist');
    fresh(0);
    commitFixture(CHAT);
    assert.equal(picked(config([RANK, MYSTIC])), RANK, 'Same-group, different-family content may naturally follow the previous success');
    assertionGroups += 1;

    // A real failed draw means no commit. Its exact ID remains protected, while
    // its siblings inherit neither family nor group success debt.
    for (const failedId of [CHAT, COMMENT]) {
        fresh(0.4);
        assert.equal(picked(config([failedId], ifTheme)), failedId);
        assert.equal(values.has(HISTORY_KEY), false, 'An uncommitted draw must not become successful history');
        assert.equal(picked(config([RANK, MYSTIC], ifTheme)), RANK, 'Failed attempts must not create format family/group success debt');
    }
    fresh(0);
    assert.equal(picked(config([RANK, FORUM], normalTheme, { avoidRepeat: false })), RANK);
    assert.equal(picked(config([RANK, FORUM], normalTheme, { avoidRepeat: false })), FORUM, 'Attempt exact protection remains active even with optional repeat avoidance disabled');
    fresh(0);
    commitFixture(RANK);
    commitFixture(CHAT);
    assert.equal(picked(config([RANK, FORUM])), FORUM, 'Formal exact history remains protected independently of attempts and last-family avoidance');
    assertionGroups += 1;

    fresh(0);
    const prior = [];
    const all = PRESENTATION_FORMATS.map(item => item.id);
    for (let round = 0; round < 35; round += 1) {
        const id = picked(config(all));
        assert.ok(!prior.slice(-10).includes(id), 'A full pool must not repeat an exact ID inside the ten-attempt window');
        prior.push(id);
    }
    fresh(0);
    assert.equal(picked(config([RANK])), RANK);
    assert.equal(picked(config([RANK])), RANK, 'An exhausted one-item pool must preserve the existing safe exact fallback');
    assertionGroups += 1;

    // Collection preference is the existing multiplicative 1..50 policy.
    for (const [multiplier, low, high] of [[1, 0.49, 0.51], [3, 0.74, 0.76], [50, 0.98, 0.981]]) {
        for (const [roll, expected] of [[low, RANK], [high, FORUM]]) {
            fresh(roll);
            assert.equal(picked(config([RANK, FORUM], normalTheme, {
                favoriteFormatIds: [RANK], favoriteFormatMultipliers: { [RANK]: multiplier },
            })), expected, 'Favorites must retain their declared multiplier without overriding eligibility');
        }
    }
    fresh(0.70);
    assert.equal(picked(config([RANK, FORUM], normalTheme, { favoriteFormatIds: [RANK] })), RANK, 'An old favorite without a multiplier retains default x3');
    fresh(0);
    assert.equal(picked(config([FORUM], normalTheme, { favoriteFormatIds: [RANK], favoriteFormatMultipliers: { [RANK]: 50 } })), FORUM, 'A favorite cannot bypass the blacklist');
    fresh(0);
    assert.deepEqual(pick(config([])).formatIds, [], 'An entirely blocked pool must not be reopened');
    fresh(0);
    assert.equal(picked(config([], normalTheme, { blacklistEnabled: false })), PRESENTATION_FORMATS[0].id, 'Disabling the blacklist restores the actual full index');
    assertionGroups += 1;

    // Equal, fresh single-member families have equal tickets. A dense fixed
    // entropy grid tests public inverse-CDF boundaries without reimplementing
    // the sampler; special forum/chat/rank bonuses would violate these pairs.
    for (const ids of [[RANK, FORUM], [CHAT, RANK], [COMMENT, FORUM], ['6.3.2', '4.5'], ['5.1.1.6', '6.2.7']]) {
        const ordered = PRESENTATION_FORMATS.filter(item => ids.includes(item.id)).map(item => item.id);
        assert.equal(ordered.length, 2);
        const counts = new Map(ordered.map(id => [id, 0]));
        for (let i = 0; i < 100; i += 1) {
            fresh((i + 0.5) / 100);
            const id = picked(config(ids));
            assert.equal(id, i < 50 ? ordered[0] : ordered[1], 'No named mother-template may receive its own hardcoded random bonus');
            counts.set(id, counts.get(id) + 1);
        }
        assert.deepEqual([...counts.values()], [50, 50]);
    }
    fresh(0.1);
    const lowPick = picked(config([RANK, FORUM]));
    fresh(0.9);
    const highPick = picked(config([RANK, FORUM]));
    assert.notEqual(lowPick, highPick, 'Fresh selection must respond to entropy rather than a fixed rotation');
    fresh(0.1);
    assert.equal(picked(config([RANK, FORUM])), lowPick, 'Identical eligibility and entropy reproduce the same draw across distinct scopes');
    assertionGroups += 1;

    // Explicitly preserve—not conceal—the old attempt-time pity semantics.
    fresh(0);
    values.set(PITY_KEY, JSON.stringify({ [RANK]: 80, [FORUM]: 80 }));
    assert.equal(picked(config([RANK, FORUM])), RANK);
    const misses = storage.getFormatEligibleMisses(PRESENTATION_FORMATS.map(item => item.id));
    assert.equal(misses[RANK], undefined, 'This change deliberately retains pity reset on a draw before success');
    assert.equal(misses[FORUM], 81, 'An eligible unselected item still ages once per actual random draw');
    assert.equal(values.has(HISTORY_KEY), false, 'Pity is not mislabeled as successful-render accounting');
    assertionGroups += 1;

    fresh(0.4);
    const reusedSettings = config();
    const reusedScope = `same-scope:${++scope}`;
    const first = pickCombination(reusedSettings, reusedScope, { chat: [] });
    const storedBefore = [...values.entries()];
    const drawsBefore = entropyCalls;
    assert.strictEqual(pickCombination(reusedSettings, reusedScope, { chat: [] }), first);
    assert.equal(entropyCalls, drawsBefore, 'Repeated same-scope reads do not consume another draw');
    assert.deepEqual([...values.entries()], storedBefore, 'Repeated same-scope reads do not age or record another attempt');
    assert.equal(requestCount, 0, 'All picker probes must remain network-free');
    assertionGroups += 1;
} finally {
    for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    }
}

console.log(`formatCooldownPolicy: ${assertionGroups} production-picker contract groups passed`);
