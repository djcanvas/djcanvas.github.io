(function() {
    const terminal = document.getElementById('terminal');

    const commands = {
        help: 'Available commands: help, about, clear',
        about: 'This is a simple terminal emulator built with HTML, CSS, and JavaScript.',
        clear: ''
    };

    const getUsername = (callback) => {
        if (window.chrome && chrome.identity && chrome.identity.getProfileUserInfo) {
            chrome.identity.getProfileUserInfo(function(userInfo) {
                const loggedIn = !!userInfo.email;
                callback(loggedIn ? userInfo.email : "web");
            });
        } else {
            callback('web');
        }
    };

    function detectBrowser() {
        const userAgent = navigator.userAgent;
        const browserInfo = {
            browser: "Unknown",
            version: "Unknown"
        };
        const browserDetectionRules = [
            { name: "Opera GX", rule: /OPR\/.*GX/i },
            { name: "Opera", rule: /OPR|Opera/i },
            { name: "Edge", rule: /Edg/i },
            { name: "Chrome", rule: /Chrome/i },
            { name: "Safari", rule: /Safari/i },
            { name: "Firefox", rule: /Firefox/i },
            { name: "IE", rule: /MSIE|Trident/i }
        ];
        for (const browser of browserDetectionRules) {
            if (browser.rule.test(userAgent)) {
                let versionMatch = userAgent.match(new RegExp(browser.rule.source + "/([\\d\\.]+)"));
                browserInfo.browser = browser.name;
                browserInfo.version = versionMatch ? versionMatch[1] : "Unknown";
                break;
            }
        }
        // Special case handling for Safari since it also contains "Chrome" in some versions
        if (browserInfo.browser === "Safari" && /Chrome/i.test(userAgent)) {
            browserInfo.browser = "Chrome";
        }

        return browserInfo;
    }

    const detectedBrowser = detectBrowser();
    console.log(`Browser: ${detectedBrowser.browser}, Version: ${detectedBrowser.version}`);

    const createPrompt = () => {
        getUsername((username) => {
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
            input.addEventListener('keydown', handleCommand, { once: true });
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

            input.removeEventListener('keydown', handleCommand);
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