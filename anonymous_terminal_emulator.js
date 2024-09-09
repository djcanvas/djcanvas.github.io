    (function() {
      document.addEventListener('DOMContentLoaded', (event) => {
        const terminal = document.getElementById('terminal');
        if (!terminal) {
          console.error('Terminal element not found. Please ensure the element with id "terminal" is present in the document.');
          return;
        }

        const commands = {
          help: 'Available commands: help, about, clear, dino, insta, user',
          about: 'Just a project trying different things',
          clear: '',
          dino: 'Redirecting to /dino...',
          insta: 'Redirecting to Instagram...',
          user: 'Usage: user <username>'
        };

        const users = {
          'djcanvas': '123456789',
          // Add more predefined usernames and passwords here
        };

        let username = 'user'; // Initial hard-coded username
        let inputMode = 'command'; // Default mode is 'command'

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
            { name: 'IE', rule: /\bMSIE\b|Trident\b/i }
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

        const createPrompt = (readOnly = false, placeholder = '') => {
          const prompt = document.createElement('div');
          prompt.className = 'prompt';
          const span = document.createElement('span');
          span.textContent = `${detectedBrowser.browser}@${username}:~$`;
          prompt.appendChild(span);
          const input = document.createElement('input');
          input.type = 'text';
          input.autofocus = true;
          input.readOnly = readOnly;
          input.placeholder = placeholder;
          prompt.appendChild(input);
          terminal.appendChild(prompt);
          input.focus();
          input.addEventListener('keydown', handleInput);
          terminal.scrollTop = terminal.scrollHeight;
        };

        const handleInput = (e) => {
          if (e.key === 'Enter') {
            const input = e.target;
            const inputValue = input.value.trim();
            if (inputMode === 'command') {
              handleCommand(inputValue);
            } else if (inputMode === 'password') {
              handlePassword(inputValue);
            }
            input.readOnly = true;
          }
        };

        const handleCommand = (inputValue) => {
          const commandLine = inputValue.split(' ');
          const command = commandLine[0];
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
            } else if (command === 'insta') {
              response = commands[command];
              window.location.assign("https://instagram.com/davidschlenk_"); // Use full, secure URL
              return;
            } else if (command === 'user') {
              if (commandLine.length === 2) {
                const newUsername = commandLine[1];
                if (users.hasOwnProperty(newUsername)) {
                  inputMode = 'password'; // Switch to password mode
                  createPrompt(false, 'Enter password');
                  terminal.lastChild.remove(); // Remove current prompt
                  return; // Early return to wait for password input
                } else {
                  username = newUsername;
                  response = `Username set to ${username}`;
                }
              } else {
                response = commands[command];
                isError = true;
              }
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

          createPrompt(false);
        };

        const handlePassword = (password) => {
          const lastPrompt = terminal.querySelector('.prompt:last-child');
          const newUsername = lastPrompt.querySelector('input').placeholder.split(' ')[2];
          if (users[newUsername] === password) {
            username = newUsername;
            displayMessage(`Username set to ${username}`);
          } else {
            displayMessage('Incorrect password', true);
          }
          inputMode = 'command'; // Switch back to command mode
          createPrompt(false);
        };

        const displayMessage = (message, isError = false) => {
          const result = document.createElement('div');
          result.className = 'command-output';
          result.textContent = message;
          if (isError) {
            result.classList.add('error-message');
          }
          terminal.appendChild(result);
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