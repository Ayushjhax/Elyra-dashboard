"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableMemory = void 0;
const node_os_1 = require("node:os");
const logger_1 = require("../logger");
const from_docker_cgroup_1 = require("./from-docker-cgroup");
const from_lambda_env_1 = require("./from-lambda-env");
const from_macos_sysctl_1 = require("./from-macos-sysctl");
const from_proc_meminfo_1 = require("./from-proc-meminfo");
const getAvailableMemory = (logLevel) => {
    let hostMemory = (0, node_os_1.freemem)();
    let source = 'os.freemem()';
    if ((0, node_os_1.platform)() === 'linux') {
        const procInfo = (0, from_proc_meminfo_1.getAvailableMemoryFromProcMeminfo)(logLevel);
        if (procInfo !== null) {
            hostMemory = procInfo;
            source = '/proc/meminfo MemAvailable';
        }
    }
    else if ((0, node_os_1.platform)() === 'darwin') {
        const macosMemory = (0, from_macos_sysctl_1.getAvailableMemoryFromMacos)(logLevel);
        if (macosMemory !== null) {
            hostMemory = macosMemory;
            source = 'macOS sysctl (free, file-backed and purgeable pages)';
        }
    }
    let availableMemory = hostMemory;
    const cgroupMemory = (0, node_os_1.platform)() === 'linux' ? (0, from_docker_cgroup_1.getAvailableMemoryFromCgroup)() : null;
    if (cgroupMemory !== null && Number.isFinite(cgroupMemory)) {
        // There are 2 Docker memory configurations:
        // 1. --memory=[num]
        // 2. Global Docker memory limit
        // If cgroup limit is higher than global memory, the global memory limit still applies
        if (cgroupMemory > hostMemory * 1.25) {
            logger_1.Log.warn({ indent: false, logLevel }, 'Detected differing memory amounts:');
            logger_1.Log.warn({ indent: false, logLevel }, `Memory reported by CGroup: ${(cgroupMemory / 1024 / 1024).toFixed(2)} MB`);
            logger_1.Log.warn({ indent: false, logLevel }, `Memory reported by ${source}: ${(hostMemory / 1024 / 1024).toFixed(2)} MB`);
            logger_1.Log.warn({ indent: false, logLevel }, 'You might have inadvertently set the --memory flag of `docker run` to a value that is higher than the global Docker memory limit.');
            logger_1.Log.warn({ indent: false, logLevel }, 'Using the lower amount of memory for calculation.');
        }
        availableMemory = Math.min(availableMemory, Math.max(0, cgroupMemory));
        source += ', bounded by remaining cgroup memory';
    }
    const maxLambdaMemory = (0, from_lambda_env_1.getMaxLambdaMemory)();
    if (maxLambdaMemory !== null && Number.isFinite(maxLambdaMemory)) {
        availableMemory = Math.min(availableMemory, Math.max(0, maxLambdaMemory));
        source += ', bounded by Lambda memory';
    }
    logger_1.Log.verbose({ indent: false, logLevel }, `Available memory: ${(availableMemory / 1024 / 1024).toFixed(2)} MiB (${source})`);
    return availableMemory;
};
exports.getAvailableMemory = getAvailableMemory;
