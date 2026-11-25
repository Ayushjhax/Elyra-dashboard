export declare const startSlideViewTransition: ({ panels, direction, update, }: {
    readonly panels: readonly {
        readonly element: HTMLElement;
        readonly name: string;
        readonly clipY: {
            readonly top: number;
            readonly bottom: number;
        } | null;
    }[];
    readonly direction: 'forward' | 'backward';
    readonly update: () => void;
}) => (() => void) | null;
