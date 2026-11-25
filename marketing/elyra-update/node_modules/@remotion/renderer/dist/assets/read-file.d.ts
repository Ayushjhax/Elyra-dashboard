import http from 'node:http';
type NodeRequestAndResponse = {
    request: http.ClientRequest;
    response: http.IncomingMessage;
};
export declare const readFile: (url: string, signal: AbortSignal | null, redirectsSoFar?: number) => Promise<NodeRequestAndResponse>;
export {};
