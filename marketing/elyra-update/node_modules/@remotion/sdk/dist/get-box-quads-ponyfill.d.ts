export type GetBoxQuadsBox = 'margin' | 'border' | 'padding' | 'content';
export type GetBoxQuadsPonyfillOptions = {
    readonly box?: GetBoxQuadsBox;
    readonly relativeTo?: Element;
};
/**
 * Returns border/margin/padding/content box quads for elements and text fragments.
 * Uses the native API when available, otherwise the getBoxQuads ponyfill.
 */
export declare const getBoxQuadsPonyfill: (element: Element | Text, options?: GetBoxQuadsPonyfillOptions) => readonly DOMQuad[] | null;
