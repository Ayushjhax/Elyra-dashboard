import type { RefObject } from 'react';
/** Resolve boxless DOM roots without adding a wrapper to the composition. */
export declare const getCanvasOutlineNodes: (ref: RefObject<Element | null>) => readonly (Element | Text)[];
