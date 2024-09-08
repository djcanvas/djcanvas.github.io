(function() {
    const terminal = document.getElementById('terminal');

    const commands = {
        help: 'Available commands: help, about, clear',
        about: 'This is a simple terminal emulator built with HTML, CSS, and JavaScript.',
        clear: ''
    };

    const getBrowser = () => {
        const userAgent = navigator.userAgent;
        if (userAgent.indexOf("Firefox") > -1) {
            return "Firefox";
        } else if (userAgent.indexOf("Chrome") > -1) {
            return "Chrome";
        } else if (userAgent.indexOf("Safari") > -1) {
            return "Safari";
        } else if (userAgent.indexOf("Edge") > -1) {
            return "Edge";
        } else {
            return "Browser";
        }
    };

    const createPrompt = () => {
        const prompt = document.createElement('div');
        prompt.className = 'prompt';

        const span = document.createElement('span');
        span.textContent = `${getBrowser()}@web:~$`;
        prompt.appendChild(span);

        const input = document.createElement('input');
        input.id = 'input';
        input.type = 'text';
        input.autofocus = true;
        prompt.appendChild(input);

        terminal.appendChild(prompt);
        input.focus();
        input.addEventListener('keydown', handleCommand);
    };

    const handleCommand = e => {
        if (e.key === 'Enter') {
            const input = e.target;
            const command = input.value.trim();
            let response = '';

            if (commands.hasOwnProperty(command)) {
                if (command === 'clear') {
                    terminal.innerHTML = '';
                } else {
                    response = commands[command];
                }
            } else {
                response = `${command}: command not found`;
            }

            e.target.removeEventListener('keydown', handleCommand);
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