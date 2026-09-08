// Reserve scrollable space, not a decorative frame. No chat text, polling or model calls.
let active = null;
export function composerOverlap(chat, composer, viewportBottom) {
    if (!chat || !composer || composer.width <= 0 || composer.height <= 0
        || composer.right <= chat.left || composer.left >= chat.right) return 0;
    const bottom = Math.min(chat.bottom, viewportBottom);
    if (composer.top >= bottom || composer.bottom <= chat.top) return 0;
    return Math.ceil(Math.max(0, bottom - Math.max(chat.top, composer.top)) + 12);
}
export function scheduleRabbitMirrorComposerClearance() { active?.schedule(); }
function externalFooterClearance(message) {
    const rect = message.getBoundingClientRect();
    let protrusion = 0;
    // Measure only the adjacent owner's footer geometry, never theme artwork/text.
    for (const pseudo of ['::before', '::after']) {
        const style = getComputedStyle(message, pseudo);
        if (!style.content || style.content === 'none' || style.content === 'normal'
            || style.display === 'none' || style.visibility === 'hidden' || style.position !== 'absolute') continue;
        if (/^-?[\d.]+px$/.test(style.bottom)) protrusion = Math.max(protrusion, -parseFloat(style.bottom));
    }
    for (const node of message.querySelectorAll('.swipe_left, .swipeRightBlock, .swipes-counter')) {
        const style = getComputedStyle(node), box = node.getBoundingClientRect();
        if (style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0)
            protrusion = Math.max(protrusion, box.bottom - rect.bottom);
    }
    return protrusion > 0 ? Math.ceil(protrusion + 6) : 0;
}
export function destroyRabbitMirrorComposerClearance() { active?.destroy(); active = null; }
export function initRabbitMirrorComposerClearance() {
    destroyRabbitMirrorComposerClearance();
    const chat = document.getElementById('chat');
    if (!chat) return;
    let frame = 0, stopped = false, spacer = null, lastHeight = 0;
    let observedForm = null, footerOwner = null, footerHeight = 0;
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;
    const viewport = window.visualViewport;
    function measure() {
        frame = 0;
        if (stopped || !chat.isConnected) return;
        const owner = chat.querySelector(':scope > .mes.last_mes:has(+ .rabbit-mirror-external-host[data-rm-source="independent"][data-rm-placement="external"]:not([hidden]))');
        if (footerOwner !== owner) {
            footerOwner?.style.removeProperty('--rm-external-footer-clearance');
            footerOwner = owner; footerHeight = 0;
        }
        if (owner) {
            const next = externalFooterClearance(owner);
            if (next !== footerHeight) {
                owner.style.setProperty('--rm-external-footer-clearance', `${next}px`);
                footerHeight = next;
            }
        }
        const form = document.getElementById('send_form') || document.getElementById('form_sheld');
        if (observedForm !== form) {
            if (observedForm) resize?.unobserve(observedForm);
            observedForm = form;
            if (form) resize?.observe(form);
        }
        // First matching shell only; never enumerate historical messages or their content.
        const hasMirror = !!chat.querySelector('toto, [data-rabbit-mirror-external-source="true"]');
        const formStyle = form && getComputedStyle(form);
        const shown = form && formStyle.display !== 'none' && formStyle.visibility !== 'hidden';
        const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const height = hasMirror && shown ? composerOverlap(chat.getBoundingClientRect(), form.getBoundingClientRect(), bottom) : 0;
        if (!height) {
            if (spacer) { spacer.remove(); spacer = null; }
            lastHeight = 0;
            return;
        }
        const nearEnd = chat.scrollHeight - chat.clientHeight - chat.scrollTop < 4;
        const oldHeight = lastHeight;
        if (!spacer) {
            spacer = document.createElement('div');
            spacer.className = 'rabbit-mirror-composer-clearance';
            spacer.setAttribute('aria-hidden', 'true');
        }
        if (height !== lastHeight) {
            spacer.style.setProperty('--rm-composer-clearance', `${height}px`);
            lastHeight = height;
        }
        if (chat.lastElementChild !== spacer) chat.append(spacer);
        // Keep an already bottom-anchored reader at the bottom; never jump a history reader.
        if (nearEnd && height > oldHeight) chat.scrollTop = chat.scrollHeight;
    }
    function schedule() {
        if (!stopped && !frame) frame = requestAnimationFrame(measure);
    }
    const structure = typeof MutationObserver === 'function' ? new MutationObserver(records => {
        if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n !== spacer))) schedule();
    }) : null;
    structure?.observe(chat, { childList: true });
    resize?.observe(chat);
    window.addEventListener('resize', schedule, { passive: true });
    viewport?.addEventListener('resize', schedule, { passive: true });
    viewport?.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    active = { schedule, destroy() {
        stopped = true;
        if (frame) cancelAnimationFrame(frame);
        structure?.disconnect(); resize?.disconnect(); spacer?.remove();
        footerOwner?.style.removeProperty('--rm-external-footer-clearance');
        window.removeEventListener('resize', schedule);
        viewport?.removeEventListener('resize', schedule);
        viewport?.removeEventListener('scroll', schedule);
        document.removeEventListener('focusin', schedule);
        document.removeEventListener('focusout', schedule);
    } };
    schedule();
}
