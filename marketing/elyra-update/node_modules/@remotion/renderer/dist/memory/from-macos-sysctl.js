"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableMemoryFromMacos = void 0;
const node_child_process_1 = require("node:child_process");
const node_os_1 = require("node:os");
const logger_1 = require("../logger");
const getAvailableMemoryFromMacos = (logLevel) => {
    if ((0, node_os_1.platform)() !== 'darwin') {
        return null;
    }
    try {
        const output = (0, node_child_process_1.execFileSync)('/usr/sbin/sysctl', [
            '-n',
            'vm.page_free_count',
            'vm.page_pageable_external_count',
            'vm.page_purgeable_count',
            // hw.pagesize can differ from the kernel page size under Rosetta.
            'vm.pagesize',
            'kern.memorystatus_vm_pressure_level',
        ], { encoding: 'utf-8', timeout: 1000, stdio: ['ignore', 'pipe', 'pipe'] });
        const values = output.trim().split(/\s+/);
        if (values.length !== 5 || values.some((value) => !/^\d+$/.test(value))) {
            throw new Error('Unexpected macOS memory information from sysctl');
        }
        const numbers = values.map(Number);
        const [free, fileBacked, purgeable, pageSize, pressureLevel] = numbers;
        if (numbers.some((value) => !Number.isSafeInteger(value)) ||
            pageSize === 0 ||
            ![1, 2, 4].includes(pressureLevel)) {
            throw new Error('Invalid macOS memory information from sysctl');
        }
        // The sysctl exposes dispatch pressure flags: normal=1, warning=2, critical=4.
        if (pressureLevel === 4) {
            logger_1.Log.verbose({ indent: false, logLevel }, 'macOS memory pressure is critical. Using os.freemem().');
            return null;
        }
        // XNU's fully reclaimable pages exclude anonymous and compressed memory:
        // https://github.com/apple-oss-distributions/xnu/blob/main/doc/vm/memorystatus_notify.md
        const availableMemory = (free + fileBacked + purgeable) * pageSize;
        if (!Number.isSafeInteger(availableMemory)) {
            throw new Error('Invalid macOS available memory size');
        }
        return Math.min(availableMemory, (0, node_os_1.totalmem)());
    }
    catch (err) {
        logger_1.Log.verbose({ indent: false, logLevel }, 'Could not read reclaimable macOS memory. Using os.freemem().', err);
        return null;
    }
};
exports.getAvailableMemoryFromMacos = getAvailableMemoryFromMacos;
