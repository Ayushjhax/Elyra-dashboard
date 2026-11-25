"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRegistryStore = exports.reconcileRegistryEntries = exports.areRegistryEntriesEqual = void 0;
const areRegistryEntriesEqual = (previous, next) => {
    const keys = Object.keys(previous);
    return (keys.length === Object.keys(next).length &&
        keys.every((key) => Object.prototype.hasOwnProperty.call(next, key) &&
            Object.is(Reflect.get(previous, key), Reflect.get(next, key))));
};
exports.areRegistryEntriesEqual = areRegistryEntriesEqual;
const reconcileRegistryEntries = ({ current, entries, previousDescriptors, previousKeys, nextKeys, getKey, order, orderProperty, }) => {
    var _a;
    const previousByKey = new Map(current.map((entry) => [getKey(entry), entry]));
    const next = entries.map((entry) => {
        var _a;
        const key = getKey(entry);
        const previous = previousByKey.get(key);
        const nextOrder = (_a = order.get(key)) !== null && _a !== void 0 ? _a : null;
        if (previous &&
            previousDescriptors.get(key) === entry &&
            previous[orderProperty] === nextOrder) {
            return previous;
        }
        const registered = { ...entry, [orderProperty]: nextOrder };
        return previous && (0, exports.areRegistryEntriesEqual)(previous, registered)
            ? previous
            : registered;
    });
    // Preserve imperative registrations, including their committed order.
    for (const entry of current) {
        const key = getKey(entry);
        if (!previousKeys.has(key) && !nextKeys.has(key)) {
            const nextOrder = (_a = order.get(key)) !== null && _a !== void 0 ? _a : entry[orderProperty];
            next.push(entry[orderProperty] === nextOrder
                ? entry
                : { ...entry, [orderProperty]: nextOrder });
        }
    }
    return next.length === current.length &&
        next.every((entry, index) => entry === current[index])
        ? current
        : next;
};
exports.reconcileRegistryEntries = reconcileRegistryEntries;
const createRegistryStore = (initialSnapshot) => {
    let snapshot = initialSnapshot;
    const listeners = new Set();
    return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        setSnapshot: (update) => {
            const next = update(snapshot);
            if (next === snapshot) {
                return;
            }
            snapshot = next;
            for (const listener of [...listeners]) {
                listener();
            }
        },
    };
};
exports.createRegistryStore = createRegistryStore;
