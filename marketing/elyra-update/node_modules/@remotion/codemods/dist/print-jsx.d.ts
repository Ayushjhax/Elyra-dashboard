import type { JSXElement, JSXOpeningElement } from '@babel/types';
import type { namedTypes } from 'ast-types';
export declare const captureJsxAttributeSources: (node: JSXElement | JSXOpeningElement) => Map<object, string>;
export declare const indentInsertedJsx: ({ indent, insertion, }: {
    indent: string;
    insertion: string;
}) => string;
export declare const printInsertedJsx: ({ compactLiteralProps, element, input, originalAttributeSources, prettierConfigOverride, }: {
    compactLiteralProps: boolean;
    element: namedTypes.JSXElement | namedTypes.JSXFragment;
    input: string;
    originalAttributeSources?: ReadonlyMap<object, string>;
    prettierConfigOverride: Record<string, unknown> | null;
}) => string;
export declare const printJsxOpeningElement: ({ compactLiteralProps, openingElement, input, originalAttributeSources, prettierConfigOverride, }: {
    compactLiteralProps: boolean;
    openingElement: namedTypes.JSXOpeningElement;
    input: string;
    originalAttributeSources?: ReadonlyMap<object, string>;
    prettierConfigOverride: Record<string, unknown> | null;
}) => string;
