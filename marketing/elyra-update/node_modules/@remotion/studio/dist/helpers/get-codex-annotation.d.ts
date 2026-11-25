type CodexAnnotation = {
    readonly request: (target: Element, options: {
        metadata?: Record<string, string | number>;
        initialComment?: string;
    }) => {
        accepted: boolean;
    };
};
export declare const getCodexAnnotation: () => CodexAnnotation | null;
export {};
