type Canvas2DWithDrawElement = CanvasRenderingContext2D & {
    drawElementImage: (element: Element, dx: number, dy: number, dwidth: number, dheight: number) => void;
};
type HTMLCanvasWithLayoutSubtree = HTMLCanvasElement & {
    layoutSubtree?: boolean;
    requestPaint?: () => void;
};
export declare const supportsNativeHtmlInCanvas: () => boolean;
export declare const containsLayoutSubtreeCanvas: (element: HTMLElement) => boolean;
export type HtmlInCanvasContext = {
    layoutCanvas: HTMLCanvasWithLayoutSubtree;
    ctx: Canvas2DWithDrawElement;
    wasDrawable: boolean;
};
/**
 * Sets up a persistent drawable canvas that wraps the scaffold div.
 * Must be called once before rendering begins; the canvas stays in the DOM for the
 * lifetime of the render.
 */
export declare const setupHtmlInCanvas: ({ wrapper, div, width, height, }: {
    wrapper: HTMLDivElement;
    div: HTMLDivElement;
    width: number;
    height: number;
}) => HtmlInCanvasContext | null;
/**
 * Triggers a fresh paint record via requestPaint(), waits for the paint event,
 * then captures the element into an OffscreenCanvas using drawElementImage.
 *
 * The caller is responsible for ensuring the frame content is ready (via
 * waitForReady) before calling this function.
 */
export declare const drawWithHtmlInCanvas: ({ htmlInCanvasContext, element, scaledWidth, scaledHeight, signal, }: {
    htmlInCanvasContext: HtmlInCanvasContext;
    element: HTMLElement;
    scaledWidth: number;
    scaledHeight: number;
    signal: AbortSignal | null;
}) => Promise<OffscreenCanvasRenderingContext2D>;
export declare const teardownHtmlInCanvas: ({ htmlInCanvasContext, wrapper, div, }: {
    htmlInCanvasContext: HtmlInCanvasContext;
    wrapper: HTMLDivElement;
    div: HTMLDivElement;
}) => void;
export {};
