import type { PropsWithChildren } from 'react';
import React from 'react';
export type RemInputStatus = 'error' | 'warning' | 'ok';
type Props = React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & {
    readonly status: RemInputStatus;
    readonly rightAlign: boolean;
    readonly small?: boolean;
};
export declare const INPUT_HORIZONTAL_PADDING = 8;
export declare const RightAlignInput: React.FC<PropsWithChildren>;
export declare const inputBaseStyle: React.CSSProperties;
export declare const getInputBorderColor: ({ status, isFocused, }: {
    status: 'error' | 'warning' | 'ok';
    isFocused: boolean;
}) => "var(--remotion-studio-fail-color)" | "var(--remotion-studio-input-hover-border, var(--remotion-studio-black-alpha-60))" | "var(--remotion-studio-warning-color)" | "var(--remotion-studio-white-alpha-15)";
export declare const RemotionInput: React.ForwardRefExoticComponent<Omit<Props, "ref"> & React.RefAttributes<HTMLInputElement>>;
export {};
