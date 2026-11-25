export type RegistryStore<TSnapshot> = {
    readonly getSnapshot: () => TSnapshot;
    readonly subscribe: (listener: () => void) => () => void;
    readonly setSnapshot: (update: (previous: TSnapshot) => TSnapshot) => void;
};
export declare const areRegistryEntriesEqual: <T extends object>(previous: T, next: T) => boolean;
export declare const reconcileRegistryEntries: <T extends object>({ current, entries, previousDescriptors, previousKeys, nextKeys, getKey, order, orderProperty, }: {
    readonly current: T[];
    readonly entries: readonly T[];
    readonly previousDescriptors: ReadonlyMap<string, unknown>;
    readonly previousKeys: ReadonlySet<string>;
    readonly nextKeys: ReadonlySet<string>;
    readonly getKey: (entry: T) => string;
    readonly order: ReadonlyMap<string, number>;
    readonly orderProperty: keyof T;
}) => T[];
export declare const createRegistryStore: <TSnapshot>(initialSnapshot: TSnapshot) => RegistryStore<TSnapshot>;
