(function() {
    const terminal = document.getElementById('terminal');
    if (!terminal) {
        console.error('Terminal element not found');
        return;
    }

    const commands = {
        help: 'Available commands: help, about, clear',
        about: 'This is a simple terminal emulator built with HTML, CSS, and JavaScript.',
        clear: ''
    };

    const detectBrowser = () => {
        const userAgent = navigator.userAgent;
        const browserInfo = { browser: "Unknown", version: "Unknown" };
        const browserDetectionRules = [
            { name: "Opera GX", rule: /\bOPR\/.*GX\b/i },
            { name: "Opera", rule: /\bOPR\/|Opera\b/i },
            { name: "Edge", rule: /\bEdg\b/i },
            { name: "Chrome", rule: /\bChrome\b/i },
            { name: "Safari", rule: /\bSafari\b/i, skip: /\bChrome\b/i },
            { name: "Firefox", rule: /\bFirefox\b/i },
            { name: "IE", rule: /\bMSIE\b|Trident\b/i }
        ];

        for (const browser of browserDetectionRules) {
            if (browser.rule.test(userAgent)) {
                if (browser.skip && browser.skip.test(userAgent)) {
                    continue;
                }
                const versionMatch = new RegExp(browser.rule.source + "/([\\d\\.]+)").exec(userAgent);
                browserInfo.browser = browser.name;
                browserInfo.version = versionMatch ? versionMatch[1] : "Unknown";
                break;
            }
        }
        return browserInfo;
    };

    const detectedBrowser = detectBrowser();
    console.log(`Browser: ${detectedBrowser.browser}, Version: ${detectedBrowser.version}`);

    const createPrompt = (readOnly) => {
        const username = "user"; // Hard-coded username

        const prompt = document.createElement('div');
        prompt.className = 'prompt';

        const span = document.createElement('span');
        span.textContent = `${detectedBrowser.browser}@${username}:~$`;
        prompt.appendChild(span);

        const input = document.createElement('input');
        input.type = 'text';
        input.autofocus = true;
        input.readOnly = readOnly;
        prompt.appendChild(input);

        terminal.appendChild(prompt);
        input.focus();
        input.addEventListener('keydown', handleCommand);
        terminal.scrollTop = terminal.scrollHeight;

        // Ensure the input field is focused when clicking on the terminal
        terminal.addEventListener('click', () => input.focus());
    };

    const handleCommand = (e) => {
        if (e.key === 'Enter') {
            const input = e.target;
            const command = input.value.trim();
            let response = '';

            if (commands.hasOwnProperty(command)) {
                if (command === 'clear') {
                    terminal.innerHTML = '';
                    response = '';
                } else {
                    response = commands[command];
                }
            } else {
                response = `${command}: command not found`;
                const errorElement = document.createElement('div');
                errorElement.className = 'command-error';
                errorElement.textContent = response;
                terminal.appendChild(errorElement);
                input.readOnly = true;

                createPrompt(false);
                return;
            }

            const result = document.createElement('div');
            result.className = 'command-output';
            result.textContent = response;
            terminal.appendChild(result);
            input.readOnly = true;

            createPrompt(false);
        }
    };

    // Initialize the terminal with the first prompt
    createPrompt(false);
})();