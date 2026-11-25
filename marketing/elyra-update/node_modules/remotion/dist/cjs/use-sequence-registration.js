"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSequenceRegistration = void 0;
const react_1 = require("react");
const SequenceManager_js_1 = require("./SequenceManager.js");
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? react_1.useEffect : react_1.useLayoutEffect;
const useSequenceRegistration = ({ getSequence, id, }) => {
    const { registerSequence, unregisterSequence, updateSequence } = (0, react_1.useContext)(SequenceManager_js_1.SequenceManagerActionsContext);
    const registrationDisabled = (0, react_1.useContext)(SequenceManager_js_1.DisableSequenceRegistrationContext);
    const commitRegistrationEnabled = (0, react_1.useContext)(SequenceManager_js_1.SequenceCommitRegistrationContext);
    const getSequenceRef = (0, react_1.useRef)(getSequence);
    useIsomorphicLayoutEffect(() => {
        getSequenceRef.current = getSequence;
    }, [getSequence]);
    const lastRegisteredGetterRef = (0, react_1.useRef)(null);
    const registrationEnabled = getSequence !== null && !registrationDisabled && !commitRegistrationEnabled;
    const registration = (0, react_1.useMemo)(() => commitRegistrationEnabled && !registrationDisabled && getSequence !== null
        ? getSequence()
        : null, [commitRegistrationEnabled, getSequence, registrationDisabled]);
    (0, react_1.useEffect)(() => {
        if (!registrationEnabled) {
            return;
        }
        const currentGetter = getSequenceRef.current;
        if (currentGetter === null) {
            throw new Error('Expected a sequence registration getter');
        }
        registerSequence(currentGetter());
        lastRegisteredGetterRef.current = currentGetter;
        return () => {
            lastRegisteredGetterRef.current = null;
            unregisterSequence(id);
        };
    }, [id, registerSequence, registrationEnabled, unregisterSequence]);
    // Commit fallback metadata with the synchronous preview update, so continuous input
    // cannot leave lower-priority registration updates pending between commits.
    useIsomorphicLayoutEffect(() => {
        if (commitRegistrationEnabled ||
            registrationDisabled ||
            getSequence === null ||
            lastRegisteredGetterRef.current === null ||
            lastRegisteredGetterRef.current === getSequence) {
            return;
        }
        updateSequence(getSequence());
        lastRegisteredGetterRef.current = getSequence;
    }, [
        commitRegistrationEnabled,
        getSequence,
        registrationDisabled,
        updateSequence,
    ]);
    return registration;
};
exports.useSequenceRegistration = useSequenceRegistration;
