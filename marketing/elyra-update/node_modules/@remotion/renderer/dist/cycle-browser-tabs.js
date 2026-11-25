"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cycleBrowserTabs = void 0;
const flaky_errors_1 = require("./browser/flaky-errors");
const logger_1 = require("./logger");
const cycleBrowserTabs = ({ puppeteerInstance, concurrency, logLevel, indent, }) => {
    if (concurrency <= 1) {
        return {
            stopCycling: () => undefined,
        };
    }
    let interval = null;
    let i = 0;
    let stopped = false;
    const set = () => {
        interval = setTimeout(() => {
            puppeteerInstance
                .getBrowser()
                .pages()
                .then((pages) => {
                if (pages.length === 0) {
                    return;
                }
                const currentPage = pages[i % pages.length];
                i++;
                if (!(currentPage === null || currentPage === void 0 ? void 0 : currentPage.closed) &&
                    !stopped &&
                    (currentPage === null || currentPage === void 0 ? void 0 : currentPage.url()) !== 'about:blank') {
                    return currentPage.bringToFront().catch((err) => {
                        // The tabs are closed at the end of a render while a
                        // bringToFront() may still be in flight. Only that case is ignored.
                        if (stopped && (0, flaky_errors_1.isTargetClosedErr)(err)) {
                            return;
                        }
                        throw err;
                    });
                }
            })
                .catch((err) => logger_1.Log.error({ indent, logLevel }, err))
                .finally(() => {
                if (!stopped) {
                    set();
                }
            });
        }, 200);
    };
    set();
    return {
        stopCycling: () => {
            if (!interval) {
                return;
            }
            stopped = true;
            return clearTimeout(interval);
        },
    };
};
exports.cycleBrowserTabs = cycleBrowserTabs;
