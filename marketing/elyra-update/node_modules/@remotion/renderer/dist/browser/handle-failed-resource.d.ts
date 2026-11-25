import type { LogLevel } from '../log-level';
import type { LoadingFailedEvent, ResponseReceivedExtraInfoEvent } from './devtools-types';
import type { HTTPRequest } from './HTTPRequest';
export declare const handleFailedResource: ({ extraInfo, logLevel, indent, request, event, }: {
    extraInfo: ResponseReceivedExtraInfoEvent[];
    logLevel: LogLevel;
    indent: boolean;
    request: HTTPRequest;
    event: LoadingFailedEvent;
}) => void;
