const TOUCH_THEATER_SELECTOR = '[data-rm-dai-sekkin-mode="true"], [data-rm-touch-theater="true"]';
const TOUCH_ZONE_SELECTOR = 'label[data-rm-touch-zone]';
const RABBIT_MIRROR_SELECTOR = 'toto[data-rabbit-mirror="true"], toto[data-rabbit-hole="true"], [data-rabbit-mirror-external-shell][data-rm-source="independent"]';
const TOUCH_ZONE_IDS = new Set([
    'head',
    'face',
    'shoulder',
    'chest',
    'arm',
    'hand',
    'waist',
    'thigh',
    'knee',
    // 1.4.15 compatibility: historical Touch Theater mirrors may still carry these zones.
    'left-hand',
    'right-hand',
    'hair',
]);

const LIVE2D_AREA_ALIASES = Object.freeze({
    head: ['head', 'face', '頭', '头', '頭部', '头部'],
    face: ['face', 'head', '顔', '脸', '臉', '面部'],
    hair: ['hair', 'head', '髪', '发', '髮', '头发', '頭髮'],
    shoulder: ['shoulder', 'body', 'torso', '肩', '肩部', '身体', '身體'],
    chest: ['chest', 'bust', 'body', 'torso', '胸', '胸部', '身体', '身體'],
    waist: ['waist', 'body', 'torso', '腰', '腰部', '身体', '身體'],
    arm: ['arm', 'body', '腕', '手臂', '身体', '身體'],
    hand: ['hand', 'hands', 'arm', '手', '手部', '手掌', '掌'],
    thigh: ['thigh', 'leg', 'body', '大腿', '腿', '腿部', '身体', '身體'],
    knee: ['knee', 'leg', '膝', '膝盖', '膝蓋', '腿', '腿部'],
    'left-hand': ['lefthand', 'handleft', 'lhand', 'leftarm', 'armleft', '左手', '左腕'],
    'right-hand': ['righthand', 'handright', 'rhand', 'rightarm', 'armright', '右手', '右腕'],
});

let touchTheaterListenerInstalled = false;
const recentTouchByTheater = new WeakMap();

function normalizeTouchZone(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return TOUCH_ZONE_IDS.has(normalized) ? normalized : '';
}

function normalizeLive2dAreaName(value) {
    return String(value || '')
        .normalize?.('NFKC')
        ?.toLowerCase()
        ?.replace(/[\s_.:/\\-]+/g, '') || '';
}

function safeSlashArgument(value, maxLength = 180) {
    const raw = String(value ?? '').trim();
    if (!raw || raw.length > maxLength) return '';
    // STscript uses a command pipeline. This optional bridge fails closed for values that
    // could alter quoting, macro expansion or pipeline structure rather than trying to
    // reinterpret unusual local Live2D names.
    if (/[\u0000-\u001f\u007f\u2028\u2029|{}"\\]/.test(raw)) return '';
    return raw;
}

function resolveLive2dHitArea(zone, hitAreas) {
    const aliases = LIVE2D_AREA_ALIASES[zone] || [];
    if (!aliases.length || !hitAreas || typeof hitAreas !== 'object') return null;
    const candidates = Object.entries(hitAreas).map(([key, value]) => ({
        key,
        value: value && typeof value === 'object' ? value : {},
        normalized: normalizeLive2dAreaName(value?.name || key),
    }));
    for (const alias of aliases) {
        const normalizedAlias = normalizeLive2dAreaName(alias);
        const exact = candidates.find(candidate => candidate.normalized === normalizedAlias);
        if (exact) return exact;
    }
    return null;
}

export function buildTouchTheaterLive2dCommands(zoneValue, context) {
    const zone = normalizeTouchZone(zoneValue);
    if (!zone || !context || context.groupId != null) return [];
    const live2d = context.extensionSettings?.live2d;
    if (!live2d?.enabled) return [];

    const character = String(context.name2 || '').trim();
    const modelPath = live2d.characterModelMapping?.[character];
    const modelSettings = modelPath
        ? live2d.characterModelsSettings?.[character]?.[modelPath]
        : null;
    const hitArea = resolveLive2dHitArea(zone, modelSettings?.hit_areas);
    if (!hitArea) return [];

    const characterArg = safeSlashArgument(character);
    if (!characterArg) return [];

    const expression = safeSlashArgument(hitArea.value?.expression);
    const motion = safeSlashArgument(hitArea.value?.motion);
    const commands = [];
    if (expression && String(hitArea.value?.expression || '').trim().toLowerCase() !== 'none') {
        commands.push(`/live2dexpression character="${characterArg}" expression="${expression}"`);
    }
    if (motion && String(hitArea.value?.motion || '').trim().toLowerCase() !== 'none') {
        commands.push(`/live2dmotion character="${characterArg}" motion="${motion}"`);
    }
    return commands;
}

async function triggerTouchTheaterLive2d(zone) {
    const context = globalThis.SillyTavern?.getContext?.();
    const execute = context?.executeSlashCommandsWithOptions;
    if (typeof execute !== 'function') return;
    const commands = buildTouchTheaterLive2dCommands(zone, context);
    for (const command of commands) {
        try {
            await execute(command, {
                handleParserErrors: true,
                handleExecutionErrors: true,
            });
        } catch (error) {
            console.debug('[RabbitMirror] Dai Sekkin Live2D bridge skipped command:', error);
        }
    }
}

function isDuplicateTouch(theater, zone) {
    const now = Number(globalThis.performance?.now?.() || Date.now());
    const previous = recentTouchByTheater.get(theater);
    recentTouchByTheater.set(theater, { zone, at: now });
    return previous?.zone === zone && Number.isFinite(previous?.at) && (now - previous.at) < 120;
}

function onTouchTheaterClick(event) {
    const target = event?.target;
    if (!(target instanceof Element)) return;
    const zoneNode = target.closest?.(TOUCH_ZONE_SELECTOR);
    if (!zoneNode) return;
    const theater = zoneNode.closest?.(TOUCH_THEATER_SELECTOR);
    if (!theater || !theater.closest?.(RABBIT_MIRROR_SELECTOR)) return;
    const zone = normalizeTouchZone(zoneNode.getAttribute('data-rm-touch-zone'));
    if (!zone || isDuplicateTouch(theater, zone)) return;

    theater.setAttribute('data-rm-touch-last-zone', zone);
    void triggerTouchTheaterLive2d(zone);
}

export function initTouchTheaterBridge() {
    if (touchTheaterListenerInstalled || typeof document === 'undefined') return;
    document.addEventListener('click', onTouchTheaterClick, false);
    touchTheaterListenerInstalled = true;
}

export function destroyTouchTheaterBridge() {
    if (!touchTheaterListenerInstalled || typeof document === 'undefined') return;
    document.removeEventListener('click', onTouchTheaterClick, false);
    touchTheaterListenerInstalled = false;
}
