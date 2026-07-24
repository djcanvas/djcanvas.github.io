/**
 * Hitster GUI: hot-seat multiplayer over the Spotify playback layer in
 * hitster.js.
 *
 * The core mechanic follows the board game rather than a quiz: a mystery track
 * plays and the active player drags it onto their own timeline, between the
 * cards they have already won. Land in the right gap and you keep the card.
 * Naming the title and the artist earns bonus points on top.
 *
 * Multiplayer is local pass-and-play. Networked play would need a server to
 * hold shared state, which static hosting cannot provide.
 */
(function () {
  'use strict';

  const WIN_CARDS_DEFAULT = 8;
  const BONUS = { title: 1, artist: 1 };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /**
   * A drop slot is correct when the mystery year fits between its neighbours.
   * Ties count as fitting on either side, which matters for same-year cards.
   */
  const slotIsCorrect = (timeline, index, year) => {
    const before = index > 0 ? timeline[index - 1].year : -Infinity;
    const after = index < timeline.length ? timeline[index].year : Infinity;
    return before <= year && year <= after;
  };

  const createPlayers = (names) =>
    names.map((name) => ({ name, timeline: [], bonus: 0 }));

  window.HitsterGui = {
    /** @param {{players?: string[], winCards?: number}} [setup] */
    open(setup) {
      const H = window.Hitster;
      const root = el('div', 'hitster-root');
      root.tabIndex = -1; // focusable fallback when a screen has no controls
      document.body.appendChild(root);
      // The starfield is completely hidden behind the overlay; leaving it
      // running costs a few hundred canvas strokes per frame for nothing.
      if (window.Starfield) window.Starfield.pause();

      let players = [];
      let winCards = WIN_CARDS_DEFAULT;
      let turn = 0;
      let deck = [];
      let mystery = null;
      let playback = null;
      let busy = false;

      const close = () => {
        if (playback) {
          playback.player.pause().catch(() => {});
          playback.player.disconnect();
          playback = null;
        }
        root.remove();
        document.removeEventListener('keydown', onKey);
        if (window.Starfield) window.Starfield.resume();
      };

      const onKey = (e) => {
        if (e.key === 'Escape') close();
      };
      document.addEventListener('keydown', onKey);

      // --- screens ----------------------------------------------------------

      /**
       * The terminal input still holds focus when the overlay opens, so the
       * overlay has to take it, otherwise typing keeps going to the shell.
       */
      const takeFocus = (shell) => {
        const active = document.activeElement;
        if (active && active.blur && !root.contains(active)) active.blur();
        const target =
          shell.querySelector('.hitster-input') ||
          shell.querySelector('.hitster-primary') ||
          root;
        if (target && target.focus) target.focus();
      };

      const screen = (title) => {
        root.innerHTML = '';
        const shell = el('div', 'hitster-shell');
        const head = el('header', 'hitster-head');
        head.appendChild(el('h1', null, title));
        const quit = el('button', 'hitster-quit', 'close');
        quit.addEventListener('click', close);
        head.appendChild(quit);
        shell.appendChild(head);
        root.appendChild(shell);
        // Callers keep appending after this returns, so claim focus once the
        // current synchronous render has finished.
        setTimeout(() => takeFocus(shell), 0);
        return shell;
      };

      const showSetup = () => {
        const shell = screen('hitster');
        const form = el('div', 'hitster-setup');
        form.appendChild(el('p', 'hitster-hint',
          'Drag the mystery track onto your timeline where you think it belongs. ' +
          'Guess the title and artist for bonus points. Pass the device between turns.'));

        const list = el('div', 'hitster-players');
        const addRow = (value) => {
          const row = el('div', 'hitster-player-row');
          const input = el('input', 'hitster-input');
          input.type = 'text';
          input.placeholder = `Player ${list.children.length + 1}`;
          input.value = value || '';
          input.setAttribute('aria-label', `Player ${list.children.length + 1} name`);
          const remove = el('button', 'hitster-mini', 'x');
          remove.addEventListener('click', () => {
            if (list.children.length > 1) row.remove();
          });
          row.append(input, remove);
          list.appendChild(row);
        };
        addRow('Player 1');
        addRow('Player 2');
        form.appendChild(list);

        const addBtn = el('button', 'hitster-mini hitster-add', '+ add player');
        addBtn.addEventListener('click', () => addRow(''));
        form.appendChild(addBtn);

        const goalWrap = el('label', 'hitster-goal');
        goalWrap.appendChild(el('span', null, 'Cards to win'));
        const goal = el('input', 'hitster-input hitster-goal-input');
        goal.type = 'number';
        goal.min = '3';
        goal.max = '20';
        goal.value = String(WIN_CARDS_DEFAULT);
        goalWrap.appendChild(goal);
        form.appendChild(goalWrap);

        const start = el('button', 'hitster-primary', 'start game');
        const status = el('p', 'hitster-status');
        start.addEventListener('click', async () => {
          const names = Array.from(list.querySelectorAll('input'))
            .map((i, idx) => i.value.trim() || `Player ${idx + 1}`);
          winCards = Math.min(Math.max(parseInt(goal.value, 10) || WIN_CARDS_DEFAULT, 3), 20);

          if (!H.getClientId()) {
            status.textContent =
              'Spotify client id missing. In the terminal run: hitster setup YOUR_CLIENT_ID';
            status.classList.add('is-error');
            return;
          }
          if (!H.hasToken()) {
            H.stashSetup({ players: names, winCards });
            status.textContent = 'Sending you to Spotify to log in...';
            H.beginAuth();
            return;
          }
          await begin(names, winCards, status);
        });
        form.append(start, status);
        shell.appendChild(form);
      };

      const begin = async (names, goal, status) => {
        players = createPlayers(names);
        winCards = goal;
        deck = H.shuffle(H.SONGS);
        turn = 0;

        if (status) status.textContent = 'Connecting to Spotify...';
        try {
          playback = await H.createPlayer((event, message) => {
            if (event === 'account_error') {
              showFatal('Spotify says this account is not Premium. The Web Playback SDK needs Premium to stream.');
            } else if (event === 'authentication_error') {
              H.logout();
              showFatal(`Spotify auth failed: ${message}. Reload and run hitster again.`);
            }
          });
        } catch (error) {
          showFatal(`Could not start the Spotify player: ${error.message}`);
          return;
        }
        // Every player starts with one free card so the timeline has an anchor.
        for (const player of players) {
          const seed = deck.shift();
          if (seed) player.timeline.push(seed);
        }
        await nextTurn();
      };

      const showFatal = (message) => {
        const shell = screen('hitster');
        const box = el('div', 'hitster-setup');
        box.appendChild(el('p', 'hitster-status is-error', message));
        const back = el('button', 'hitster-primary', 'back to setup');
        back.addEventListener('click', showSetup);
        box.appendChild(back);
        shell.appendChild(box);
      };

      // --- turn loop --------------------------------------------------------

      const playMystery = async () => {
        if (!playback || !mystery || !mystery.uri) return;
        try {
          await H.api(`/me/player/play?device_id=${playback.deviceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uris: [mystery.uri] }),
          });
        } catch (error) {
          /* the replay button on the turn screen covers a failed start */
        }
      };

      const nextTurn = async () => {
        busy = false;
        if (deck.length === 0) {
          showWinner(true);
          return;
        }
        const song = deck.shift();
        const uri = await H.findTrackUri(song);
        if (!uri) {
          await nextTurn(); // not on Spotify here, quietly draw another
          return;
        }
        mystery = { song, uri };
        showTurn();
        await playMystery();
      };

      const showTurn = () => {
        const player = players[turn];
        const shell = screen('hitster');

        const bar = el('div', 'hitster-scorebar');
        players.forEach((p, i) => {
          const chip = el('div', `hitster-chip${i === turn ? ' is-active' : ''}`);
          chip.appendChild(el('strong', null, p.name));
          chip.appendChild(el('span', null, `${p.timeline.length}/${winCards} cards - ${p.bonus} bonus`));
          bar.appendChild(chip);
        });
        shell.appendChild(bar);

        shell.appendChild(el('p', 'hitster-turn', `${player.name}'s turn - drop the card on your timeline`));

        const controls = el('div', 'hitster-controls');
        const replay = el('button', 'hitster-mini', 'replay');
        replay.addEventListener('click', playMystery);
        const pause = el('button', 'hitster-mini', 'pause');
        pause.addEventListener('click', () => playback && playback.player.pause().catch(() => {}));
        controls.append(replay, pause);
        shell.appendChild(controls);

        // Mystery card, dragged onto the timeline below.
        const card = el('div', 'hitster-card is-mystery');
        card.appendChild(el('span', 'hitster-card-year', '?'));
        card.appendChild(el('span', 'hitster-card-meta', 'mystery track'));
        card.tabIndex = 0;
        shell.appendChild(card);

        // Placement stays provisional until the player locks it in, so they can
        // move the card around and fill in the bonus guesses first.
        let selectedSlot = null;

        const timeline = el('div', 'hitster-timeline');
        const renderTimeline = () => {
          timeline.innerHTML = '';
          const addSlot = (index) => {
            const slot = el('button', 'hitster-slot');
            slot.dataset.index = String(index);
            slot.setAttribute('aria-label', `Place before position ${index + 1}`);
            if (selectedSlot === index) {
              slot.classList.add('is-chosen');
              slot.textContent = '?';
            }
            slot.addEventListener('click', () => choose(index));
            timeline.appendChild(slot);
          };
          addSlot(0);
          player.timeline.forEach((song, i) => {
            const known = el('div', 'hitster-card');
            known.appendChild(el('span', 'hitster-card-year', String(song.year)));
            known.appendChild(el('span', 'hitster-card-meta', `${song.title} - ${song.artist}`));
            timeline.appendChild(known);
            addSlot(i + 1);
          });
        };
        renderTimeline();
        shell.appendChild(timeline);

        const describeSlot = (index) => {
          const before = index > 0 ? player.timeline[index - 1].year : null;
          const after = index < player.timeline.length ? player.timeline[index].year : null;
          if (before === null && after === null) return 'Placing as the first card';
          if (before === null) return `Placing before ${after}`;
          if (after === null) return `Placing after ${before}`;
          return `Placing between ${before} and ${after}`;
        };

        const caption = el('p', 'hitster-hint',
          'Drag the card into a gap, or click a gap. Nothing is revealed until you lock in.');
        shell.appendChild(caption);

        const guesses = el('div', 'hitster-guesses');
        const titleInput = el('input', 'hitster-input');
        titleInput.type = 'text';
        titleInput.placeholder = 'Title (bonus)';
        titleInput.setAttribute('aria-label', 'Title guess');
        const artistInput = el('input', 'hitster-input');
        artistInput.type = 'text';
        artistInput.placeholder = 'Artist (bonus)';
        artistInput.setAttribute('aria-label', 'Artist guess');
        guesses.append(titleInput, artistInput);
        shell.appendChild(guesses);

        const lockIn = el('button', 'hitster-primary', 'lock in');
        lockIn.disabled = true;
        lockIn.addEventListener('click', () => {
          if (busy || selectedSlot === null) return;
          busy = true;
          reveal(selectedSlot, titleInput.value, artistInput.value);
        });
        shell.appendChild(lockIn);

        enableDrag(card, timeline, choose);

        /** Provisional placement: repeatable, and never reveals anything. */
        function choose(index) {
          if (busy) return;
          selectedSlot = index;
          renderTimeline(); // only the timeline, so the guess fields keep focus
          caption.textContent = `${describeSlot(index)}. Press lock in to confirm.`;
          lockIn.disabled = false;
        }
      };

      /**
       * Pointer-based dragging so mouse and touch both work.
       *
       * Slot positions are measured once per drag rather than per move:
       * getBoundingClientRect forces a layout, and pointermove fires far more
       * often than the display refreshes. Painting is likewise coalesced into
       * one animation frame per frame.
       */
      const enableDrag = (card, timeline, onDrop) => {
        let dragging = false;
        let start = { x: 0, y: 0 };
        let targets = []; // {slot, rect}, valid for the duration of one drag
        let hot = null;
        let frame = 0;
        let latest = null;

        const measure = () => {
          targets = Array.from(timeline.querySelectorAll('.hitster-slot')).map((slot) => ({
            slot,
            rect: slot.getBoundingClientRect(),
          }));
        };

        const slotAt = (x, y) => {
          const pad = 18; // generous target, the gaps are thin
          const found = targets.find(
            ({ rect }) =>
              x >= rect.left - pad && x <= rect.right + pad &&
              y >= rect.top - pad && y <= rect.bottom + pad
          );
          return found ? found.slot : null;
        };

        const setHot = (slot) => {
          if (slot === hot) return; // only touch the DOM when it actually changes
          if (hot) hot.classList.remove('is-hot');
          if (slot) slot.classList.add('is-hot');
          hot = slot;
        };

        const paint = () => {
          frame = 0;
          if (!dragging || !latest) return;
          card.style.transform = `translate(${latest.x - start.x}px, ${latest.y - start.y}px)`;
          setHot(slotAt(latest.x, latest.y));
        };

        const move = (e) => {
          if (!dragging) return;
          latest = { x: e.clientX, y: e.clientY };
          if (!frame) frame = requestAnimationFrame(paint);
        };

        // A horizontal scroll mid-drag would invalidate the cached rects.
        const remeasure = () => dragging && measure();

        const up = (e) => {
          if (!dragging) return;
          dragging = false;
          if (frame) {
            cancelAnimationFrame(frame);
            frame = 0;
          }
          card.classList.remove('is-dragging');
          card.style.transform = '';
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          timeline.removeEventListener('scroll', remeasure);
          const hit = slotAt(e.clientX, e.clientY);
          setHot(null);
          if (hit) onDrop(parseInt(hit.dataset.index, 10));
        };

        card.addEventListener('pointerdown', (e) => {
          dragging = true;
          start = { x: e.clientX, y: e.clientY };
          latest = null;
          measure();
          card.classList.add('is-dragging');
          // Touch pointers are implicitly captured by the card; releasing lets
          // the document-level listeners below see the rest of the drag.
          if (card.hasPointerCapture && card.hasPointerCapture(e.pointerId)) {
            card.releasePointerCapture(e.pointerId);
          }
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
          timeline.addEventListener('scroll', remeasure);
        });

        // Keyboard fallback: the slots are real buttons, so tabbing works too.
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const first = timeline.querySelector('.hitster-slot');
            if (first) first.focus();
          }
        });
      };

      const reveal = async (index, titleGuess, artistGuess) => {
        const player = players[turn];
        const song = mystery.song;
        const placed = slotIsCorrect(player.timeline, index, song.year);
        const gotTitle = H.isCloseEnough(titleGuess || '', song.title);
        const gotArtist = H.artistMatches(artistGuess || '', song.artist);

        if (playback) await playback.player.pause().catch(() => {});

        if (placed) {
          player.timeline.push(song);
          player.timeline.sort((a, b) => a.year - b.year);
        }
        if (gotTitle) player.bonus += BONUS.title;
        if (gotArtist) player.bonus += BONUS.artist;

        const shell = screen('hitster');
        const box = el('div', 'hitster-reveal');
        box.appendChild(el('p', `hitster-verdict ${placed ? 'is-good' : 'is-bad'}`,
          placed ? 'Correct placement - card kept' : 'Wrong placement - card discarded'));
        const answer = el('div', 'hitster-card is-answer');
        answer.appendChild(el('span', 'hitster-card-year', String(song.year)));
        answer.appendChild(el('span', 'hitster-card-meta', `${song.title} - ${song.artist}`));
        box.appendChild(answer);
        box.appendChild(el('p', 'hitster-hint',
          `title ${gotTitle ? '+' + BONUS.title : '0'} | artist ${gotArtist ? '+' + BONUS.artist : '0'}`));

        if (player.timeline.length >= winCards) {
          const done = el('button', 'hitster-primary', 'see result');
          done.addEventListener('click', () => showWinner(false));
          box.appendChild(done);
        } else {
          const next = el('button', 'hitster-primary', 'next player');
          next.addEventListener('click', async () => {
            turn = (turn + 1) % players.length;
            await nextTurn();
          });
          box.appendChild(next);
        }
        shell.appendChild(box);
      };

      const showWinner = (deckEmpty) => {
        if (playback) playback.player.pause().catch(() => {});
        const shell = screen('hitster');
        const ranked = players
          .slice()
          .sort((a, b) => b.timeline.length - a.timeline.length || b.bonus - a.bonus);
        const box = el('div', 'hitster-reveal');
        box.appendChild(el('p', 'hitster-verdict is-good',
          deckEmpty ? 'Out of tracks - final standings' : `${ranked[0].name} wins`));
        const table = el('div', 'hitster-standings');
        ranked.forEach((p, i) => {
          const row = el('div', 'hitster-chip');
          row.appendChild(el('strong', null, `${i + 1}. ${p.name}`));
          row.appendChild(el('span', null, `${p.timeline.length} cards - ${p.bonus} bonus`));
          table.appendChild(row);
        });
        box.appendChild(table);
        const again = el('button', 'hitster-primary', 'play again');
        again.addEventListener('click', showSetup);
        box.appendChild(again);
        shell.appendChild(box);
      };

      // Resuming straight after the Spotify redirect skips the setup screen.
      if (setup && setup.players) {
        screen('hitster').appendChild(el('p', 'hitster-status', 'Connecting to Spotify...'));
        begin(setup.players, setup.winCards || WIN_CARDS_DEFAULT, null);
      } else {
        showSetup();
      }
    },
  };
})();
