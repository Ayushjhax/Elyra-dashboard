import type { SVGProps } from 'react';
import type { AssetFileType } from '../helpers/get-preview-file-type';
type AssetFileIconProps = SVGProps<SVGSVGElement> & {
    readonly color: string;
};
export declare const AssetFileIcon: ({ fileType, ...props }: AssetFileIconProps & {
    readonly fileType: AssetFileType;
}) => import("react").JSX.Element;
export {};
