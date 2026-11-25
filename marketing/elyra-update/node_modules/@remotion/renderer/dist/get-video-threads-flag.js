"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIdealVideoThreadsFlag = void 0;
const get_cpu_count_1 = require("./get-cpu-count");
const get_available_memory_1 = require("./memory/get-available-memory");
const MEMORY_USAGE_PER_THREAD = 400000000; // 400MB
const RESERVED_MEMORY = 2000000000;
// Match Chromium's normal decoder thread limit. --video-threads bypasses that
// limit, and too many frame threads can require more packets before producing
// output than Mediabunny's decoder queue permits, causing frame extraction to hang.
const MAX_VIDEO_THREADS = 16;
const getIdealVideoThreadsFlag = (logLevel) => {
    const freeMemory = (0, get_available_memory_1.getAvailableMemory)(logLevel);
    const cpus = (0, get_cpu_count_1.getCpuCount)();
    const maxRecommendedBasedOnCpus = (cpus * 2) / 3;
    const maxRecommendedBasedOnMemory = (freeMemory - RESERVED_MEMORY) / MEMORY_USAGE_PER_THREAD;
    const maxRecommended = Math.min(maxRecommendedBasedOnCpus, maxRecommendedBasedOnMemory, MAX_VIDEO_THREADS);
    return Math.max(1, Math.round(maxRecommended));
};
exports.getIdealVideoThreadsFlag = getIdealVideoThreadsFlag;
