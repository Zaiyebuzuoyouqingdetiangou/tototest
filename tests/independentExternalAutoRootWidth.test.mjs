import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');

function sourceBlock(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `${startMarker} block missing`);
    return source.slice(start, end);
}

class FakeStyleDeclaration {
    constructor(initial = {}) {
        this.values = new Map(Object.entries(initial));
    }

    getPropertyValue(name) {
        return this.values.get(name) || '';
    }

    setProperty(name, value) {
        this.values.set(name, String(value));
    }

    removeProperty(name) {
        const previous = this.getPropertyValue(name);
        this.values.delete(name);
        return previous;
    }
}

const animationFrames = [];
const timers = [];
function flushAnimationFrames() {
    const current = animationFrames.splice(0);
    assert.ok(current.length > 0, 'an open mirror must schedule a post-paint frame');
    for (const callback of current) callback();
}
function flushTimers() {
    let turns = 0;
    while (timers.length) {
        timers.shift()();
        turns += 1;
        assert.ok(turns < 30, 'post-paint timer fixture must remain bounded');
    }
}

const sandbox = {
    HISTORICAL_LIGHT_HOST_ATTR: 'data-rabbit-mirror-historical-light-host',
    DEFERRED_INTERACTION_RESCUE_ATTR: 'data-rabbit-mirror-deferred-interaction-rescue',
    externalInteractionActivatedDetails: new WeakSet(),
    externalInteractionActivationHandlers: new WeakMap(),
    externalInteractionActivationScheduledDetails: new WeakSet(),
    navigator: { userAgent: 'iPhone' },
    visualViewport: { width: 440 },
    innerWidth: 440,
    document: { documentElement: { clientWidth: 440 } },
    screen: { width: 440 },
    getComputedStyle(_element, pseudo) {
        if (pseudo === '::details-content') return { inlineSize: '366px', width: '366px' };
        return {
            display: 'block',
            position: 'relative',
            cssFloat: 'none',
            marginLeft: '0px',
            marginRight: '0px',
        };
    },
    requestAnimationFrame(callback) {
        animationFrames.push(callback);
        return animationFrames.length;
    },
    setTimeout(callback) {
        timers.push(callback);
        return timers.length;
    },
    rehydrateRabbitMirrorMaintenanceRepairs() {},
    messageElementForExternalHost: () => ({ isConnected: true }),
    beginExternalHostGeometryCycle(host) {
        host.dataset.rmGeometryCycleId = 'test-cycle';
        return 'test-cycle';
    },
    syncExternalHostGeometry() {},
    finishExternalHostGeometrySettle() {},
    console: { debug() {} },
};
vm.createContext(sandbox);
vm.runInContext([
    sourceBlock(
        'function independentExternalMobilePlatformHint()',
        '\nfunction roundedGeometryNumber',
    ),
    sourceBlock(
        'const INDEPENDENT_CONTENT_WIDTH_RESCUE_ATTR=',
        '\nfunction captureIndependentContentWidthBaseline',
    ),
    sourceBlock(
        'function captureIndependentContentWidthBaseline(',
        '\nfunction stripIndependentTransientLayoutArtifacts',
    ),
    sourceBlock(
        'function activateExternalInteractionTools(',
        '\nfunction ensureExternalTools',
    ),
    'globalThis.arm=armExternalInteractionTools;',
    'globalThis.hasIntent=independentExternalSizingDeclarationHasIntent;',
    'globalThis.shouldRescue=independentExternalAutoRootWidthShouldRescue;',
    'globalThis.widthConstants={rescueAttr:INDEPENDENT_CONTENT_WIDTH_RESCUE_ATTR,baselineAttr:INDEPENDENT_CONTENT_WIDTH_BASELINE_ATTR,rescueMode:INDEPENDENT_EXTERNAL_AUTO_ROOT_WIDTH_RESCUE,ratio:INDEPENDENT_EXTERNAL_AUTO_ROOT_WIDTH_RATIO,breakpoint:INDEPENDENT_EXTERNAL_AUTO_ROOT_WIDTH_BREAKPOINT};',
].join('\n'), sandbox);
const widthConstants = sandbox.widthConstants;

function createFixture({ open = false, bodyWidth = 227, authoredWidth = 0, historical = false } = {}) {
    const bodyAttributes = new Map();
    const bodyStyle = new FakeStyleDeclaration(authoredWidth ? { width: `${authoredWidth}px` } : {});
    const initialStyle = authoredWidth ? `width:${authoredWidth}px;padding:20px` : '';
    const body = {
        tagName: 'DIV',
        id: '',
        classList: [],
        isConnected: true,
        style: bodyStyle,
        attributes: [],
        getAttribute(name) {
            if (name === 'style') return initialStyle;
            return bodyAttributes.get(name) ?? null;
        },
        setAttribute(name, value) {
            bodyAttributes.set(name, String(value));
        },
        removeAttribute(name) {
            bodyAttributes.delete(name);
        },
        hasAttribute(name) {
            return bodyAttributes.has(name);
        },
        matches() {
            return false;
        },
        getBoundingClientRect() {
            const width = bodyStyle.getPropertyValue('width') === '100%'
                ? 366
                : (authoredWidth || bodyWidth);
            return { width, height: 640, left: 0, right: width };
        },
    };

    let toggleHandler = null;
    const detailsAttributes = new Map(open ? [['open', '']] : []);
    const details = {
        tagName: 'DETAILS',
        isConnected: true,
        open,
        children: [{ tagName: 'SUMMARY' }, body],
        classList: { contains: () => false },
        getAttribute(name) {
            if (name === 'open') return this.open ? '' : null;
            return detailsAttributes.get(name) ?? null;
        },
        setAttribute(name, value) {
            detailsAttributes.set(name, String(value));
        },
        removeAttribute(name) {
            detailsAttributes.delete(name);
        },
        hasAttribute(name) {
            if (name === 'open') return this.open;
            return detailsAttributes.has(name);
        },
        querySelectorAll() {
            return [];
        },
        addEventListener(type, handler) {
            if (type === 'toggle') toggleHandler = handler;
        },
        removeEventListener(type, handler) {
            if (type === 'toggle' && toggleHandler === handler) toggleHandler = null;
        },
        dispatchToggle() {
            toggleHandler?.();
        },
    };

    const hostAttributes = new Map(historical ? [[sandbox.HISTORICAL_LIGHT_HOST_ATTR, 'true']] : []);
    const host = {
        isConnected: true,
        dataset: {
            rmState: 'ready',
            rmSource: 'independent',
            rmPlacement: 'external',
        },
        querySelector(selector) {
            assert.ok(
                selector === ':scope > details'
                || selector === ':scope > details[data-rabbit-mirror-external-details="true"], :scope > details',
                `unexpected host selector: ${selector}`,
            );
            return details;
        },
        hasAttribute(name) {
            return hostAttributes.has(name);
        },
        removeAttribute(name) {
            hostAttributes.delete(name);
        },
    };
    details.parentElement = host;

    return {
        body,
        details,
        host,
        renderedBodyWidth: () => body.getBoundingClientRect().width,
        deferred: () => details.getAttribute(sandbox.DEFERRED_INTERACTION_RESCUE_ATTR),
    };
}

const alreadyOpen = createFixture({ open: true });
sandbox.arm(alreadyOpen.host, alreadyOpen.details);
assert.equal(alreadyOpen.renderedBodyWidth(), 227, 'arming must not force synchronous layout');
assert.equal(animationFrames.length, 1);
assert.equal(timers.length, 0);
flushAnimationFrames();
assert.equal(alreadyOpen.renderedBodyWidth(), 227, 'the animation frame must only enqueue post-paint work');
assert.equal(timers.length, 1);
flushTimers();
assert.equal(alreadyOpen.renderedBodyWidth(), 366);
assert.equal(
    alreadyOpen.body.getAttribute(widthConstants.rescueAttr),
    widthConstants.rescueMode,
);
assert.equal(alreadyOpen.host.dataset.rmIndependentExternalAutoRootWidthBefore, '227');
assert.equal(alreadyOpen.host.dataset.rmIndependentExternalAutoRootWidthAfter, '366');
assert.equal(sandbox.externalInteractionActivatedDetails.has(alreadyOpen.details), true);

const firstOpen = createFixture({ open: false, historical: true });
sandbox.arm(firstOpen.host, firstOpen.details);
assert.equal(animationFrames.length, 0);
assert.equal(timers.length, 0);
assert.equal(firstOpen.renderedBodyWidth(), 227, 'collapsed historical mirrors must stay lightweight');
assert.equal(firstOpen.deferred(), 'true');
assert.equal(sandbox.externalInteractionActivatedDetails.has(firstOpen.details), false);
firstOpen.details.open = true;
firstOpen.details.dispatchToggle();
assert.equal(firstOpen.renderedBodyWidth(), 227, 'the native toggle must yield the first open paint');
assert.equal(animationFrames.length, 2, 'historical geometry and width activation must each yield a frame');
assert.equal(timers.length, 0);
flushAnimationFrames();
assert.equal(firstOpen.renderedBodyWidth(), 227, 'historical first-paint frames must not synchronously widen content');
assert.equal(timers.length, 1);
flushTimers();
assert.equal(firstOpen.renderedBodyWidth(), 366);
assert.equal(
    firstOpen.body.getAttribute(widthConstants.rescueAttr),
    widthConstants.rescueMode,
);
assert.equal(firstOpen.deferred(), null);
assert.equal(sandbox.externalInteractionActivatedDetails.has(firstOpen.details), true);

const intentionalCard = createFixture({ open: true, authoredWidth: 260 });
sandbox.arm(intentionalCard.host, intentionalCard.details);
assert.equal(animationFrames.length, 1);
flushAnimationFrames();
assert.equal(intentionalCard.renderedBodyWidth(), 260);
assert.equal(timers.length, 1);
flushTimers();
assert.equal(intentionalCard.renderedBodyWidth(), 260);
assert.equal(intentionalCard.body.style.getPropertyValue('width'), '260px');
assert.equal(intentionalCard.body.hasAttribute(widthConstants.rescueAttr), false);
assert.equal(intentionalCard.body.hasAttribute(widthConstants.baselineAttr), false);
assert.equal(intentionalCard.host.dataset.rmIndependentExternalAutoRootWidthRescue, undefined);
assert.equal(
    sandbox.externalInteractionActivatedDetails.has(intentionalCard.details),
    true,
    'intentional width must be preserved without blocking normal interaction activation',
);

const sizingStyle = declarations => ({
    getPropertyValue: property => declarations[property] || '',
});
assert.equal(sandbox.hasIntent(sizingStyle({ width: '320px' })), true);
assert.equal(sandbox.hasIntent(sizingStyle({ 'max-width': '100%', 'min-width': '0' })), false);
assert.equal(sandbox.shouldRescue({
    viewportWidth: 440,
    containerWidth: 366,
    bodyWidth: 227,
    display: 'block',
    position: 'relative',
    floatMode: 'none',
    marginLeft: 0,
    marginRight: 0,
}), true, 'the reproduced 227/366 iPhone root must qualify');

console.log('independent external auto-root width lifecycle checks passed');
