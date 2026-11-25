import React from 'react';
import { type AbsoluteFillLayout, type SequenceProps } from './Sequence.js';
export type TrackProps = Omit<SequenceProps, keyof AbsoluteFillLayout | 'cropLeft' | 'cropRight' | 'cropTop' | 'cropBottom' | `_remotionInternal${string}` | 'outlineRef'>;
export type TrackWithoutSchemaProps = Omit<SequenceProps, keyof AbsoluteFillLayout> & ((AbsoluteFillLayout & {
    layout: 'absolute-fill';
}) | ({
    layout?: 'none';
} & {
    [Key in Exclude<keyof AbsoluteFillLayout, 'layout'>]?: never;
}));
export declare const TrackWithoutSchema: React.FC<TrackWithoutSchemaProps>;
/** Groups clips on one Studio timeline row and applies Sequence timing. */
export declare const Track: React.ComponentType<TrackProps>;
