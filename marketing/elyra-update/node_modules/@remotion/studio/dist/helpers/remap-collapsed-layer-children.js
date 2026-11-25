"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remapCollapsedLayerChildren = void 0;
const remapCollapsedLayerChildren = (previous, mutations) => {
    if (Object.keys(previous).length === 0) {
        return null;
    }
    let changed = false;
    let current = previous;
    for (const mutation of mutations) {
        const remappings = new Map();
        for (const file of mutation.files) {
            for (const remapping of file.remappings) {
                if (remapping.oldNodePath === null) {
                    continue;
                }
                const oldPrefix = `${file.absolutePath}:${JSON.stringify(remapping.oldNodePath).slice(0, -1)}`;
                if (!remappings.has(oldPrefix)) {
                    remappings.set(oldPrefix, {
                        oldPrefix,
                        newPrefix: remapping.newNodePath === null
                            ? null
                            : `${file.absolutePath}:${JSON.stringify(remapping.newNodePath).slice(0, -1)}`,
                    });
                }
            }
        }
        const next = {};
        for (const [key, value] of Object.entries(current)) {
            let parsed;
            try {
                parsed = JSON.parse(key);
            }
            catch (_a) {
                parsed = null;
            }
            if (!Array.isArray(parsed) ||
                !Array.isArray(parsed[1]) ||
                parsed[1][0] !== 'source' ||
                typeof parsed[1][1] !== 'string') {
                next[key] = value;
                continue;
            }
            const sourceKey = parsed[1][1];
            let remapping;
            // Look up path boundaries instead of scanning every sibling remapping
            // for every stored layer. Prefer a child's own move over its ancestor's.
            for (let end = sourceKey.length - 1; end >= 0; end--) {
                if (sourceKey[end] !== ',' &&
                    !(sourceKey[end] === ']' && sourceKey[end + 1] === ':')) {
                    continue;
                }
                remapping = remappings.get(sourceKey.slice(0, end));
                if (remapping) {
                    break;
                }
            }
            if (!remapping) {
                next[key] = value;
                continue;
            }
            if (remapping.newPrefix === null) {
                changed = true;
                continue;
            }
            const nextKey = JSON.stringify([
                parsed[0],
                [
                    'source',
                    remapping.newPrefix + sourceKey.slice(remapping.oldPrefix.length),
                ],
            ]);
            changed || (changed = nextKey !== key);
            // Read every old key before applying the next mutation. Sibling swaps
            // must not move a preference twice or inherit their neighbor's state.
            next[nextKey] = value;
        }
        current = next;
    }
    return changed ? current : null;
};
exports.remapCollapsedLayerChildren = remapCollapsedLayerChildren;
