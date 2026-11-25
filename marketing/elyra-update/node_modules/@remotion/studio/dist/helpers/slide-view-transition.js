"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSlideViewTransition = void 0;
const react_dom_1 = require("react-dom");
let finishCurrentTransition = null;
const startSlideViewTransition = ({ panels, direction, update, }) => {
    if (typeof document.startViewTransition !== 'function' ||
        typeof react_dom_1.flushSync !== 'function' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return null;
    }
    // A document can only run one view transition. Finish another panel's pending
    // update before taking over, so its latest view is not lost.
    finishCurrentTransition === null || finishCurrentTransition === void 0 ? void 0 : finishCurrentTransition();
    const root = document.documentElement;
    const transitionClass = `__remotion-slide-${direction}`;
    root.classList.add(transitionClass);
    for (const { element, name } of panels) {
        element.style.setProperty('view-transition-name', name);
    }
    const stylesheet = document.createElement('style');
    stylesheet.textContent = panels
        .map(({ name, clipY }) => `
		::view-transition-group(${name}) {
			animation: none;
			overflow: clip;
			${clipY === null ? '' : `clip-path: inset(${clipY.top}px 0 ${clipY.bottom}px 0);`}
		}
		::view-transition-old(${name}), ::view-transition-new(${name}) {
			animation-duration: 75ms;
			animation-timing-function: ease-in-out;
			animation-fill-mode: both;
			mix-blend-mode: normal;
		}
		::view-transition-old(${name}) { animation-name: remotion-slide-out; }
		::view-transition-new(${name}) {
			animation-name: remotion-slide-in;
			animation-delay: 75ms;
		}
		@media (prefers-reduced-motion: reduce) {
			::view-transition-old(${name}), ::view-transition-new(${name}) { animation: none; }
		}
	`)
        .join('\n');
    document.head.appendChild(stylesheet);
    let cancelled = false;
    let cleaned = false;
    let updated = false;
    const cleanup = () => {
        if (cleaned) {
            return;
        }
        cleaned = true;
        root.classList.remove(transitionClass);
        for (const { element } of panels) {
            element.style.removeProperty('view-transition-name');
        }
        stylesheet.remove();
        if (finishCurrentTransition === finish) {
            finishCurrentTransition = null;
        }
    };
    const transition = document.startViewTransition(() => {
        if (!cancelled) {
            updated = true;
            (0, react_dom_1.flushSync)(update);
        }
    });
    const cancel = () => {
        cancelled = true;
        transition.skipTransition();
        cleanup();
    };
    const finish = () => {
        if (!updated && !cancelled) {
            updated = true;
            update();
        }
        cancel();
    };
    finishCurrentTransition = finish;
    // A skipped transition still calls its update, but rejects `ready`.
    transition.ready.catch(() => undefined);
    transition.finished.then(cleanup, cleanup);
    return cancel;
};
exports.startSlideViewTransition = startSlideViewTransition;
