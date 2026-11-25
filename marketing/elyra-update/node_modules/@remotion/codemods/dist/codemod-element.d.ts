import type { CodemodValue } from './codemod-value';
export type CodemodElementChild = CodemodElement | string;
export type CodemodElementOptions = {
    component: string;
    importPath?: string | null;
    importName?: string | null;
    props?: Record<string, CodemodValue>;
    children?: readonly (CodemodElement | CodemodElementOptions | string)[];
};
/**
 * Describes a JSX element to insert into source code.
 * Instances are immutable: every method returns a new element and leaves the
 * original untouched, so an element can be reused as a template.
 * `JSON.stringify()` produces a plain description that `createElement()`
 * accepts again.
 */
export declare class CodemodElement {
    readonly component: string;
    readonly importPath: string | null;
    readonly importName: string | null;
    readonly props: Readonly<Record<string, CodemodValue>>;
    readonly children: readonly CodemodElementChild[];
    constructor({ component, importPath, importName, props, children, }: CodemodElementOptions);
    /** Returns a copy with the prop set to the value. */
    withProp(name: string, value: CodemodValue): CodemodElement;
    /** Returns a copy with the props merged into the existing props. */
    withProps(props: Record<string, CodemodValue>): CodemodElement;
    /** Returns a copy without the prop. */
    withoutProp(name: string): CodemodElement;
    /** Returns a copy with the child appended after the existing children. */
    withChild(child: CodemodElement | CodemodElementOptions | string): CodemodElement;
    /** Returns a copy whose children are replaced. */
    withChildren(children: readonly (CodemodElement | CodemodElementOptions | string)[]): CodemodElement;
}
export declare const createElement: (options: CodemodElementOptions) => CodemodElement;
/**
 * Returns a value that is written as `staticFile(path)` when inserted into
 * source code. Pass it as a prop value to `createElement()` or
 * `updateNodeProps()`.
 */
export declare const staticFileValue: (path: string) => string;
