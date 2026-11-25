import { type InlineActionProps } from './InlineAction';
import type { ComboboxValue } from './NewComposition/ComboBox';
export declare const InlineDropdown: ({ values, getItems, onOpenChange, unhoveredColor, ...props }: Omit<InlineActionProps, 'onClick'> & {
    readonly values?: ComboboxValue[];
    readonly getItems?: () => ComboboxValue[];
    readonly onOpenChange?: (open: boolean) => void;
}) => import("react").JSX.Element;
