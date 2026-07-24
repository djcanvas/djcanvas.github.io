(function () {
  document.addEventListener('DOMContentLoaded', (event) => {
    const terminal = document.getElementById('terminal');
    if (!terminal) {
      console.error('Terminal element not found. Please ensure the element with id "terminal" is present in the document.');
      return;
    }

    const COMMANDS = {
      HELP: 'Available commands: help, about, aboutme, clear, insta, spotify, dino, user, hitster',
      ABOUT: 'Just a project trying different things',
      ABOUTME: 'Chemistry student livin in Germany',
      CLEAR: '',
      DINO: 'Redirecting to /dino...',
      INSTA: 'Redirecting to Instagram...',
      SPOTIFY: 'Redricting to Spotify...',
      USER: 'Usage: user <username>',
      HITSTER: 'Opening hitster...',
    };
    // SHA-256 hashes of passwords (not plaintext). Note: this still isn't
    // real security — anyone can view-source, brute-force the hash offline,
    // or bypass the check in devtools. It's a client-side novelty gate only.
    const users = {
      'djcanvas': '9cbbdb5ef53b0f78a27194954065960491efcd03426c07960654e1f58cb72617',
    };

    const sha256Hex = async (text) => {
      const data = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
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
          case 'spotify':
            response = COMMANDS.SPOTIFY;
            window.location.assign("https://open.spotify.com/user/david.j.s-de?si=44dc05ec00f245c7");
            return;
          case 'hitster':
            startHitster(commandLine.slice(1));
            return; // The game owns the prompt from here on
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

    const handlePassword = async (password) => {
      const hashed = await sha256Hex(password);
      if (users[newUsername] === hashed) {
        username = newUsername;
        newUsername = ''; // Clear the temp username storage
        displayMessage(`Username set to ${username}`);
      } else {
        displayMessage('Incorrect password', true);
      }
      inputMode = 'command';
      createPrompt(false);
    };

    const SPOTIFY_SETUP_HELP = [
      'hitster streams from Spotify and needs a one-time client id:',
      '  1. open developer.spotify.com/dashboard and create an app',
      `  2. add "${window.location.origin}/" as a Redirect URI`,
      '  3. run: hitster setup <client-id>',
      'Playback needs Spotify Premium; you log in on Spotify itself, not here.',
    ].join('\n');

    const startHitster = (args) => {
      if (!window.Hitster || !window.HitsterGui) {
        displayMessage('hitster failed to load.', true);
        createPrompt(false);
        return;
      }

      const [sub, value] = args;
      if (sub === 'setup') {
        if (!value) {
          displayMessage('Usage: hitster setup <client-id>', true);
        } else {
          window.Hitster.setClientId(value);
          displayMessage('Client id saved. Run "hitster" to play.');
        }
        createPrompt(false);
        return;
      }
      if (sub === 'logout') {
        window.Hitster.logout();
        displayMessage('Spotify session cleared.');
        createPrompt(false);
        return;
      }
      if (!window.Hitster.getClientId()) {
        displayMessage(SPOTIFY_SETUP_HELP, true);
        createPrompt(false);
        return;
      }
      window.HitsterGui.open();
      createPrompt(false);
    };

    /** Finishes the OAuth round trip and reopens the game we were starting. */
    const resumeHitsterAfterLogin = async () => {
      const result = await window.Hitster.completeAuthCallback();
      const setup = window.Hitster.consumeSetup();
      if (!result.ok) {
        displayMessage(`Spotify login failed: ${result.error}`, true);
        return;
      }
      displayMessage('Logged in to Spotify.');
      window.HitsterGui.open(setup || undefined);
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
      // While the hitster overlay is up it owns the keyboard; pulling focus
      // back here would make its own inputs impossible to type into.
      if (document.querySelector('.hitster-root')) {
        return;
      }
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

    if (window.Hitster && window.Hitster.isAuthCallback()) {
      resumeHitsterAfterLogin();
    }
  });
})();