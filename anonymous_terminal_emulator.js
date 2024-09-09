(function () {
  document.addEventListener('DOMContentLoaded', (event) => {
    const terminal = document.getElementById('terminal');
    if (!terminal) {
      console.error('Terminal element not found');
      return;
    }

    const commands = {
      help: 'Available commands: help, about, clear, dino, insta',
      about: 'Just a project trying different things',
      aboutme: 'Chemistry student somewhere in Germany ',
      clear: '',
      dino: 'Redirecting to /dino...',
      insta: 'Redirecting to instagram...',
    };

    const detectBrowser = () => {
      const userAgent = navigator.userAgent;
      const browserInfo = { browser: 'Unknown', version: 'Unknown' };
      const browserDetectionRules = [
        { name: 'Opera GX', rule: /\bOPR\/.*GX\b/i },
        { name: 'Opera', rule: /\bOPR\/|Opera\b/i },
        { name: 'Edge', rule: /\bEdg\b/i },
        { name: 'Chrome', rule: /\bChrome\b/i },
        { name: 'Safari', rule: /\bSafari\b/i, skip: /\bChrome\b/i },
        { name: 'Firefox', rule: /\bFirefox\b/i },
        { name: 'IE', rule: /\bMSIE\b|Trident\b/i },
      ];
      const getVersionRegExp = (rule) => new RegExp(rule.source + '/([\\d\\.]+)');
      for (const browser of browserDetectionRules) {
        if (browser.rule.test(userAgent)) {
          if (browser.skip && browser.skip.test(userAgent)) {
            continue;
          }
          const versionMatch = getVersionRegExp(browser.rule).exec(userAgent);
          browserInfo.browser = browser.name;
          browserInfo.version = versionMatch ? versionMatch[1] : 'Unknown';
          break;
        }
      }
      return browserInfo;
    };

    const detectedBrowser = detectBrowser();
    console.log(`Browser: ${detectedBrowser.browser}, Version: ${detectedBrowser.version}`);

    const createPrompt = (readOnly = false) => {
      const username = 'user'; // Hard-coded username
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
    };

    const handleCommand = (e) => {
      if (e.key === 'Enter') {
        const input = e.target;
        const command = input.value.trim();
        let response = '';
        let isError = false;

        if (commands.hasOwnProperty(command)) {
          if (command === 'clear') {
            terminal.innerHTML = ''; // Clear the terminal content
            createPrompt(false); // Create a new prompt after clearing
            return; // Early return after clearing the terminal
          } else if (command === 'dino') {
            response = commands[command];
            window.location.assign('/dino'); // Redirect to /dino
            return; // Early return after redirecting
          } else if (command === 'insta'){
            response = commands[command];
            window.location.assign("https://instagram.com/davidschlenk_");
            return;
          } else {
            response = commands[command];
          }
        } else {
          response = `${command}: command not found`;
          isError = true;
        }

        if (response) {
          const result = document.createElement('div');
          result.className = 'command-output';
          result.textContent = response;
          if (isError) {
            result.classList.add('error-message');
          }
          terminal.appendChild(result);
        }
        input.readOnly = true;
        createPrompt(false);
      }
    };

    const focusTerminalInput = (event) => {
      const terminalInput = terminal.querySelector('.prompt input[type="text"]:not([readOnly])');
      if (terminalInput && (!event || !event.target.closest('#terminal'))) {
        terminalInput.focus();
      }
    };

    window.addEventListener('focus', focusTerminalInput);
    document.addEventListener('click', focusTerminalInput);
    terminal.addEventListener('click', focusTerminalInput);
    terminal.innerHTML = '';
    createPrompt(false);

    setTimeout(focusTerminalInput, 500); // Maybe faster focus
  });
})();