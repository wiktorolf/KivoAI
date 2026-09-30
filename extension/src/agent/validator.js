import { ALLOWED_ACTIONS, SCROLL_DIRECTIONS, ALLOWED_KEYS, ACTION_CONSTRAINTS } from './schema.js';

const VALID_ACTION_VALUES = Object.values(ALLOWED_ACTIONS);

export class ActionValidator {
    static parseJson(rawOutput) {
        if (!rawOutput || typeof rawOutput !== 'string') {
            throw new Error('Empty or invalid output received from model.');
        }

        let cleaned = rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }

        try {
            return JSON.parse(cleaned);
        } catch (err) {
            throw new Error(`Failed to parse action JSON: ${err.message}. Raw: "${rawOutput.substring(0, 80)}..."`);
        }
    }

    static validate(action) {
        if (!action || typeof action !== 'object' || Array.isArray(action)) {
            return { isValid: false, error: 'Action payload must be a JSON object.' };
        }

        const actionType = String(action.action || '').toLowerCase().trim();

        if (!VALID_ACTION_VALUES.includes(actionType)) {
            return {
                isValid: false,
                error: `Unknown action type "${action.action}". Allowed: ${VALID_ACTION_VALUES.join(', ')}`
            };
        }

        action.action = actionType;

        if (action.thought && typeof action.thought === 'string') {
            action.thought = action.thought.slice(0, ACTION_CONSTRAINTS.MAX_THOUGHT_LENGTH);
        }

        if (action.target && typeof action.target === 'string') {
            action.target = action.target.slice(0, ACTION_CONSTRAINTS.MAX_TARGET_LENGTH);
        }

        switch (actionType) {
            case ALLOWED_ACTIONS.NEW_TAB: {
                if (action.url === null) {
                    delete action.url;
                } else if (action.url !== undefined && typeof action.url !== 'string') {
                    action.url = String(action.url);
                }

                if (action.url) {
                    action.url = action.url.trim();
                    if (!/^https?:\/\//i.test(action.url) && !action.url.startsWith('about:')) {
                        action.url = 'https://' + action.url;
                    }
                }
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.SWITCH_TAB: {
                if (action.index !== undefined && (typeof action.index !== 'number' || !Number.isInteger(action.index))) {
                    return { isValid: false, error: '"switch_tab" requires "index" to be an integer if provided.' };
                }
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.CLOSE_TAB:
            case ALLOWED_ACTIONS.HISTORY_BACK:
            case ALLOWED_ACTIONS.HISTORY_FORWARD: {
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.ANSWER: {
                if (!action.message || typeof action.message !== 'string' || action.message.trim().length === 0) {
                    return { isValid: false, error: '"answer" action requires a non-empty "message" string.' };
                }
                action.message = action.message.trim();
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.FINISH: {
                action.message = typeof action.message === 'string' ? action.message.trim() : 'Task complete.';
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.CLICK:
            case ALLOWED_ACTIONS.HOVER: {
                const hasValidIndex = typeof action.index === 'number' && Number.isInteger(action.index) && action.index > 0;
                const hasValidTarget = typeof action.target === 'string' && action.target.trim().length > 0;

                if (!hasValidIndex && !hasValidTarget) {
                    return {
                        isValid: false,
                        error: `"${actionType}" requires either a positive integer "index" or a non-empty "target" string.`
                    };
                }
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.TYPE: {
                const hasValidIndex = typeof action.index === 'number' && Number.isInteger(action.index) && action.index > 0;
                const hasValidTarget = typeof action.target === 'string' && action.target.trim().length > 0;

                if (!hasValidIndex && !hasValidTarget) {
                    return {
                        isValid: false,
                        error: '"type" requires either a positive integer "index" or a non-empty "target" string.'
                    };
                }

                if (action.value !== undefined && action.text === undefined) {
                    action.text = String(action.value);
                }

                if (typeof action.text !== 'string') {
                    action.text = '';
                }

                action.text = action.text.slice(0, ACTION_CONSTRAINTS.MAX_INPUT_TEXT_LENGTH);
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.SELECT: {
                const hasValidIndex = typeof action.index === 'number' && Number.isInteger(action.index) && action.index > 0;
                const hasValidTarget = typeof action.target === 'string' && action.target.trim().length > 0;

                if (!hasValidIndex && !hasValidTarget) {
                    return {
                        isValid: false,
                        error: '"select" requires either a positive integer "index" or a non-empty "target" string.'
                    };
                }

                const selectVal = action.value !== undefined ? action.value : action.text;
                if (selectVal === undefined || selectVal === null || String(selectVal).trim().length === 0) {
                    return { isValid: false, error: '"select" requires an option "value" or "text" to select.' };
                }

                action.value = String(selectVal).trim();
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.PRESS_KEY: {
                if (!action.key || typeof action.key !== 'string') {
                    return { isValid: false, error: '"press_key" requires a valid "key" string.' };
                }

                const matchedKey = ALLOWED_KEYS.find(
                    (k) => k.toLowerCase() === action.key.trim().toLowerCase()
                );

                if (!matchedKey) {
                    return {
                        isValid: false,
                        error: `Unsupported key "${action.key}". Allowed: ${ALLOWED_KEYS.join(', ')}`
                    };
                }

                action.key = matchedKey;
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.SCROLL: {
                const direction = String(action.direction || '').toLowerCase().trim();
                action.direction = SCROLL_DIRECTIONS.includes(direction) ? direction : 'down';

                const parsedAmount = parseInt(action.amount, 10);
                if (isNaN(parsedAmount)) {
                    action.amount = 400;
                } else {
                    action.amount = Math.min(
                        Math.max(parsedAmount, ACTION_CONSTRAINTS.MIN_SCROLL),
                        ACTION_CONSTRAINTS.MAX_SCROLL
                    );
                }
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.WAIT: {
                const parsedDuration = parseInt(action.duration, 10);
                if (isNaN(parsedDuration)) {
                    action.duration = 1000;
                } else {
                    action.duration = Math.min(
                        Math.max(parsedDuration, ACTION_CONSTRAINTS.MIN_WAIT_MS),
                        ACTION_CONSTRAINTS.MAX_WAIT_MS
                    );
                }
                return { isValid: true, action };
            }

            case ALLOWED_ACTIONS.NAVIGATE: {
                if (action.path === null) {
                    delete action.path;
                } else if (action.path !== undefined && typeof action.path !== 'string') {
                    action.path = String(action.path);
                }

                if (!action.path || action.path.trim().length === 0) {
                    return { isValid: false, error: '"navigate" requires a non-empty "path" or URL string.' };
                }

                action.path = action.path.trim();

                if (!/^https?:\/\//i.test(action.path) && !action.path.startsWith('about:')) {
                    action.path = 'https://' + action.path;
                }
                return { isValid: true, action };
            }

            default:
                return { isValid: false, error: `Unhandled action: ${action.action}` };
        }
    }
}
