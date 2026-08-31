// Test-only seam: hold the actual baseline picker result fixed while importing the real Prompt Builder.
export async function resolve(specifier, context, nextResolve) {
    if (/\/promptBuilder\.js(?:\?|$)/.test(context.parentURL || '') && /^\.\/picker\.js(?:\?|$)/.test(specifier)) {
        return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export function pickCombination() { if (!globalThis.__rmFixedPick) throw new Error("Missing fixed baseline pick"); return structuredClone(globalThis.__rmFixedPick); }') };
    }
    return nextResolve(specifier, context);
}
