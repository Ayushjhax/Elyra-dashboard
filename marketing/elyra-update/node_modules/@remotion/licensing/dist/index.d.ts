import { internalRegisterUsageEvent } from './register-usage-event';
export { UsageEventClassification as Classification, registerUsageEvent, RegisterUsageEventResponse, } from './register-usage-event';
export { EventCount, getUsage, GetUsageResponse } from './get-usage';
export declare const LicensingInternals: {
    internalRegisterUsageEvent: typeof internalRegisterUsageEvent;
};
