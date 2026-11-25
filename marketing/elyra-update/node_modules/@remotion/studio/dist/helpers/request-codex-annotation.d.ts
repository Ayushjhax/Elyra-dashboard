export declare const getVisibleAnnotationTarget: (targets: readonly (Element | null | undefined)[]) => Element | null;
export declare const requestCodexAnnotation: ({ target, initialComment, metadata, }: {
    readonly target: Element | null;
    readonly initialComment: string | null;
    readonly metadata: Record<string, string | number> | null;
}) => boolean;
