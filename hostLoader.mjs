const extensionsStub = `data:text/javascript,${encodeURIComponent(`
export const extension_settings = {};
`)}`;

const scriptStub = `data:text/javascript,${encodeURIComponent(`
export function saveSettingsDebounced() {}
export function setExtensionPrompt() {}
export const extension_prompt_types = Object.freeze({ IN_CHAT: 0 });
export const extension_prompt_roles = Object.freeze({ SYSTEM: 0, USER: 1, ASSISTANT: 2 });
export const event_types = Object.freeze({});
export const eventSource = Object.freeze({
  on() {}, off() {}, removeListener() {}, removeEventListener() {},
});
`)}`;

export async function resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('/extensions.js') || specifier === '../../../../extensions.js') {
        return { url: extensionsStub, shortCircuit: true };
    }
    if (specifier.endsWith('/script.js') || specifier === '../../../../../script.js') {
        return { url: scriptStub, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}
