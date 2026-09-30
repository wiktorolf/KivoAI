export const ALLOWED_ACTIONS = Object.freeze({
    CLICK: 'click',
    TYPE: 'type',
    SELECT: 'select',
    HOVER: 'hover',
    PRESS_KEY: 'press_key',
    SCROLL: 'scroll',
    WAIT: 'wait',
    NAVIGATE: 'navigate',
    HISTORY_BACK: 'history_back',
    HISTORY_FORWARD: 'history_forward',
    NEW_TAB: 'new_tab',
    SWITCH_TAB: 'switch_tab',
    CLOSE_TAB: 'close_tab',
    ANSWER: 'answer',
    FINISH: 'finish'
});

export const SCROLL_DIRECTIONS = Object.freeze(['up', 'down']);

export const ALLOWED_KEYS = Object.freeze([
    'Enter',
    'Tab',
    'Escape',
    'ArrowDown',
    'ArrowUp',
    'ArrowLeft',
    'ArrowRight',
    'Backspace'
]);

export const ACTION_CONSTRAINTS = Object.freeze({
    MIN_SCROLL: 50,
    MAX_SCROLL: 3000,
    MIN_WAIT_MS: 100,
    MAX_WAIT_MS: 10000,
    MAX_TARGET_LENGTH: 140,
    MAX_INPUT_TEXT_LENGTH: 1000,
    MAX_STEPS_DEFAULT: 20,
    MAX_THOUGHT_LENGTH: 1000
});
