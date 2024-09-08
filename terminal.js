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

    const getUsername = () => new Promise((resolve) => {
        if (window.chrome && chrome.identity && chrome.identity.getProfileUserInfo) {
            chrome.identity.getProfileUserInfo((userInfo) => {
                const loggedIn = !!userInfo.email;
                resolve(loggedIn ? userInfo.email : "web");
            });
        } else {
            resolve('web');
        }
    });

    function detectBrowser() {
        const userAgent = navigator.userAgent;
        const browserInfo = {
            browser: "Unknown",
            version: "Unknown"
        };
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
                const versionMatch = userAgent.match(new RegExp(browser.rule.source + "/([\\d\\.]+)"));
                browserInfo.browser = browser.name;
                browserInfo.version = versionMatch ? versionMatch[1] : "Unknown";
                break;
            }
        }
        return browserInfo;
    }

    const detectedBrowser = detectBrowser();
    console.log(`Browser: ${detectedBrowser.browser}, Version: ${detectedBrowser.version}`);

    const createPrompt = () => {
        getUsername().then((username) => {
            const prompt = document.createElement('div');
            prompt.className = 'prompt';
            const span = document.createElement('span');
            span.textContent = `${detectedBrowser.browser}@${username}:~$`;
            prompt.appendChild(span);
            const input = document.createElement('input');
            input.id = 'input';
            input.type = 'text';
            input.autofocus = true;
            prompt.appendChild(input);
            terminal.appendChild(prompt);
            input.focus();
            input.addEventListener('keydown', handleCommand);
        });
    };

    const handleCommand = (e) => {
        if (e.key === 'Enter') {
            const input = e.target;
            const command = input.value.trim();
            let response = '';
            if (commands.hasOwnProperty(command)) {
                if (command === 'clear') {
                    terminal.innerHTML = '';
                    response = ""; // No output for clear command
                } else {
                    response = commands[command];
                }
            } else {
                response = `${command}: command not found`;
            }
            const result = document.createElement('div');
            result.textContent = response;
            terminal.appendChild(result);
            input.readOnly = true;
            createPrompt();
            terminal.scrollTop = terminal.scrollHeight;
        }
    };

    createPrompt();
})();