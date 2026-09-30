import { BrowserAPI } from './browser/api.js';
import { ConfigManager } from './config.js';
import { OpenWebUIClient } from './browser/openwebui.js';
import { ActionValidator } from './agent/validator.js';
import { TabCapture } from './browser/capture.js';
import { AutofillProfileManager, EMPTY_PROFILE } from './privacy/profile.js';

if (EMPTY_PROFILE && typeof EMPTY_PROFILE.password === 'undefined') {
    EMPTY_PROFILE.password = '';
}

const viewMain = document.getElementById('viewMain');
const viewSettings = document.getElementById('viewSettings');
const viewAutofill = document.getElementById('viewAutofill');

const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnOpenAutofill = document.getElementById('btnOpenAutofill');
const btnCloseAutofill = document.getElementById('btnCloseAutofill');
const btnDictate = document.getElementById('btnDictate');

const pageDomainEl = document.getElementById('pageDomain');
const userInstructionEl = document.getElementById('userInstruction');
const aiAnswerCard = document.getElementById('aiAnswerCard');
const aiAnswerContent = document.getElementById('aiAnswerContent');
const btnCloseAnswer = document.getElementById('btnCloseAnswer');
const activitySpinner = document.getElementById('activitySpinner');
const activityStepCounter = document.getElementById('activityStepCounter');
const activityCurrentStep = document.getElementById('activityCurrentStep');
const btnToggleDetails = document.getElementById('btnToggleDetails');
const activityDetails = document.getElementById('activityDetails');
const actionHistoryList = document.getElementById('actionHistoryList');
const actionPreview = document.getElementById('actionPreview');
const actionBadge = document.getElementById('actionBadge');
const actionText = document.getElementById('actionText');
const errorBanner = document.getElementById('errorMessage');

const btnSubmit = document.getElementById('btnSubmit');
const btnStop = document.getElementById('btnStop');

const autofillForm = document.getElementById('autofillForm');
const profileSelector = document.getElementById('profileSelector');
const btnNewProfile = document.getElementById('btnNewProfile');
const btnDeleteProfile = document.getElementById('btnDeleteProfile');
const afProfileName = document.getElementById('afProfileName');
const afUsername = document.getElementById('afUsername');
const afPassword = document.getElementById('afPassword');
const afFirstName = document.getElementById('afFirstName');
const afMiddleName = document.getElementById('afMiddleName');
const afLastName = document.getElementById('afLastName');
const afEmail = document.getElementById('afEmail');
const afPhone = document.getElementById('afPhone');
const afAddress1 = document.getElementById('afAddress1');
const afCity = document.getElementById('afCity');
const afState = document.getElementById('afState');
const afPostalCode = document.getElementById('afPostalCode');
const afCountry = document.getElementById('afCountry');
const autofillStatus = document.getElementById('autofillStatus');

const settingsForm = document.getElementById('settingsForm');
const settingTheme = document.getElementById('settingTheme');
const settingMaxSteps = document.getElementById('settingMaxSteps');
const serverUrlInput = document.getElementById('serverUrl');
const apiKeyInput = document.getElementById('apiKey');
const modelInput = document.getElementById('model');
const settingsStatus = document.getElementById('settingsStatus');
const btnTestConfig = document.getElementById('btnTestConfig');
const btnRefreshModels = document.getElementById('btnRefreshModels');
const viewSlider = document.getElementById('viewSlider');

let isAgentRunning = false;
let shouldStopAgent = false;
let currentLoadedProfileId = '';
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioContext = null;
let vadInterval = null;

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
}

function openSettingsView() {
    clearError();
    loadSettingsIntoForm();
    viewSlider.setAttribute('data-active-view', 'settings');
}

function closeSettingsView() {
    viewSlider.setAttribute('data-active-view', 'main');
}

function openAutofillView() {
    clearError();
    loadAutofillProfilesUI();
    viewSlider.setAttribute('data-active-view', 'autofill');
}

function closeAutofillView() {
    viewSlider.setAttribute('data-active-view', 'main');
}

function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
    activitySpinner.classList.add('hidden');
}

function clearError() {
    errorBanner.textContent = '';
    errorBanner.classList.add('hidden');
}

function addHistoryEntry(step, text) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.textContent = `${step}.${text}`;
    actionHistoryList.appendChild(item);
    actionHistoryList.scrollTop = actionHistoryList.scrollHeight;
}

function getMessage(key, substitutions = null, fallback = '') {
    if (typeof substitutions === 'string') {
        fallback = substitutions;
        substitutions = null;
    }
    const api = typeof browser !== 'undefined' ? browser : chrome;
    if (api && api.i18n) {
        const msg = api.i18n.getMessage(key, substitutions);
        if (msg) return msg;
    }
    return fallback;
}

function localizeHtml() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        const translated = getMessage(key);
        if (translated) el.textContent = translated;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translated = getMessage(key);
        if (translated) el.setAttribute('placeholder', translated);
    });

    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title');
        const translated = getMessage(key);
        if (translated) el.setAttribute('title', translated);
    });
}

function renderMarkdownSafely(text, targetContainer) {
    targetContainer.replaceChildren();
    if (!text || typeof text !== 'string') return;

    function appendFormattedInline(parent, rawText) {
        const inlineRegex = /(\*\*|__)(.*?)\1|(\*)(.*?)\3|(`)(.*?)\5/g;
        let lastIndex = 0;
        let match;

        while ((match = inlineRegex.exec(rawText)) !== null) {
            if (match.index > lastIndex) {
                parent.appendChild(document.createTextNode(rawText.substring(lastIndex, match.index)));
            }

            if (match[2] !== undefined) {
                const strong = document.createElement('strong');
                strong.textContent = match[2];
                parent.appendChild(strong);
            } else if (match[4] !== undefined) {
                const em = document.createElement('em');
                em.textContent = match[4];
                parent.appendChild(em);
            } else if (match[6] !== undefined) {
                const code = document.createElement('code');
                code.textContent = match[6];
                parent.appendChild(code);
            }

            lastIndex = inlineRegex.lastIndex;
        }

        if (lastIndex < rawText.length) {
            parent.appendChild(document.createTextNode(rawText.substring(lastIndex)));
        }
    }

    const lines = text.split('\n');
    let currentList = null;

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();

        if (!trimmed) {
            currentList = null;
            continue;
        }

        if (/^[-*]\s+/.test(trimmed)) {
            if (!currentList) {
                currentList = document.createElement('ul');
                targetContainer.appendChild(currentList);
            }
            const li = document.createElement('li');
            appendFormattedInline(li, trimmed.replace(/^[-*]\s+/, ''));
            currentList.appendChild(li);
            continue;
        }

        currentList = null;

        const p = document.createElement('p');
        appendFormattedInline(p, trimmed);
        targetContainer.appendChild(p);
    }
}

function inPageScanner() {
    const selector = [
        'button',
        'a[href]',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '[role="link"]',
        '[role="textbox"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="combobox"]',
        '[role="option"]',
        '[contenteditable="true"]'
    ].join(', ');

    const sensitiveKeywords = ['password', 'passwd', 'secret', 'ssn', 'card', 'token', 'auth', 'cvv', 'cvc'];
    const detections = [];

    const inputs = document.querySelectorAll('input, textarea');
    for (const el of inputs) {
        const type = String(el.getAttribute('type') || '').toLowerCase();
        const name = String(el.getAttribute('name') || '').toLowerCase();
        const id = typeof el.id === 'string' ? el.id.toLowerCase() : '';

        const isSensitive = type === 'password' || sensitiveKeywords.some((k) => name.includes(k) || id.includes(k));
        if (isSensitive) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                detections.push({
                    type: 'sensitive_input',
                    bounds: {
                        x: Math.round(rect.left),
                        y: Math.round(rect.top),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    }
                });
            }
        }
    }

    const elements = [];
    const candidates = Array.from(document.querySelectorAll(selector));

    let index = 1;
    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') <= 0.05) {
            continue;
        }

        const tag = String(el.tagName || '').toLowerCase();
        const inputType = String(el.getAttribute('type') || '').toLowerCase();

        if (tag === 'input' && inputType === 'file') {
            el.setAttribute('data-kivo-index', String(index));
            elements.push({
                index: Number(index),
                type: 'file_upload',
                role: 'file_attachment',
                label: 'File Upload (Attachment field - manual only)',
                text: '[FILE INPUT]',
                id: typeof el.id === 'string' ? el.id : null
            });
            index++;
            continue;
        }

        el.setAttribute('data-kivo-index', String(index));

        const role = String(el.getAttribute('role') || tag);
        const isPassword = inputType === 'password';
        const isContentEditable = el.getAttribute('contenteditable') === 'true';

        let safeText = '';
        if (isPassword) {
            safeText = (el.value && el.value.length > 0) ? '[FILLED PASSWORD]' : '[REDACTED PASSWORD]';
        } else if (tag === 'button' || tag === 'a') {
            safeText = String(el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 50);
        } else if (isContentEditable) {
            safeText = String(el.textContent || '').trim().length > 0 ? '[FILLED]' : '';
        } else if (el.value && el.value.trim().length > 0) {
            safeText = '[FILLED]';
        }

        const label = String(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '');
        const idString = typeof el.id === 'string' ? el.id : '';

        elements.push({
            index: Number(index),
            type: isContentEditable ? 'editable_textbox' : tag,
            role: role,
            label: label.substring(0, 50),
            text: safeText,
            id: idString || null
        });

        index++;
    }

    const payload = {
        title: String(document.title || ''),
        url: String(window.location.origin + window.location.pathname),
        viewport: {
            width: Number(window.innerWidth || 1280),
            height: Number(window.innerHeight || 800)
        },
        sensitiveRegions: detections,
        elements: elements.slice(0, 75)
    };

    return JSON.parse(JSON.stringify(payload));
}

function inPageExecutor(action) {
    if (!action || !action.action) return { success: false, reason: 'Invalid action payload.' };

    function getElement() {
        if (typeof action.index === 'number') {
            const indexed = document.querySelector(`[data-kivo-index="${action.index}"]`);
            if (indexed) return indexed;
        }

        const target = String(action.target || '').toLowerCase().trim();
        const all = Array.from(document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="link"], [role="textbox"], [contenteditable="true"]'));
        return all.find((el) => {
            const text = String(el.textContent || '').toLowerCase().trim();
            const aria = String(el.getAttribute('aria-label') || '').toLowerCase().trim();
            const id = typeof el.id === 'string' ? el.id.toLowerCase().trim() : '';
            return text === target || aria === target || id === target || text.includes(target);
        });
    }

    try {
        switch (action.action) {
            case 'click': {
                let el = getElement();
                if (!el) return { success: false, reason: `Target "${action.target || action.index}" not found.` };

                const clickableParent = el.closest('button, a, [role="button"]');
                if (clickableParent) el = clickableParent;

                try { el.focus(); } catch (_) {}
                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                el.click();
                return { success: true, reason: `Clicked "${action.target || action.index}".` };
            }

            case 'hover': {
                const el = getElement();
                if (!el) return { success: false, reason: `Target "${action.target || action.index}" not found.` };
                const opts = { bubbles: true, cancelable: true };
                el.dispatchEvent(new MouseEvent('mouseenter', opts));
                el.dispatchEvent(new MouseEvent('mouseover', opts));
                el.dispatchEvent(new MouseEvent('mousemove', opts));
                return { success: true, reason: `Hovered over "${action.target || action.index}".` };
            }

            case 'type': {
                const el = getElement();
                if (!el) return { success: false, reason: `Input target "${action.target || action.index}" not found.` };

                const tag = el.tagName.toLowerCase();
                if (tag === 'input' && (el.getAttribute('type') || '').toLowerCase() === 'file') {
                    return { success: false, reason: 'File inputs cannot be typed into via script.' };
                }

                try { el.focus(); } catch (_) {}
                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                el.click();

                const textToType = String(action.text || '');
                const newVal = action.clearFirst ? textToType : (el.value || '') + textToType;

                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

                if (tag === 'textarea' && nativeTextAreaValueSetter) {
                    nativeTextAreaValueSetter.call(el, newVal);
                } else if (tag === 'input' && nativeInputValueSetter) {
                    nativeInputValueSetter.call(el, newVal);
                } else {
                    el.value = newVal;
                }

                if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
                    el.innerText = newVal;
                }

                el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

                if (textToType.length > 0) {
                    const lastChar = textToType.slice(-1);
                    el.dispatchEvent(new KeyboardEvent('keydown', { key: lastChar, bubbles: true, composed: true }));
                    el.dispatchEvent(new KeyboardEvent('keypress', { key: lastChar, bubbles: true, composed: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key: lastChar, bubbles: true, composed: true }));
                }

                try { el.blur(); } catch (_) {}

                return { success: true, reason: `Typed into field "${action.target || action.index}".` };
            }

            case 'select': {
                const el = getElement();
                if (!el || el.tagName.toLowerCase() !== 'select') return { success: false, reason: 'Dropdown element not found.' };
                const valLower = String(action.value || '').toLowerCase().trim();
                const option = Array.from(el.options).find(
                    (o) => o.value.toLowerCase() === valLower || o.text.toLowerCase().includes(valLower)
                );
                if (!option) return { success: false, reason: `Option "${action.value}" not found in dropdown.` };
                el.value = option.value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, reason: `Selected "${option.text}".` };
            }

            case 'press_key': {
                const target = document.activeElement || document.body;
                const opts = { key: String(action.key), code: String(action.key), bubbles: true, cancelable: true };
                target.dispatchEvent(new KeyboardEvent('keydown', opts));
                target.dispatchEvent(new KeyboardEvent('keyup', opts));
                if (action.key === 'Enter' && target.form) {
                    if (typeof target.form.requestSubmit === 'function') target.form.requestSubmit();
                    else target.form.submit();
                }
                return { success: true, reason: `Pressed key [${action.key}].` };
            }

            case 'scroll': {
                const delta = action.direction === 'down' ? Number(action.amount) : -Number(action.amount);
                window.scrollBy({ top: delta, behavior: 'smooth' });
                return { success: true, reason: `Scrolled ${action.direction} ${action.amount}px.` };
            }

            case 'wait': {
                return { success: true, reason: `Waited ${action.duration}ms.` };
            }

            case 'history_back': {
                window.history.back();
                return { success: true, reason: `Navigated back one page.` };
            }

            case 'history_forward': {
                window.history.forward();
                return { success: true, reason: `Navigated forward one page.` };
            }

            case 'answer': {
                return { success: true, reason: String(action.message) };
            }

            case 'finish': {
                return { success: true, reason: String(action.message || 'Task complete.') };
            }

            default:
                return { success: false, reason: `Unknown action: ${action.action}` };
        }
    } catch (err) {
        return { success: false, reason: `In-page execution error: ${err.message}` };
    }
}

function setRecordingState(recording) {
    isRecording = recording;
    const btn = document.getElementById('btnDictate');
    const label = document.getElementById('dictateLabel');
    if (!btn) return;

    if (recording) {
        btn.classList.add('recording');
        btn.title = getMessage('titleListening', 'Listening... (Will auto-submit when you stop talking)');
        if (label) label.textContent = getMessage('lblListening', 'Listening... (Speak now)');
    } else {
        btn.classList.remove('recording');
        btn.title = getMessage('titleDictate', 'Dictate prompt');
        if (label) label.textContent = getMessage('btnDictate', 'Dictate Prompt');
    }
}

function setupSilenceDetection(stream, onSilenceDetected) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let speechStarted = false;
    let silenceStart = null;

    const SPEECH_THRESHOLD = 14;
    const SILENCE_DURATION_MS = 1500;
    const MAX_WAIT_TO_SPEAK_MS = 8000;
    const startTime = Date.now();

    vadInterval = setInterval(() => {
        if (!isRecording) {
            cleanupVAD();
            return;
        }

        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const averageVolume = sum / dataArray.length;

        if (averageVolume > SPEECH_THRESHOLD) {
            speechStarted = true;
            silenceStart = null;
        } else {
            if (speechStarted) {
                if (!silenceStart) {
                    silenceStart = Date.now();
                } else if (Date.now() - silenceStart > SILENCE_DURATION_MS) {
                    cleanupVAD();
                    onSilenceDetected();
                }
            } else if (Date.now() - startTime > MAX_WAIT_TO_SPEAK_MS) {
                cleanupVAD();
                onSilenceDetected();
            }
        }
    }, 100);
}

function cleanupVAD() {
    if (vadInterval) {
        clearInterval(vadInterval);
        vadInterval = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
        audioContext = null;
    }
}

async function toggleDictation() {
    clearError();

    if (isRecording) {
        cleanupVAD();
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];

        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');

        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            cleanupVAD();
            stream.getTracks().forEach((t) => t.stop());
            setRecordingState(false);

            if (audioChunks.length === 0) return;

            activityCurrentStep.textContent = getMessage('statusTranscribing', 'Transcribing voice...');
            activitySpinner.classList.remove('hidden');

            try {
                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                const config = await ConfigManager.getConfig();
                const client = new OpenWebUIClient(config);

                const transcribedText = await client.transcribeAudio(audioBlob);

                if (transcribedText && transcribedText.trim().length > 0) {
                    userInstructionEl.value = transcribedText;
                    activityCurrentStep.textContent = getMessage('statusRecognized', [transcribedText], `Recognized: "${transcribedText}"`);

                    setTimeout(() => {
                        runUnifiedLoop();
                    }, 400);
                } else {
                    activityCurrentStep.textContent = getMessage('statusNoSpeech', 'No clear speech heard.');
                    activitySpinner.classList.add('hidden');
                }
            } catch (err) {
                showError(getMessage('errDictation', [err.message], `Dictation failed: ${err.message}`));
                activitySpinner.classList.add('hidden');
            }
        };

        mediaRecorder.start();
        setRecordingState(true);
        activityCurrentStep.textContent = getMessage('statusListeningWait', 'Listening... Speak your command.');

        setupSilenceDetection(stream, () => {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                activityCurrentStep.textContent = getMessage('statusProcessingSpeech', 'Processing speech...');
                mediaRecorder.stop();
            }
        });

    } catch (err) {
        cleanupVAD();
        setRecordingState(false);
        if (err.name === 'NotAllowedError' || err.message.includes('not allowed')) {
            showError(getMessage('errMicRequired', 'Microphone permission required. Opening setup tab...'));
            const permUrl = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('permission.html');
            (typeof browser !== 'undefined' ? browser : chrome).tabs.create({ url: permUrl });
        } else {
            showError(getMessage('errMicError', [err.message], `Microphone error: ${err.message}`));
        }
    }
}

async function runUnifiedLoop() {
    clearError();
    aiAnswerCard.classList.add('hidden');
    actionHistoryList.innerHTML = '';

    const instruction = userInstructionEl.value.trim();
    if (!instruction) {
        showError(getMessage('errNoInput', 'Please enter a goal or ask a question.'));
        return;
    }

    const config = await ConfigManager.getConfig();
    const maxSteps = config.maxSteps || 20;
    const client = new OpenWebUIClient(config);
    const profile = await AutofillProfileManager.getActiveProfile();

    isAgentRunning = true;
    shouldStopAgent = false;
    btnSubmit.classList.add('hidden');
    btnStop.classList.remove('hidden');
    activitySpinner.classList.remove('hidden');
    activityStepCounter.classList.remove('hidden');

    const history = [];

    try {
        for (let step = 1; step <= maxSteps; step++) {
            if (shouldStopAgent) {
                activityCurrentStep.textContent = getMessage('statusStopped', 'Stopped by user.');
                break;
            }

            activityStepCounter.textContent = getMessage('stepCounter', [step.toString(), maxSteps.toString()], `Step ${step}/${maxSteps}`);
            activityCurrentStep.textContent = getMessage('statusInspecting', 'Inspecting page state...');

            const activeTab = await BrowserAPI.getActiveTab();
            if (!activeTab?.id) throw new Error('No active browser tab found.');

            const scanResult = await BrowserAPI.executeScript(activeTab.id, inPageScanner);
            if (!scanResult) throw new Error('DOM inspection failed. Reload page.');

            activityCurrentStep.textContent = getMessage('statusRedacting', 'Redacting visual PII...');
            const redactedScreenshot = await TabCapture.captureAndRedact(scanResult.sensitiveRegions, activeTab.windowId);

            activityCurrentStep.textContent = getMessage('statusDeliberating', 'Deliberating...');
            const rawAiOutput = await client.queryVisionAgent({
                sanitizedScreenshot: redactedScreenshot,
                sanitizedDom: scanResult,
                userInstruction: instruction,
                history,
                currentStep: step,
                maxSteps
            });

            const parsedJson = ActionValidator.parseJson(rawAiOutput);
            const validation = ActionValidator.validate(parsedJson);
            if (!validation.isValid) {
                throw new Error(`AI generated invalid action: ${validation.error}`);
            }

            const validAction = validation.action;

            if (profile) {
                const replaceTokens = (str) => {
                    if (typeof str !== 'string') return str;
                    return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
                        return typeof profile[key] !== 'undefined' ? String(profile[key]) : '';
                    });
                };
                if (validAction.text) validAction.text = replaceTokens(validAction.text);
                if (validAction.value) validAction.value = replaceTokens(validAction.value);
            }

            if (validAction.action === 'answer') {
                renderMarkdownSafely(validAction.message, aiAnswerContent);
                aiAnswerCard.classList.remove('hidden');
                addHistoryEntry(step, `Answer: ${validAction.message.substring(0, 50)}...`);
                activityCurrentStep.textContent = getMessage('statusExplanation', 'Explanation provided.');
                break;
            }

            actionPreview.classList.remove('hidden');
            actionBadge.textContent = validAction.action;
            actionText.textContent = validAction.thought
                ? validAction.thought
                : (validAction.text || validAction.target || validAction.value || validAction.message || `Index [${validAction.index}]`);

            if (validAction.action === 'finish') {
                addHistoryEntry(step, `Complete: ${validAction.message}`);
                activityCurrentStep.textContent = validAction.message || getMessage('statusTaskFinished', 'Task finished!');
                break;
            }

            const api = typeof browser !== 'undefined' ? browser : chrome;

            const waitForTabLoad = (tabId) => {
                return new Promise(resolve => {
                    const listener = (tId, info) => {
                        if (tId === tabId && info.status === 'complete') {
                            api.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    };
                    api.tabs.onUpdated.addListener(listener);
                    setTimeout(() => {
                        api.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }, 6000);
                });
            };

            if (validAction.action === 'navigate') {
                activityCurrentStep.textContent = getMessage('statusExecuting', ['navigate'], `Navigating to ${validAction.path}...`);
                await api.tabs.update(activeTab.id, { url: validAction.path });
                addHistoryEntry(step, `Navigated to ${validAction.path}`);
                history.push(`navigate: Success`);
                await waitForTabLoad(activeTab.id);
                continue;
            }

            if (validAction.action === 'new_tab') {
                activityCurrentStep.textContent = getMessage('statusExecuting', ['new_tab'], 'Opening new tab...');
                const targetUrl = validAction.url || 'https://www.duckduckgo.com';
                const newTab = await api.tabs.create({ url: targetUrl });
                addHistoryEntry(step, `Opened new tab: ${targetUrl}`);
                history.push(`new_tab: Success`);
                await waitForTabLoad(newTab.id);
                continue;
            }

            if (validAction.action === 'close_tab') {
                activityCurrentStep.textContent = getMessage('statusExecuting', ['close_tab'], 'Closing tab...');
                await api.tabs.remove(activeTab.id);
                addHistoryEntry(step, `Closed current tab.`);
                history.push(`close_tab: Success`);
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            if (validAction.action === 'switch_tab') {
                activityCurrentStep.textContent = getMessage('statusExecuting', ['switch_tab'], 'Switching tab...');
                const tabs = await api.tabs.query({ currentWindow: true });
                const targetIndex = typeof validAction.index === 'number' ? validAction.index : (activeTab.index + 1) % tabs.length;
                const targetTab = tabs.find(t => t.index === targetIndex) || tabs[0];

                await api.tabs.update(targetTab.id, { active: true });
                addHistoryEntry(step, `Switched to tab ${targetIndex}.`);
                history.push(`switch_tab: Success`);
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            activityCurrentStep.textContent = getMessage('statusExecuting', [validAction.action], `Executing: ${validAction.action}...`);
            const execResult = await BrowserAPI.executeScript(activeTab.id, inPageExecutor, [validAction]);

            if (!execResult || !execResult.success) {
                throw new Error(execResult ? execResult.reason : 'Execution failed in tab.');
            }

            addHistoryEntry(step, execResult.reason);
            history.push(`${validAction.action}: ${execResult.reason}`);

            await new Promise((r) => setTimeout(r, 800));
        }
    } catch (err) {
        showError(err.message);
    } finally {
        isAgentRunning = false;
        btnSubmit.classList.remove('hidden');
        btnStop.classList.add('hidden');
        activitySpinner.classList.add('hidden');
    }
}

async function loadAutofillProfilesUI() {
    try {
        const { profiles, activeProfileId } = await AutofillProfileManager.getAllData();
        profileSelector.replaceChildren();

        for (const p of profiles) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.profileName + (p.id === activeProfileId ? getMessage('lblActiveProfile', ' (Active)') : '');
            if (p.id === activeProfileId) opt.selected = true;
            profileSelector.appendChild(opt);
        }

        const currentProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
        populateProfileFields(currentProfile);
    } catch (err) {
        showAutofillStatus('error', err.message);
    }
}

function populateProfileFields(p) {
    currentLoadedProfileId = p.id;
    afProfileName.value = p.profileName || '';
    afUsername.value = p.username || '';
    afPassword.value = p.password || '';
    afFirstName.value = p.firstName || '';
    afMiddleName.value = p.middleName || '';
    afLastName.value = p.lastName || '';
    afEmail.value = p.email || '';
    afPhone.value = p.phone || '';
    afAddress1.value = p.address1 || '';
    afCity.value = p.city || '';
    afState.value = p.state || '';
    afPostalCode.value = p.postalCode || '';
    afCountry.value = p.country || '';
}

function showAutofillStatus(type, msg) {
    autofillStatus.className = `status-banner ${type}`;
    autofillStatus.textContent = msg;
    autofillStatus.classList.remove('hidden');
}

async function saveCurrentProfile(e) {
    if (e) e.preventDefault();
    autofillStatus.classList.add('hidden');

    try {
        const profileToSave = {
            id: currentLoadedProfileId || `profile_${Date.now()}`,
            profileName: afProfileName.value.trim() || 'My Profile',
            username: afUsername.value.trim(),
            password: afPassword.value,
            firstName: afFirstName.value.trim(),
            middleName: afMiddleName.value.trim(),
            lastName: afLastName.value.trim(),
            email: afEmail.value.trim(),
            phone: afPhone.value.trim(),
            address1: afAddress1.value.trim(),
            city: afCity.value.trim(),
            state: afState.value.trim(),
            postalCode: afPostalCode.value.trim(),
            country: afCountry.value.trim()
        };

        await AutofillProfileManager.saveProfile(profileToSave);
        await AutofillProfileManager.setActiveProfileId(profileToSave.id);
        showAutofillStatus('success', getMessage('msgProfileSaved', 'Profile saved.'));
        await loadAutofillProfilesUI();
        setTimeout(() => closeAutofillView(), 500);
    } catch (err) {
        showAutofillStatus('error', getMessage('errSaveFailed', [err.message], `Save failed: ${err.message}`));
    }
}

async function handleProfileSelectionChange() {
    const selectedId = profileSelector.value;
    const { profiles } = await AutofillProfileManager.getAllData();
    const profile = profiles.find((p) => p.id === selectedId);
    if (profile) {
        await AutofillProfileManager.setActiveProfileId(profile.id);
        populateProfileFields(profile);
        await loadAutofillProfilesUI();
    }
}

function createNewProfile() {
    const newId = `profile_${Date.now()}`;
    populateProfileFields({
        ...EMPTY_PROFILE,
        id: newId,
        profileName: getMessage('lblNewProfileName', 'New Profile')
    });
    afProfileName.focus();
    showAutofillStatus('success', getMessage('msgEnterProfileDetails', 'Enter profile details and click Save.'));
}

async function deleteCurrentProfile() {
    if (!currentLoadedProfileId) return;
    const { profiles } = await AutofillProfileManager.getAllData();
    if (profiles.length <= 1) {
        showAutofillStatus('error', getMessage('errDeleteOnlyProfile', 'Cannot delete the only remaining profile.'));
        return;
    }

    try {
        await AutofillProfileManager.deleteProfile(currentLoadedProfileId);
        showAutofillStatus('success', getMessage('msgProfileRemoved', 'Profile removed.'));
        await loadAutofillProfilesUI();
    } catch (err) {
        showAutofillStatus('error', getMessage('errDeleteFailed', [err.message], `Delete failed: ${err.message}`));
    }
}

async function loadSettingsIntoForm() {
    try {
        const config = await ConfigManager.getConfig();
        serverUrlInput.value = config.serverUrl || '';
        apiKeyInput.value = config.apiKey || '';
        modelInput.value = config.model || '';
        settingTheme.value = config.theme || 'graphite-dark';
        settingMaxSteps.value = config.maxSteps || 20;
    } catch (err) {
        showSettingsStatus('error', err.message);
    }
}

function showSettingsStatus(type, msg) {
    settingsStatus.className = `status-banner ${type}`;
    settingsStatus.textContent = msg;
    settingsStatus.classList.remove('hidden');
}

async function saveSettings(e) {
    if (e) e.preventDefault();
    settingsStatus.classList.add('hidden');

    try {
        const parsedSteps = parseInt(settingMaxSteps.value, 10);
        const maxSteps = !isNaN(parsedSteps) ? Math.min(Math.max(parsedSteps, 1), 999) : 20;

        await ConfigManager.saveConfig({
            serverUrl: serverUrlInput.value,
            apiKey: apiKeyInput.value,
            model: modelInput.value,
            theme: settingTheme.value,
            maxSteps: maxSteps,
            maxTokens: 3000
        });
        applyTheme(settingTheme.value);
        showSettingsStatus('success', getMessage('msgSettingsSaved', 'Settings saved.'));
        setTimeout(() => closeSettingsView(), 500);
    } catch (err) {
        showSettingsStatus('error', getMessage('errSaveFailed', [err.message], `Save failed: ${err.message}`));
    }
}

async function testConnection() {
    settingsStatus.classList.add('hidden');
    btnTestConfig.disabled = true;

    try {
        const client = new OpenWebUIClient({
            serverUrl: serverUrlInput.value,
            apiKey: apiKeyInput.value,
            model: modelInput.value
        });
        const res = await client.testConnection();
        showSettingsStatus(res.success ? 'success' : 'error', res.message);
    } catch (err) {
        showSettingsStatus('error', err.message);
    } finally {
        btnTestConfig.disabled = false;
    }
}

async function refreshModels() {
    settingsStatus.classList.add('hidden');
    btnRefreshModels.disabled = true;

    try {
        const client = new OpenWebUIClient({
            serverUrl: serverUrlInput.value,
            apiKey: apiKeyInput.value
        });
        const models = await client.listModels();
        if (models.length > 0) {
            const vlModel = models.find((m) => m.toLowerCase().includes('vl'));
            modelInput.value = vlModel || models[0];
            showSettingsStatus('success', getMessage('msgModelsFound', [models.length.toString()], `Found ${models.length} model(s).`));
        } else {
            showSettingsStatus('error', getMessage('errNoModels', 'No models found.'));
        }
    } catch (err) {
        showSettingsStatus('error', err.message);
    } finally {
        btnRefreshModels.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    localizeHtml();
    viewSlider.setAttribute('data-active-view', 'main');
    const config = await ConfigManager.getConfig();
    applyTheme(config.theme);

    try {
        const tab = await BrowserAPI.getActiveTab();
        if (tab && tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome:')) {
            pageDomainEl.textContent = new URL(tab.url).hostname;
        } else {
            pageDomainEl.textContent = getMessage('statusReady', 'Ready');
        }
    } catch {
        pageDomainEl.textContent = getMessage('statusReady', 'Ready');
    }

    btnOpenSettings.addEventListener('click', openSettingsView);
    btnCloseSettings.addEventListener('click', closeSettingsView);
    btnOpenAutofill.addEventListener('click', openAutofillView);
    btnCloseAutofill.addEventListener('click', closeAutofillView);

    btnDictate.addEventListener('click', toggleDictation);

    if (btnSubmit) {
        btnSubmit.addEventListener('click', runUnifiedLoop);
    }

    if (btnStop) {
        btnStop.addEventListener('click', () => {
            shouldStopAgent = true;
        });
    }

    userInstructionEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            runUnifiedLoop();
        }
    });

    btnCloseAnswer.addEventListener('click', () => {
        aiAnswerCard.classList.add('hidden');
    });

    btnToggleDetails.addEventListener('click', () => {
        activityDetails.classList.toggle('collapsed');
        btnToggleDetails.textContent = activityDetails.classList.contains('collapsed')
            ? getMessage('btnSteps', 'Steps')
            : getMessage('btnHide', 'Hide');
    });

    profileSelector.addEventListener('change', handleProfileSelectionChange);
    btnNewProfile.addEventListener('click', createNewProfile);
    btnDeleteProfile.addEventListener('click', deleteCurrentProfile);
    autofillForm.addEventListener('submit', saveCurrentProfile);

    settingsForm.addEventListener('submit', saveSettings);
    btnTestConfig.addEventListener('click', testConnection);
    btnRefreshModels.addEventListener('click', refreshModels);
    settingTheme.addEventListener('change', (e) => applyTheme(e.target.value));
});
