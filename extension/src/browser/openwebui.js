import { AutofillProfileManager } from '../privacy/profile.js';

export class OpenWebUIClient {
    constructor(config) {
        this.serverUrl = (config.serverUrl || '').trim().replace(/\/+$/, '');
        this.apiKey = (config.apiKey || '').trim();
        this.model = (config.model || '').trim();
        this.maxTokens = config.maxTokens || 1024;
        this.temperature = config.temperature !== undefined ? config.temperature : 0.1;
        this.timeoutMs = config.timeoutMs || 45000;
    }

    async testConnection() {
        if (!this.serverUrl) throw new Error('Server URL is not configured.');
        const endpoint = `${this.serverUrl}/api/models`;
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);

        try {
            const res = await fetch(endpoint, { method: 'GET', headers, signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) return { success: true, message: 'Connected to Open WebUI successfully.' };
            return { success: false, message: `HTTP ${res.status}: Check URL and API Key.` };
        } catch (err) {
            clearTimeout(timer);
            throw new Error(err.name === 'AbortError' ? 'Connection timed out.' : 'Network connection failed.');
        }
    }

    async listModels() {
        if (!this.serverUrl) throw new Error('Server URL is not configured.');
        const endpoint = `${this.serverUrl}/api/models`;
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

        const res = await fetch(endpoint, { method: 'GET', headers });
        if (!res.ok) throw new Error(`HTTP ${res.status} retrieving models.`);
        const data = await res.json();
        const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        return list.map((m) => m.id || m.name).filter(Boolean);
    }

    static extractContent(data) {
        if (!data) return '';
        if (typeof data === 'string' && data.trim().length > 0) return data.trim();

        const choice = data.choices?.[0] || {};
        const msg = choice.message || choice.delta || {};

        if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
            return msg.content.trim();
        }

        if (Array.isArray(msg.content)) {
            const textPart = msg.content.find((p) => p.type === 'text' && p.text);
            if (textPart && textPart.text.trim().length > 0) return textPart.text.trim();
        }

        if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim().length > 0) {
            return msg.reasoning_content.trim();
        }

        if (typeof choice.text === 'string' && choice.text.trim().length > 0) {
            return choice.text.trim();
        }

        if (typeof data.response === 'string' && data.response.trim().length > 0) {
            return data.response.trim();
        }

        return '';
    }

    async transcribeAudio(audioBlob) {
        if (!this.serverUrl) throw new Error('Server URL is not configured.');

        const endpoint = `${this.serverUrl}/api/v1/audio/transcriptions`;
        const headers = {};
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('model', 'whisper-1');

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            let res = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: formData,
                signal: controller.signal
            });

            if (res.status === 404) {
                const altEndpoint = `${this.serverUrl}/api/audio/transcriptions`;
                res = await fetch(altEndpoint, {
                    method: 'POST',
                    headers,
                    body: formData,
                    signal: controller.signal
                });
            }

            clearTimeout(timer);

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`STT HTTP ${res.status}: ${errText.substring(0, 100)}`);
            }

            const data = await res.json();
            return (data.text || data.transcription || '').trim();
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') throw new Error('Speech transcription timed out.');
            throw err;
        }
    }

    async queryVisionAgent({ sanitizedScreenshot, sanitizedDom, userInstruction, history = [], currentStep = 1, maxSteps = 20 }) {
        if (!this.serverUrl) throw new Error('Server URL is not configured in Settings.');
        if (!this.model) throw new Error('Vision model is not selected.');

        const endpoint = `${this.serverUrl}/api/chat/completions`;
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

        const tokens = AutofillProfileManager.getAvailableTokens().join(', ');

        const systemPrompt = [
            'You are KivoAI, an autonomous web navigation and page assistant.',
            'Given the user prompt, page screenshot, and indexed UI elements, output ONE raw JSON response.',
            '',
            '### DECISION LOGIC (CHOOSE ONE MODE):',
            '1. INFORMATIONAL INQUIRIES / QUESTIONS:',
            '   If the user asks an informational question, asks to summarize, or requests an explanation (e.g., "What is this page?", "Explain these options", "What documents do I need?"):',
            '   -> Choose "action": "answer". Provide a clear, helpful Markdown explanation in "message". DO NOT trigger clicks or typing.',
            '2. OPERATIONAL GOALS / TASKS:',
            '   If the user provides an operational goal or task to perform on the page (e.g., "Sign in", "Fill shipping info", "Click search"):',
            '   -> Choose a DOM action ("click", "type", "select", "hover", "press_key", "scroll", "wait", "finish") to advance the goal.',
            '3. BROWSER NAVIGATION & TAB CONTROL:',
            '   - If the user says "open a new tab" OR "open a new page": Use "new_tab".',
            '   - If the user says "go to [website]" or "navigate to" (without saying "new"): Use "navigate" to change the current tab.',
            '   - To manage tabs/history: Use "switch_tab", "close_tab", "history_back", or "history_forward".',
            '',
            '### CRITICAL FORM & LOGIN RULES:',
            '1. DO NOT OVERWRITE FILLED FIELDS: If an input field already has text, shows "[FILLED]", or has user input, NEVER type into it unless explicitly asked to replace it.',
            '2. SUBMIT / SIGN-IN INTENT: If the user says "sign in", "log in", or "submit", and fields are already filled, DO NOT type. Directly CLICK the submit or sign-in button.',
            '3. AUTOFILL TEMPLATE TOKENS: When filling identity, contact, or address forms, use these symbolic placeholders (the browser replaces them locally with user data):',
            tokens,
            'Example: {"thought": "typing name", "action": "type", "index": 1, "text": "{{fullName}}"}',
            'Example: {"thought": "typing email", "action": "type", "index": 2, "text": "{{email}}"}',
            'Example: {"thought": "typing password", "action": "type", "index": 3, "text": "{{password}}"}',
            '4. INDEX ACCURACY: Always use the exact integer "index" from the elements list.',
            '',
            '### LANGUAGE RULE:',
            'Always output the JSON keys, action names ("click", "type", "answer", etc.), and token formats in English as defined in the schema.',
            'However, when using the "answer" action, write the "message" content in the same language that the user used in their prompt.',
            '',
            '### OUTPUT JSON FORMAT:',
            '{',
            '  "thought": "brief reasoning (1-2 sentences)",',
            '  "action": "answer" | "click" | "type" | "select" | "hover" | "press_key" | "scroll" | "wait" | "navigate" | "new_tab" | "switch_tab" | "close_tab" | "history_back" | "history_forward" | "finish",',
            '  "index": <integer index from list (for DOM actions) OR tab index (for switch_tab)>,',
            '  "text": "string to type (can include {{tokens}})",',
            '  "value": "string to select in dropdowns",',
            '  "key": "Enter" | "Tab" | "Escape",',
            '  "url": "https://example.com (optional, for new_tab)",',
            '  "path": "https://example.com (for navigate)",',
            '  "message": "formatted markdown explanation (for \'answer\') OR completion summary (for \'finish\')"',
            '}',
            '',
            'Return raw JSON only. No markdown fences.'
        ].join('\n');

        const elementsSummary = (sanitizedDom.elements || [])
            .slice(0, 60)
            .map((el) => {
                const status = el.text ? ` [${el.text}]` : '';
                return `[${el.index}] <${el.type}> "${el.label || el.text || ''}"${status} ${el.id ? '#' + el.id : ''}`;
            })
            .join('\n');

        const historySummary = history.length > 0
            ? `Actions already completed in this run:\n${history.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n`
            : '';

        const userPrompt = [
            `User Prompt: "${userInstruction}"`,
            historySummary,
            `Current Page: "${sanitizedDom.title || ''}" (${sanitizedDom.url || ''})`,
            `Interactive Elements:\n${elementsSummary}`,
            '',
            `Step ${currentStep} of ${maxSteps}. What is the next single JSON action or answer?`
        ].join('\n');

        const imageUrl = sanitizedScreenshot && sanitizedScreenshot.startsWith('data:image/')
            ? sanitizedScreenshot
            : `data:image/jpeg;base64,${sanitizedScreenshot}`;

        const payload = {
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userPrompt },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }
            ],
            max_tokens: this.maxTokens,
            temperature: this.temperature,
            stream: false
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            let res = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!res.ok) {
                const textFallbackPayload = {
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: this.maxTokens,
                    temperature: this.temperature,
                    stream: false
                };
                res = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(textFallbackPayload),
                    signal: controller.signal
                });
            }

            clearTimeout(timer);

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`Open WebUI HTTP ${res.status}: ${errText.substring(0, 120)}`);
            }

            const data = await res.json();
            const content = OpenWebUIClient.extractContent(data);
            if (!content) throw new Error('Empty AI response received.');
            return content;
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') throw new Error(`AI request timed out after ${this.timeoutMs / 1000}s.`);
            throw err;
        }
    }

    async chatAboutPage({ sanitizedScreenshot, sanitizedDom, userQuestion }) {
        const rawOutput = await this.queryVisionAgent({
            sanitizedScreenshot,
            sanitizedDom,
            userInstruction: userQuestion,
            history: [],
            currentStep: 1,
            maxSteps: 1
        });

        try {
            const cleaned = rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
                if (parsed.message) return parsed.message;
            }
        } catch (_) {}

        return rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }
}
