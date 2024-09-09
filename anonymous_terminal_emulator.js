(function () {
  document.addEventListener('DOMContentLoaded', (event) => {
    const terminal = document.getElementById('terminal');
    if (!terminal) {
      console.error('Terminal element not found. Please ensure the element with id "terminal" is present in the document.');
      return;
    }

    const COMMANDS = {
      HELP: 'Available commands: help, about, clear, dino, insta, user',
      ABOUT: 'Just a project trying different things',
      CLEAR: '',
      DINO: 'Redirecting to /dino...',
      INSTA: 'Redirecting to Instagram...',
      USER: 'Usage: user <username>',
    };
    const users = {
      'djcanvas': '123456789',
      // Add more predefined usernames and passwords here
    };
    let username = 'user'; // Initial hard-coded username
    let inputMode = 'command'; // Default mode is 'command'
    let newUsername = ''; // Username to be checked in password mode

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

      if (COMMANDS.hasOwnProperty(command.toUpperCase())) {
        switch (command.toLowerCase()) {
          case 'clear':
            terminal.innerHTML = ''; // Clear the terminal content
            createPrompt(false); // Create a new prompt after clearing
            return; // Early return after clearing the terminal
          case 'dino':
            response = COMMANDS.DINO;
            window.location.assign('/dino'); // Redirect to /dino
            return; // Early return after redirecting
          case 'insta':
            response = COMMANDS.INSTA;
            window.location.assign("https://instagram.com/davidschlenk_");
            return;
          case 'user':
            if (commandLine.length === 2) {
              newUsername = commandLine[1];
              if (users.hasOwnProperty(newUsername)) {
                inputMode = 'password';
                terminal.lastChild.remove();
                createPrompt(false, 'Enter password');
                return;
              } else {
                username = newUsername;
                response = `Username set to ${username}`;
              }
            } else {
              response = COMMANDS.USER;
              isError = true;
            }
            break;
          default:
            response = COMMANDS[command.toUpperCase()];
        }
      } else {
        response = `${command}: command not found`;
        isError = true;
      }

      if (response) {
        displayMessage(response, isError);
      }

      createPrompt(false);
    };

    const handlePassword = (password) => {
      if (users[newUsername] === password) {
        username = newUsername;
        newUsername = ''; // Clear the temp username storage
        displayMessage(`Username set to ${username}`);
      } else {
        displayMessage('Incorrect password', true);
      }
      inputMode = 'command';
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
    setTimeout(focusTerminalInput, 500);
  });
})();