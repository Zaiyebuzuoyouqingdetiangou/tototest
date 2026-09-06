// Test-only seam: hold the actual baseline picker result fixed while importing the real Prompt Builder.
export async function resolve(specifier, context, nextResolve) {
    if (/\/promptBuilder\.js(?:\?|$)/.test(context.parentURL || '') && /^\.\/picker\.js(?:\?|$)/.test(specifier)) {
        return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(`
export function pickCombination() { if (!globalThis.__rmFixedPick) throw new Error("Missing fixed baseline pick"); return structuredClone(globalThis.__rmFixedPick); }
export function pickCombinationBatch(settings, key, context, count) { return count > 1 ? Array.from({ length: count }, () => pickCombination()) : [pickCombination()]; }
export function pickCombinationForMultifaceResay() { return pickCombination(); }
`) };
    }
    return nextResolve(specifier, context);
}
