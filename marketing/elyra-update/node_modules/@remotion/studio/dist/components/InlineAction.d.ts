import React from 'react';
export type RenderInlineAction = (color: string) => React.ReactNode;
export type InlineActionProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'style' | 'title'> & {
    readonly onClick: React.MouseEventHandler<HTMLButtonElement>;
    readonly renderAction: RenderInlineAction;
    readonly hoveredColor?: string;
    readonly unhoveredColor?: string;
    readonly variant: 'compact' | 'modal-header' | null;
    readonly style?: React.CSSProperties;
};
export declare const InlineAction: ({ renderAction, onClick, disabled, hoveredColor, unhoveredColor, variant, style: customStyle, className, onPointerDown: onPointerDownProp, ...buttonProps }: InlineActionProps) => React.JSX.Element;
