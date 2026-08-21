/**
 * Hitster practice mode: a single-player drill on top of the same Spotify
 * playback layer the multiplayer game uses (hitster.js).
 *
 * The board game only ever asks "older or newer?". Practice mode asks for the
 * year, the artist and the title outright, scores the answer and keeps a
 * running hit rate in localStorage, so you can grind the deck alone before
 * playing it against someone.
 *
 * Audio comes from the Spotify Web Playback SDK, which means the clip length
 * and the starting point are enforced by seeking and pausing the player rather
 * than by an embedded preview: there is no 30 second preview to fall back on.
 */
(function () {
  'use strict';

  const STORE = {
    cfg: 'hitster.practiceCfg',
    stats: 'hitster.practiceStats',
  };

  const DEFAULT_CFG = {
    tolerance: 2, // years of slack that still count as a correct guess
    clip: 15, // seconds of audio per round, 0 plays the whole track
    start: 'begin', // 'begin' | 'random'
    era: 'all',
    strict: 'normal', // spelling tolerance, see Hitster.isCloseEnough
    volume: 70, // percent
    askYear: true,
    askArtist: true,
    askTitle: true,
  };

  const EMPTY_STATS = {
    rounds: 0,
    points: 0,
    streak: 0,
    best: 0,
    year: 0,
    artist: 0,
    title: 0,
    askedYear: 0,
    askedArtist: 0,
    askedTitle: 0,
  };

  // value -> predicate. Kept next to the option list so both stay in sync.
  const ERAS = {
    all: () => true,
    s1950: (song) => song.year >= 1950,
    s1970: (song) => song.year >= 1970,
    s1980: (song) => song.year >= 1980,
    s1990: (song) => song.year >= 1990,
    s2000: (song) => song.year >= 2000,
    s2010: (song) => song.year >= 2010,
    b1980: (song) => song.year < 1980,
    b1990: (song) => song.year < 1990,
    b2000: (song) => song.year < 2000,
  };

  const OPTIONS = {
    tolerance: [[0, 'exact year'], [1, '+/- 1 year'], [2, '+/- 2 years'], [3, '+/- 3 years'], [5, '+/- 5 years']],
    clip: [[0, 'play the whole track'], [5, '5 seconds'], [10, '10 seconds'], [15, '15 seconds'], [30, '30 seconds']],
    start: [['begin', 'start of the track'], ['random', 'random spot (harder)']],
    era: [
      ['all', 'everything (1908-2021)'],
      ['s1950', '1950 and later'],
      ['s1970', '1970 and later'],
      ['s1980', '1980 and later'],
      ['s1990', '1990 and later'],
      ['s2000', '2000 and later'],
      ['s2010', '2010 and later'],
      ['b1980', 'before 1980'],
      ['b1990', 'before 1990'],
      ['b2000', 'before 2000'],
    ],
    strict: [['loose', 'forgiving (typos fine)'], ['normal', 'normal'], ['strict', 'strict']],
  };

  const SKIP_MS = 10000; // how far the forward button jumps into the track

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? Object.assign({}, fallback, JSON.parse(raw)) : Object.assign({}, fallback);
    } catch (error) {
      return Object.assign({}, fallback);
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* private mode, quota, ... - practice still works, it just forgets */
    }
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const optionsHtml = (items, selected) =>
    items
      .map(
        ([value, label]) =>
          `<option value="${value}"${String(value) === String(selected) ? ' selected' : ''}>${label}</option>`
      )
      .join('');

  const pct = (hits, asked) => (asked ? Math.round((hits / asked) * 100) + '%' : '-');

  const trackUrl = (uri) => 'https://open.spotify.com/track/' + String(uri).split(':').pop();

  window.HitsterPractice = {
    open() {
      const H = window.Hitster;
      const cfg = read(STORE.cfg, DEFAULT_CFG);
      let stats = read(STORE.stats, EMPTY_STATS);

      let playback = null;
      let deck = [];
      const unplayable = new Set(); // songs this account cannot stream
      let current = null; // { song, uri, durationMs }
      let startMs = 0;
      let clipDone = false; // the clip ran out, so play should restart it
      let revealed = false;
      let busy = false;
      let poll = 0;
      let polling = false;

      // The keypress that launched the overlay is still propagating towards
      // the document when this listener goes up, and Enter is what starts the
      // game from the terminal - without this it would also submit round one.
      const openedAt = performance.now();

      const root = el('div', 'hitster-root hitster-practice-root');
      root.tabIndex = -1;
      document.body.appendChild(root);
      if (window.Starfield) window.Starfield.pause();

      root.innerHTML = `
        <div class="hitster-shell">
          <header class="hitster-head">
            <h1>hitster practice</h1>
            <button class="hitster-quit" data-act="close">close</button>
          </header>

          <div class="hitster-stage">
            <div class="hitster-disc" data-el="disc"></div>
            <div class="hitster-transport">
              <button class="hitster-primary" data-act="play">play track</button>
              <div class="hitster-controls">
                <button class="hitster-mini" data-act="replay">restart</button>
                <button class="hitster-mini" data-act="forward">+10s</button>
                <button class="hitster-mini" data-act="skip">skip track</button>
              </div>
              <label class="hitster-volume">
                <span>volume</span>
                <input type="range" min="0" max="100" step="1" data-el="volume" aria-label="Volume">
              </label>
            </div>
          </div>
          <div class="hitster-bar"><i data-el="progress"></i></div>
          <p class="hitster-status" data-el="status">Connecting to Spotify...</p>
          <p class="hitster-hint">Round <b data-el="round">1</b> - <span data-el="pool">building the deck</span>. Nothing is shown, you only hear the track.</p>

          <div data-el="guessBox">
            <div class="hitster-fields">
              <label class="hitster-field" data-field="year">
                <span>Year</span>
                <input class="hitster-input" data-el="year" type="number" min="1900" max="2030" inputmode="numeric" placeholder="19??">
              </label>
              <label class="hitster-field" data-field="artist">
                <span>Artist</span>
                <input class="hitster-input" data-el="artist" type="text" autocomplete="off" placeholder="who is this?">
              </label>
              <label class="hitster-field" data-field="title">
                <span>Title</span>
                <input class="hitster-input" data-el="title" type="text" autocomplete="off" placeholder="what is it called?">
              </label>
            </div>
            <div class="hitster-controls hitster-actions">
              <button class="hitster-primary" data-act="check">check answer</button>
              <button class="hitster-mini" data-act="giveup">reveal</button>
              <span class="hitster-hint">enter checks, then draws the next track</span>
            </div>
          </div>

          <div class="hitster-reveal" data-el="resultBox" hidden>
            <div class="hitster-lines" data-el="lines"></div>
            <div class="hitster-links" data-el="links"></div>
            <div class="hitster-controls hitster-actions">
              <button class="hitster-primary" data-act="next">next track</button>
              <span class="hitster-hint" data-el="roundScore"></span>
            </div>
          </div>

          <div class="hitster-tiles">
            <div><b data-el="sRounds">0</b><small>rounds</small></div>
            <div><b data-el="sYear">-</b><small>year</small></div>
            <div><b data-el="sArtist">-</b><small>artist</small></div>
            <div><b data-el="sTitle">-</b><small>title</small></div>
          </div>
          <div class="hitster-tally">
            <span class="hitster-hint">points <b data-el="sPoints">0</b> - streak <b data-el="sStreak">0</b> (best <b data-el="sBest">0</b>)</span>
            <button class="hitster-mini" data-act="reset">reset stats</button>
          </div>

          <details class="hitster-settings">
            <summary>settings</summary>
            <div class="hitster-setgrid">
              <label class="hitster-field"><span>A year counts when it is</span>
                <select class="hitster-input" data-cfg="tolerance">${optionsHtml(OPTIONS.tolerance, cfg.tolerance)}</select>
              </label>
              <label class="hitster-field"><span>Playback stops after</span>
                <select class="hitster-input" data-cfg="clip">${optionsHtml(OPTIONS.clip, cfg.clip)}</select>
              </label>
              <label class="hitster-field"><span>Playback starts at</span>
                <select class="hitster-input" data-cfg="start">${optionsHtml(OPTIONS.start, cfg.start)}</select>
              </label>
              <label class="hitster-field"><span>Years in the deck</span>
                <select class="hitster-input" data-cfg="era">${optionsHtml(OPTIONS.era, cfg.era)}</select>
              </label>
              <label class="hitster-field"><span>Spelling tolerance</span>
                <select class="hitster-input" data-cfg="strict">${optionsHtml(OPTIONS.strict, cfg.strict)}</select>
              </label>
              <div class="hitster-field">
                <span>Ask me for</span>
                <div class="hitster-checks">
                  <label><input type="checkbox" data-cfg="askYear"> year</label>
                  <label><input type="checkbox" data-cfg="askArtist"> artist</label>
                  <label><input type="checkbox" data-cfg="askTitle"> title</label>
                </div>
              </div>
            </div>
          </details>
        </div>`;

      const q = (name) => root.querySelector(`[data-el="${name}"]`);
      const act = (name) => root.querySelector(`[data-act="${name}"]`);
      const fields = { year: q('year'), artist: q('artist'), title: q('title') };
      const asked = () => ({ year: cfg.askYear, artist: cfg.askArtist, title: cfg.askTitle });

      // --- shell -------------------------------------------------------------

      const setStatus = (message, isError) => {
        const node = q('status');
        node.textContent = message || '';
        node.classList.toggle('is-error', Boolean(isError));
      };

      const setProgress = (ratio) => {
        q('progress').style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
      };

      const setPlayLabel = (text) => {
        act('play').textContent = text;
      };

      const setSpinning = (on) => {
        q('disc').classList.toggle('is-spinning', on);
      };

      const enableTransport = (on) => {
        ['play', 'replay', 'forward', 'skip', 'check', 'giveup'].forEach((name) => {
          act(name).disabled = !on;
        });
      };

      const close = () => {
        stopWatch();
        if (playback) {
          playback.player.pause().catch(() => {});
          playback.player.disconnect();
          playback = null;
        }
        root.remove();
        document.removeEventListener('keydown', onKey);
        if (window.Starfield) window.Starfield.resume();
      };

      const fatal = (message) => {
        stopWatch();
        setSpinning(false);
        enableTransport(false);
        act('next').disabled = true;
        setStatus(message, true);
      };

      // --- playback ----------------------------------------------------------

      const clipMs = () => cfg.clip * 1000;

      /** Random mode drops you somewhere in the body of the track. */
      const pickStart = (track) => {
        if (cfg.start !== 'random' || !track.durationMs) return 0;
        const latest = Math.max(0, track.durationMs - 45000);
        const earliest = Math.min(20000, latest);
        if (latest <= earliest) return earliest;
        return earliest + Math.floor(Math.random() * (latest - earliest));
      };

      const stopWatch = () => {
        if (poll) {
          clearInterval(poll);
          poll = 0;
        }
      };

      /**
       * The SDK has no "stop after n seconds", so the clip is cut by polling
       * the player position. 200ms is close enough to feel exact and cheap
       * enough to leave running.
       */
      const startWatch = () => {
        stopWatch();
        poll = setInterval(async () => {
          if (!playback || polling) return;
          polling = true;
          try {
            const state = await playback.player.getCurrentState();
            if (!state) return; // another device took playback over
            setSpinning(!state.paused);
            const limit = clipMs();
            if (limit > 0) {
              const heard = Math.max(0, state.position - startMs);
              setProgress(heard / limit);
              if (heard >= limit) {
                clipDone = true;
                stopWatch(); // nothing left to watch, so clear the disc here
                setSpinning(false);
                setProgress(1);
                await playback.player.pause().catch(() => {});
                setPlayLabel('play again');
              }
            } else {
              setProgress(state.duration ? state.position / state.duration : 0);
            }
          } finally {
            polling = false;
          }
        }, 200);
      };

      /** Starts the mystery track from the round's starting point. */
      const play = async () => {
        if (!playback || !current) return;
        clipDone = false;
        setProgress(0);
        try {
          await H.playTrack(playback.deviceId, current.uri, startMs);
          setStatus('');
          setPlayLabel('pause');
          startWatch();
        } catch (error) {
          setSpinning(false);
          setPlayLabel('play track');
          setStatus(`${error.message}. Press restart to try again.`, true);
        }
      };

      /**
       * Jumps further into the track. The clip window restarts at the new
       * spot, so the skip buys you a fresh listen rather than eating into the
       * seconds you had left.
       */
      const skipForward = async () => {
        if (!playback || !current) return;
        try {
          const state = await playback.player.getCurrentState();
          const from = state ? state.position : startMs;
          const duration = (state && state.duration) || current.durationMs || 0;
          let target = from + SKIP_MS;
          if (duration) target = Math.min(target, Math.max(0, duration - 2000));
          await playback.player.seek(target);
          startMs = target;
          clipDone = false;
          setProgress(0);
          if (!state || state.paused) await playback.player.resume().catch(() => {});
          setSpinning(true);
          setPlayLabel('pause');
          startWatch();
        } catch (error) {
          setStatus('Could not skip forward in this track.', true);
        }
      };

      const setVolume = (percent) => {
        cfg.volume = Math.max(0, Math.min(100, parseInt(percent, 10) || 0));
        if (playback) playback.player.setVolume(cfg.volume / 100).catch(() => {});
      };

      const toggle = async () => {
        if (!playback || !current) return;
        const state = await playback.player.getCurrentState();
        if (!state || clipDone) {
          await play();
          return;
        }
        if (state.paused) {
          await playback.player.resume().catch(() => {});
          setPlayLabel('pause');
          startWatch();
        } else {
          await playback.player.pause().catch(() => {});
          setPlayLabel('resume');
          stopWatch();
          setSpinning(false);
        }
      };

      // --- deck --------------------------------------------------------------

      const buildDeck = () => {
        const inEra = ERAS[cfg.era] || ERAS.all;
        const pool = H.SONGS.filter((song) => inEra(song) && !unplayable.has(song.title + song.artist));
        deck = H.shuffle(pool);
        q('pool').textContent = `${pool.length} tracks in the deck`;
        return pool.length;
      };

      /** Draws until Spotify hands back something this account can stream. */
      const drawTrack = async () => {
        for (let attempt = 0; attempt < 12; attempt++) {
          if (!deck.length && !buildDeck()) return null;
          const song = deck.pop();
          if (!song) return null;
          const track = await H.findTrack(song);
          if (track) return { song, uri: track.uri, durationMs: track.durationMs };
          unplayable.add(song.title + song.artist);
        }
        return null;
      };

      // --- rounds ------------------------------------------------------------

      const applyFieldToggles = () => {
        const want = asked();
        Object.keys(fields).forEach((name) => {
          const input = fields[name];
          input.disabled = !want[name];
          input.closest('.hitster-field').classList.toggle('is-off', !want[name]);
        });
      };

      const focusFirstField = () => {
        const want = asked();
        const first = ['year', 'artist', 'title'].find((name) => want[name]);
        if (first) fields[first].focus();
      };

      const nextRound = async () => {
        if (busy) return;
        busy = true;
        revealed = false;
        stopWatch();
        setSpinning(false);
        setProgress(0);
        setPlayLabel('play track');
        q('resultBox').hidden = true;
        q('guessBox').hidden = false;
        q('round').textContent = String(stats.rounds + 1);
        Object.keys(fields).forEach((name) => {
          fields[name].value = '';
        });
        applyFieldToggles();
        enableTransport(false);
        setStatus('Looking up the next track...');

        const track = await drawTrack();
        if (!track) {
          fatal('No playable tracks left for this filter. Widen the year range in the settings.');
          busy = false;
          return;
        }
        current = track;
        startMs = pickStart(track);
        enableTransport(true);
        setStatus('');
        busy = false;
        await play();
        focusFirstField();
      };

      const line = (verdict, label, answer, guess, mark) => {
        const row = el('div', `hitster-line is-${verdict}`);
        row.appendChild(el('span', 'hitster-line-key', label));
        const body = el('span', 'hitster-line-body');
        body.appendChild(el('span', 'hitster-line-answer', answer));
        body.appendChild(el('span', 'hitster-line-guess', `your answer: ${guess || '-'}`));
        row.appendChild(body);
        row.appendChild(el('span', 'hitster-line-mark', mark));
        return row;
      };

      const renderStats = () => {
        q('sRounds').textContent = String(stats.rounds);
        q('sYear').textContent = pct(stats.year, stats.askedYear);
        q('sArtist').textContent = pct(stats.artist, stats.askedArtist);
        q('sTitle').textContent = pct(stats.title, stats.askedTitle);
        q('sPoints').textContent = String(stats.points);
        q('sStreak').textContent = String(stats.streak);
        q('sBest').textContent = String(stats.best);
      };

      const check = async (giveUp) => {
        if (!current || revealed || busy) return;
        revealed = true;
        stopWatch();
        setSpinning(false);
        if (playback) await playback.player.pause().catch(() => {});
        setPlayLabel('play track');

        const song = current.song;
        const want = asked();
        const lines = q('lines');
        lines.innerHTML = '';
        let points = 0;
        let max = 0;

        if (want.year) {
          max++;
          stats.askedYear++;
          const guess = parseInt(fields.year.value, 10);
          const off = Number.isNaN(guess) ? null : Math.abs(guess - song.year);
          const hit = !giveUp && off !== null && off <= cfg.tolerance;
          if (hit) {
            stats.year++;
            points++;
          }
          const shown = Number.isNaN(guess)
            ? ''
            : guess + (off ? ` (${guess > song.year ? '+' : '-'}${off})` : '');
          lines.appendChild(
            line(hit ? (off === 0 ? 'good' : 'near') : 'bad', 'year', String(song.year), shown,
              hit ? (off === 0 ? 'exact' : 'close enough') : 'missed')
          );
        }
        if (want.artist) {
          max++;
          stats.askedArtist++;
          const hit = !giveUp && H.artistMatches(fields.artist.value, song.artist, cfg.strict);
          if (hit) {
            stats.artist++;
            points++;
          }
          lines.appendChild(
            line(hit ? 'good' : 'bad', 'artist', song.artist, fields.artist.value.trim(), hit ? 'right' : 'missed')
          );
        }
        if (want.title) {
          max++;
          stats.askedTitle++;
          const hit = !giveUp && H.isCloseEnough(fields.title.value, song.title, cfg.strict);
          if (hit) {
            stats.title++;
            points++;
          }
          lines.appendChild(
            line(hit ? 'good' : 'bad', 'title', song.title, fields.title.value.trim(), hit ? 'right' : 'missed')
          );
        }

        stats.rounds++;
        stats.points += points;
        if (max > 0 && points === max) {
          stats.streak++;
          if (stats.streak > stats.best) stats.best = stats.streak;
        } else {
          stats.streak = 0;
        }
        write(STORE.stats, stats);
        renderStats();

        const links = q('links');
        links.innerHTML = '';
        const spotify = el('a', null, 'open in Spotify');
        spotify.href = trackUrl(current.uri);
        spotify.target = '_blank';
        spotify.rel = 'noopener';
        const lookup = el('a', null, 'look it up');
        lookup.href = 'https://www.google.com/search?q=' + encodeURIComponent(`${song.artist} ${song.title}`);
        lookup.target = '_blank';
        lookup.rel = 'noopener';
        links.append(spotify, lookup);

        q('roundScore').textContent = `${points} / ${max} points`;
        q('guessBox').hidden = true;
        q('resultBox').hidden = false;
        act('next').disabled = false;
        act('next').focus();
      };

      // --- wiring ------------------------------------------------------------

      act('close').addEventListener('click', close);
      act('play').addEventListener('click', toggle);
      act('replay').addEventListener('click', play);
      act('forward').addEventListener('click', skipForward);
      act('skip').addEventListener('click', () => nextRound()); // no score either way
      act('check').addEventListener('click', () => check(false));
      act('giveup').addEventListener('click', () => check(true));
      act('next').addEventListener('click', () => nextRound());
      act('reset').addEventListener('click', () => {
        if (!window.confirm('Reset the practice statistics?')) return;
        stats = Object.assign({}, EMPTY_STATS);
        write(STORE.stats, stats);
        renderStats();
        q('round').textContent = String(stats.rounds + 1);
      });

      const volume = q('volume');
      volume.value = String(cfg.volume);
      volume.addEventListener('input', () => setVolume(volume.value));
      // Dragging fires a stream of input events; only persist once it settles.
      volume.addEventListener('change', () => write(STORE.cfg, cfg));

      root.querySelectorAll('[data-cfg]').forEach((input) => {
        const key = input.dataset.cfg;
        if (input.type === 'checkbox') input.checked = Boolean(cfg[key]);
        input.addEventListener('change', () => {
          if (input.type === 'checkbox') {
            cfg[key] = input.checked;
            applyFieldToggles();
          } else if (key === 'tolerance' || key === 'clip') {
            cfg[key] = parseInt(input.value, 10);
          } else {
            cfg[key] = input.value;
          }
          write(STORE.cfg, cfg);
          // A narrower deck only takes effect from the next draw on, which
          // keeps the round in progress intact.
          if (key === 'era') buildDeck();
        });
      });

      const onKey = (event) => {
        if (event.timeStamp && event.timeStamp < openedAt) return;
        if (event.key === 'Escape') {
          close();
          return;
        }
        // Tab belongs to the three guess fields: once you are in them it
        // cycles between the ones being asked for and never leaves.
        if (event.key === 'Tab') {
          const want = asked();
          const order = ['year', 'artist', 'title'].filter((name) => want[name]);
          const at = order.indexOf((document.activeElement.dataset || {}).el);
          if (at !== -1) {
            event.preventDefault();
            const step = event.shiftKey ? -1 : 1;
            fields[order[(at + step + order.length) % order.length]].focus();
          }
          return;
        }
        const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
        if (event.key === 'Enter') {
          if (revealed) {
            event.preventDefault();
            nextRound();
          } else if (typing && root.contains(document.activeElement)) {
            event.preventDefault();
            check(false);
          }
          return;
        }
        if (event.key === ' ' && !typing) {
          event.preventDefault();
          toggle();
        }
      };
      document.addEventListener('keydown', onKey);

      // --- start -------------------------------------------------------------

      const start = async () => {
        applyFieldToggles();
        renderStats();
        enableTransport(false);
        act('next').disabled = true;

        if (!H.getClientId()) {
          fatal('Spotify client id missing. In the terminal run: hitster setup YOUR_CLIENT_ID');
          return;
        }
        if (!H.hasToken()) {
          setStatus('Sending you to Spotify to log in...');
          H.stashSetup({ mode: 'practice' });
          H.beginAuth();
          return;
        }
        try {
          playback = await H.createPlayer((event, message) => {
            if (event === 'account_error') {
              fatal('Spotify says this account is not Premium. The Web Playback SDK needs Premium to stream.');
            } else if (event === 'authentication_error') {
              H.logout();
              fatal(`Spotify auth failed: ${message}. Reload and run hitster practice again.`);
            }
          });
        } catch (error) {
          fatal(`Could not start the Spotify player: ${error.message}`);
          return;
        }
        playback.player.setVolume(cfg.volume / 100).catch(() => {});
        buildDeck();
        await nextRound();
      };

      start();
    },
  };
})();
