export declare const makeSerializedQueue: () => <T>(fn: () => Promise<T> | T) => Promise<T>;
