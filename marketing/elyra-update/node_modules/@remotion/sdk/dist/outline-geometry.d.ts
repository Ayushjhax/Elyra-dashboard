export type CanvasOutlinePoint = {
    readonly x: number;
    readonly y: number;
};
/** Measured geometry uses composition pixels at scale 1, relative to its root. */
export type CanvasOutline = {
    readonly key: string;
    readonly dimensions: {
        readonly width: number;
        readonly height: number;
    } | null;
    readonly uncroppedPoints: readonly [
        CanvasOutlinePoint,
        CanvasOutlinePoint,
        CanvasOutlinePoint,
        CanvasOutlinePoint
    ] | null;
    readonly points: readonly [
        CanvasOutlinePoint,
        CanvasOutlinePoint,
        CanvasOutlinePoint,
        CanvasOutlinePoint
    ];
    /**
     * The SVG geometry of a path element, in the same space as
     * `uncroppedPoints`. Crop is not baked in — the outline always shows the
     * full geometry. Null for non-path elements, or when the geometry cannot
     * be read.
     */
    readonly path: CanvasOutlinePath | null;
};
/** Affine transform mapping SVG user units into the outline's coordinate space. */
export type CanvasOutlineMatrix = {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
    readonly f: number;
};
/** The exact geometry of an SVG path element, without sampling. */
export type CanvasOutlinePath = {
    readonly d: string;
    readonly matrix: CanvasOutlineMatrix;
};
/** Converts outline coordinates without changing the element's local dimensions. */
export declare const scaleCanvasOutline: (outline: CanvasOutline, scale: number) => CanvasOutline;
export type CanvasOutlineUv = readonly [number, number];
/** Maps normalized coordinates onto a quad, including perspective transforms. */
export declare const getCanvasOutlinePoint: (points: CanvasOutline['points'], uv: CanvasOutlineUv) => CanvasOutlinePoint;
/** Maps a point back to normalized coordinates within an outline quad. */
export declare const getCanvasOutlineUv: (points: CanvasOutline['points'], point: CanvasOutlinePoint) => CanvasOutlineUv;
/** The fraction cropped from each edge of the original element. */
export type CanvasOutlineCrop = {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
};
export type CanvasOutlineTarget = {
    readonly key: string;
    readonly ref: React.RefObject<Element | null>;
    readonly crop: CanvasOutlineCrop;
    readonly includeOutsideContainer: boolean;
};
