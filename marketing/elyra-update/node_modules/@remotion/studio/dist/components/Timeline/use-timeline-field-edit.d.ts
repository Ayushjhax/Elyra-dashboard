export declare const useTimelineFieldEdit: () => {
    markEdit: () => void;
    finishEdit: (save: Promise<void>, clear: () => void) => Promise<void>;
};
