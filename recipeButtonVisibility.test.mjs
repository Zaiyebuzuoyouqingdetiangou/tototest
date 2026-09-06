import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');

function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `missing ${name}`);
    const bodyStart = source.indexOf('{', start);
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

const sandbox = {
    RECIPE_BUTTON_ATTR: 'data-rabbit-mirror-recipe',
    TOOL_ENTRY_HOST_ATTR: 'data-rabbit-mirror-tool-entry-host',
    MAINTENANCE_RABBIT_ATTR: 'data-rabbit-mirror-maintenance-rabbit',
    FEEDBACK_CAT_ATTR: 'data-rabbit-mirror-feedback-cat',
    RESAY_ATTR: 'data-rabbit-mirror-resay',
    closeCount: 0,
    closeRecipeMenu() { sandbox.closeCount += 1; },
    getBlacklistState() { return { enabled: true }; },
};
vm.createContext(sandbox);
vm.runInContext([
    extractFunction('recipeButtonShouldBeVisible'),
    extractFunction('removeRecipeButtonsFromSummary'),
    'globalThis.probe={recipeButtonShouldBeVisible,removeRecipeButtonsFromSummary};',
].join('\n'), sandbox);

assert.equal(sandbox.probe.recipeButtonShouldBeVisible({ themes: [] }, { enabled: true }), true);
assert.equal(sandbox.probe.recipeButtonShouldBeVisible(null, { enabled: true }), false, 'a mirror without an exact recipe must not expose a dead dice button');
assert.equal(sandbox.probe.recipeButtonShouldBeVisible({ themes: [] }, { enabled: false }), false, 'disabled blacklist must hide the dice button');

let buttonRemoved = 0;
let hostRemoved = 0;
const button = { remove() { buttonRemoved += 1; } };
const host = {
    querySelector() { return null; },
    remove() { hostRemoved += 1; },
};
const summary = {
    querySelectorAll(selector) {
        if (selector === '[data-rabbit-mirror-recipe]') return [button];
        if (selector === ':scope > [data-rabbit-mirror-tool-entry-host]') return [host];
        return [];
    },
};
assert.equal(sandbox.probe.removeRecipeButtonsFromSummary(summary), 1);
assert.equal(buttonRemoved, 1);
assert.equal(hostRemoved, 1, 'a tool host emptied by dice removal must also disappear');
assert.equal(sandbox.closeCount, 1, 'an open dice menu must close when its entry becomes unavailable');

const install = extractFunction('installRecipeButtonForRoot');
assert.ok(install.indexOf('recipeButtonShouldBeVisible') < install.indexOf('ensureRabbitMirrorToolHost'), 'visibility must be decided before creating a tool host');
assert.match(install, /removeRecipeButtonsFromSummary/);
const toggleStart = source.indexOf("if (value === 'toggle-enabled')");
const toggleEnd = source.indexOf("if (value === 'clear-blacklist')", toggleStart);
assert.match(source.slice(toggleStart, toggleEnd), /installRecipeButtonForRoot\(root\)/, 'the clicked mirror must drop its dice even before the settings UI is mounted');
assert.match(uiSource, /const blacklistListener = event => \{[^}]*event\?\.detail\?\.action === 'enabled'[^}]*refreshRecipeButtons\(\)/, 'the existing settings listener must refresh all dice only for enabled-state changes');
const settingsToggleStart = uiSource.indexOf("$('#rh_blacklist_enabled').on('change'");
const settingsToggleEnd = uiSource.indexOf("$('#rh_blacklist_summary').on('click'", settingsToggleStart);
assert.ok(settingsToggleStart >= 0 && settingsToggleEnd > settingsToggleStart);
assert.doesNotMatch(uiSource.slice(settingsToggleStart, settingsToggleEnd), /refreshRecipeButtons\(\)/, 'the checkbox handler must rely on the synchronous enabled-state event instead of scanning every mirror twice');
assert.doesNotMatch(source, /addEventListener\?\.\(BLACKLIST_CHANGED_EVENT/, 'dice visibility must reuse the existing settings listener instead of adding another global listener');

console.log('recipe button visibility: disabled/no-recipe hidden; enabled exact recipe shown');
