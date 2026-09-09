// TT Project Contract v1, not an invented SillyTavern event or private engine API.
// https://github.com/Darkatse/TauriTavern/blob/9693a4ec47cd4552f90878bccab453f176de0f18/docs/API/ChatSurface.md
// Register this lightweight bridge during extension evaluation, before projection.
// Heavy consumers may subscribe later; only currently mounted host leases are replayed.
const PARTICIPANT_ID = 'rabbitmirror/message-runtime';
const SURFACES = new Set(['fullscreen-window', 'backdrop', 'free-window', 'viewport-host']);

function toDisposer(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'function') return value;
    if (typeof value?.then === 'function') throw new TypeError('RabbitMirror ChatSurface handlers must return synchronous cleanup');
    if (typeof value?.dispose === 'function') return () => value.dispose();
    throw new TypeError('RabbitMirror ChatSurface cleanup must be a function or disposable');
}

export function createRabbitMirrorHostCompatibility(hostGlobal = globalThis) {
    let initialized = false;
    let managed = false;
    let registration = null;
    let status = Object.freeze({ host: 'sillytavern', managed: false, registered: false, protocolVersion: null, errorCode: '' });
    const subscriptions = new Map();
    const mounted = new Map();

    function reportFault(error) {
        status = Object.freeze({ ...status, errorCode: 'CHAT_SURFACE_CONSUMER_FAILED' });
        registration?.fault?.(error);
    }

    function disposeCallback(lease, id) {
        const dispose = lease.cleanups.get(id);
        lease.cleanups.delete(id);
        lease.delivered.delete(id);
        dispose?.();
    }

    function deliver(lease, subscription) {
        if (!lease.active || lease.context.signal.aborted || lease.delivered.has(subscription.id)) return;
        const callback = subscription[lease.kind];
        if (typeof callback !== 'function') return;
        lease.delivered.add(subscription.id);
        const dispose = toDisposer(callback(lease.context));
        // A handler can synchronously release its own mount or subscription.
        if (!lease.active || !subscriptions.has(subscription.id) || lease.context.signal.aborted) dispose?.();
        else if (dispose) lease.cleanups.set(subscription.id, dispose);
    }

    function openLease(kind, context) {
        if (!context?.element || !context?.content || !Number.isInteger(context?.mesid)
            || typeof context?.signal?.addEventListener !== 'function') {
            throw new TypeError('RabbitMirror requires a valid TT ChatSurface mounted context');
        }
        if (context.signal.aborted) return () => {};
        let record = mounted.get(context.element);
        if (!record) {
            record = { didMount: null, didCommitContent: null };
            mounted.set(context.element, record);
        }
        record[kind]?.dispose();
        // Replacing the final lease can remove the old record from the map.
        mounted.set(context.element, record);
        const lease = { kind, context, active: true, cleanups: new Map(), delivered: new Set(), dispose: null };
        const dispose = () => {
            if (!lease.active) return;
            lease.active = false;
            context.signal.removeEventListener('abort', dispose);
            let firstError = null;
            for (const id of [...lease.delivered]) {
                try { disposeCallback(lease, id); } catch (error) { firstError ??= error; }
            }
            if (record[kind] === lease) record[kind] = null;
            if (!record.didMount && !record.didCommitContent) mounted.delete(context.element);
            if (firstError) reportFault(firstError);
        };
        lease.dispose = dispose;
        record[kind] = lease;
        context.signal.addEventListener('abort', dispose, { once: true });
        try {
            for (const subscription of subscriptions.values()) deliver(lease, subscription);
        } catch (error) {
            dispose();
            throw error;
        }
        return dispose;
    }

    function initialize() {
        if (initialized) return status;
        initialized = true;
        const host = hostGlobal?.__TAURITAVERN__;
        const api = host?.api?.chatSurface;
        if (!host) return status;
        status = Object.freeze({ ...status, host: 'tauritavern', protocolVersion: api?.protocolVersion ?? null });
        if (typeof api?.isManagedOwnershipRequired !== 'function') return status;
        try { managed = api.isManagedOwnershipRequired() === true; }
        catch {
            // Ownership is unknown, so do not launch an unmanaged repair watcher.
            managed = true;
            status = Object.freeze({ ...status, managed, errorCode: 'CHAT_SURFACE_OWNERSHIP_UNAVAILABLE' });
            return status;
        }
        status = Object.freeze({ ...status, managed });
        if (!managed) return status;
        if (api.protocolVersion !== 1 || typeof api.registerParticipant !== 'function') {
            status = Object.freeze({ ...status, errorCode: 'CHAT_SURFACE_PROTOCOL_UNSUPPORTED' });
            return status;
        }
        try {
            registration = api.registerParticipant({
                id: PARTICIPANT_ID,
                protocolVersion: 1,
                didMount: context => openLease('didMount', context),
                didCommitContent: context => openLease('didCommitContent', context),
            });
            status = Object.freeze({ ...status, registered: true });
        } catch {
            status = Object.freeze({ ...status, errorCode: 'CHAT_SURFACE_REGISTRATION_FAILED' });
        }
        return status;
    }

    function subscribe(definition) {
        initialize();
        if (!definition || typeof definition.id !== 'string' || !definition.id.trim()) {
            throw new TypeError('RabbitMirror ChatSurface consumer requires a stable id');
        }
        for (const kind of ['didMount', 'didCommitContent']) {
            if (definition[kind] !== undefined && typeof definition[kind] !== 'function') {
                throw new TypeError(`RabbitMirror ChatSurface ${kind} must be a function`);
            }
        }
        if (!managed || !status.registered) return () => {};
        if (subscriptions.has(definition.id)) throw new Error(`Duplicate RabbitMirror ChatSurface consumer: ${definition.id}`);
        const subscription = { id: definition.id, didMount: definition.didMount, didCommitContent: definition.didCommitContent };
        subscriptions.set(subscription.id, subscription);
        let active = true;
        const unsubscribe = () => {
            if (!active) return;
            active = false;
            subscriptions.delete(subscription.id);
            let firstError = null;
            for (const record of mounted.values()) {
                for (const kind of ['didMount', 'didCommitContent']) {
                    if (!record[kind]) continue;
                    try { disposeCallback(record[kind], subscription.id); } catch (error) { firstError ??= error; }
                }
            }
            if (firstError) reportFault(firstError);
        };
        try {
            for (const record of mounted.values()) {
                for (const kind of ['didMount', 'didCommitContent']) {
                    if (record[kind]) deliver(record[kind], subscription);
                }
            }
        } catch (error) {
            unsubscribe();
            reportFault(error);
            throw error;
        }
        return unsubscribe;
    }

    return Object.freeze({
        initialize,
        isManaged: () => { initialize(); return managed; },
        getStatus: () => { initialize(); return status; },
        subscribe,
        getMountedMessages() {
            initialize();
            return [...mounted.values()].map(record => (record.didCommitContent || record.didMount)?.context).filter(Boolean);
        },
        externalPlacementParent(message) { initialize(); return managed ? message : null; },
        applySurface(element, surface) {
            if (!SURFACES.has(surface)) throw new TypeError('Unsupported RabbitMirror host surface');
            if (!hostGlobal?.__TAURITAVERN__?.api?.layout || typeof element?.setAttribute !== 'function') return false;
            element.setAttribute('data-tt-mobile-surface', surface);
            return true;
        },
    });
}

const compatibility = createRabbitMirrorHostCompatibility();
export const initRabbitMirrorHostCompatibility = () => compatibility.initialize();
export const isRabbitMirrorManagedChatSurface = () => compatibility.isManaged();
export const getRabbitMirrorHostCompatibilityStatus = () => compatibility.getStatus();
export const subscribeRabbitMirrorChatSurface = definition => compatibility.subscribe(definition);
export const getRabbitMirrorMountedMessages = () => compatibility.getMountedMessages();
export const getRabbitMirrorExternalPlacementParent = message => compatibility.externalPlacementParent(message);
export const applyRabbitMirrorHostSurface = (element, surface) => compatibility.applySurface(element, surface);
