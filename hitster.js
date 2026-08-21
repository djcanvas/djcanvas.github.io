/**
 * Hitster-style music guessing game for the terminal.
 *
 * Tracks stream from Spotify through the Web Playback SDK, so playing requires
 * a Spotify Premium account (the SDK refuses free accounts) and a one-time
 * client id from developer.spotify.com. Auth uses the Authorization Code +
 * PKCE flow, which needs no client secret and therefore works on static
 * hosting like GitHub Pages.
 *
 * The track table below is curated by hand because Spotify's album release
 * dates point at remasters and compilations far more often than at the
 * original release, which makes them useless for scoring the year.
 */
(function () {
  'use strict';

  // Source of truth for scoring. Spotify is only ever asked for the audio.
  const SONGS = [
    { title: 'Hey Jude', artist: 'The Beatles', year: 1968 },
    { title: '(I Can\'t Get No) Satisfaction', artist: 'The Rolling Stones', year: 1965 },
    { title: 'Good Vibrations', artist: 'The Beach Boys', year: 1966 },
    { title: 'Purple Haze', artist: 'Jimi Hendrix', year: 1967 },
    { title: 'Light My Fire', artist: 'The Doors', year: 1967 },
    { title: 'Respect', artist: 'Aretha Franklin', year: 1967 },
    { title: 'Fortunate Son', artist: 'Creedence Clearwater Revival', year: 1969 },
    { title: 'Let It Be', artist: 'The Beatles', year: 1970 },
    { title: 'Stairway to Heaven', artist: 'Led Zeppelin', year: 1971 },
    { title: 'Imagine', artist: 'John Lennon', year: 1971 },
    { title: 'Bohemian Rhapsody', artist: 'Queen', year: 1975 },
    { title: 'Hotel California', artist: 'Eagles', year: 1976 },
    { title: 'Dancing Queen', artist: 'ABBA', year: 1976 },
    { title: 'Go Your Own Way', artist: 'Fleetwood Mac', year: 1976 },
    { title: 'Stayin\' Alive', artist: 'Bee Gees', year: 1977 },
    { title: 'Heroes', artist: 'David Bowie', year: 1977 },
    { title: 'I Feel Love', artist: 'Donna Summer', year: 1977 },
    { title: 'Das Model', artist: 'Kraftwerk', year: 1978 },
    { title: 'Le Freak', artist: 'Chic', year: 1978 },
    { title: 'Another Brick in the Wall, Part 2', artist: 'Pink Floyd', year: 1979 },
    { title: 'London Calling', artist: 'The Clash', year: 1979 },
    { title: 'Don\'t Stop Believin\'', artist: 'Journey', year: 1981 },
    { title: 'Africa', artist: 'Toto', year: 1982 },
    { title: 'Billie Jean', artist: 'Michael Jackson', year: 1982 },
    { title: 'Blue Monday', artist: 'New Order', year: 1983 },
    { title: 'Every Breath You Take', artist: 'The Police', year: 1983 },
    { title: 'Girls Just Want to Have Fun', artist: 'Cyndi Lauper', year: 1983 },
    { title: '99 Luftballons', artist: 'Nena', year: 1983 },
    { title: 'Purple Rain', artist: 'Prince', year: 1984 },
    { title: 'Like a Virgin', artist: 'Madonna', year: 1984 },
    { title: 'Männer', artist: 'Herbert Grönemeyer', year: 1984 },
    { title: 'Take On Me', artist: 'a-ha', year: 1985 },
    { title: 'Everybody Wants to Rule the World', artist: 'Tears for Fears', year: 1985 },
    { title: 'Rock Me Amadeus', artist: 'Falco', year: 1985 },
    { title: 'Livin\' on a Prayer', artist: 'Bon Jovi', year: 1986 },
    { title: 'Sweet Child o\' Mine', artist: 'Guns N\' Roses', year: 1987 },
    { title: 'I Wanna Dance with Somebody', artist: 'Whitney Houston', year: 1987 },
    { title: 'Never Gonna Give You Up', artist: 'Rick Astley', year: 1987 },
    { title: 'Westerland', artist: 'Die Ärzte', year: 1988 },
    { title: 'Enjoy the Silence', artist: 'Depeche Mode', year: 1990 },
    { title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: 1991 },
    { title: 'Under the Bridge', artist: 'Red Hot Chili Peppers', year: 1991 },
    { title: 'Creep', artist: 'Radiohead', year: 1992 },
    { title: 'I Will Always Love You', artist: 'Whitney Houston', year: 1992 },
    { title: 'Nuthin\' but a G Thang', artist: 'Dr. Dre', year: 1992 },
    { title: 'California Love', artist: '2Pac', year: 1995 },
    { title: 'Wonderwall', artist: 'Oasis', year: 1995 },
    { title: 'You Oughta Know', artist: 'Alanis Morissette', year: 1995 },
    { title: 'Wannabe', artist: 'Spice Girls', year: 1996 },
    { title: 'Bitter Sweet Symphony', artist: 'The Verve', year: 1997 },
    { title: 'My Heart Will Go On', artist: 'Celine Dion', year: 1997 },
    { title: 'Around the World', artist: 'Daft Punk', year: 1997 },
    { title: 'Du Hast', artist: 'Rammstein', year: 1997 },
    { title: '...Baby One More Time', artist: 'Britney Spears', year: 1998 },
    { title: 'Believe', artist: 'Cher', year: 1998 },
    { title: 'I Want It That Way', artist: 'Backstreet Boys', year: 1999 },
    { title: 'No Scrubs', artist: 'TLC', year: 1999 },
    { title: 'My Name Is', artist: 'Eminem', year: 1999 },
    { title: 'Yellow', artist: 'Coldplay', year: 2000 },
    { title: 'In the End', artist: 'Linkin Park', year: 2001 },
    { title: 'Lose Yourself', artist: 'Eminem', year: 2002 },
    { title: 'Hot in Herre', artist: 'Nelly', year: 2002 },
    { title: 'Hey Ya!', artist: 'OutKast', year: 2003 },
    { title: 'Crazy in Love', artist: 'Beyonce', year: 2003 },
    { title: 'Seven Nation Army', artist: 'The White Stripes', year: 2003 },
    { title: 'Mr. Brightside', artist: 'The Killers', year: 2004 },
    { title: 'Take Me Out', artist: 'Franz Ferdinand', year: 2004 },
    { title: 'Feel Good Inc.', artist: 'Gorillaz', year: 2005 },
    { title: 'I Bet You Look Good on the Dancefloor', artist: 'Arctic Monkeys', year: 2005 },
    { title: 'Crazy', artist: 'Gnarls Barkley', year: 2006 },
    { title: 'Rehab', artist: 'Amy Winehouse', year: 2006 },
    { title: 'Umbrella', artist: 'Rihanna', year: 2007 },
    { title: 'Stronger', artist: 'Kanye West', year: 2007 },
    { title: 'Poker Face', artist: 'Lady Gaga', year: 2008 },
    { title: 'Rolling in the Deep', artist: 'Adele', year: 2010 },
    { title: 'Somebody That I Used to Know', artist: 'Gotye', year: 2011 },
    { title: 'Let Her Go', artist: 'Passenger', year: 2012 },
    { title: 'Thrift Shop', artist: 'Macklemore', year: 2012 },
    { title: 'Easy', artist: 'Cro', year: 2012 },
    { title: 'Get Lucky', artist: 'Daft Punk', year: 2013 },
    { title: 'Happy', artist: 'Pharrell Williams', year: 2013 },
    { title: 'Royals', artist: 'Lorde', year: 2013 },
    { title: 'Wake Me Up', artist: 'Avicii', year: 2013 },
    { title: 'Uptown Funk', artist: 'Mark Ronson', year: 2014 },
    { title: 'Hotline Bling', artist: 'Drake', year: 2015 },
    { title: 'Barfuß am Klavier', artist: 'AnnenMayKantereit', year: 2016 },
    { title: 'Shape of You', artist: 'Ed Sheeran', year: 2017 },
    { title: 'Despacito', artist: 'Luis Fonsi', year: 2017 },
    { title: 'Rockstar', artist: 'Post Malone', year: 2017 },
    { title: 'New Rules', artist: 'Dua Lipa', year: 2017 },
    { title: 'Old Town Road', artist: 'Lil Nas X', year: 2019 },
    { title: 'Blinding Lights', artist: 'The Weeknd', year: 2019 },
    { title: 'Bad Guy', artist: 'Billie Eilish', year: 2019 },
    { title: 'Levitating', artist: 'Dua Lipa', year: 2020 },
    { title: 'Drivers License', artist: 'Olivia Rodrigo', year: 2021 },
    { title: 'As It Was', artist: 'Harry Styles', year: 2022 },
    { title: 'Flowers', artist: 'Miley Cyrus', year: 2023 },
  ];

  const AUTH_HOST = 'https://accounts.spotify.com';
  const API_HOST = 'https://api.spotify.com/v1';
  const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
  const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';

  const STORE = {
    clientId: 'hitster.clientId',
    verifier: 'hitster.pkceVerifier',
    token: 'hitster.token',
    pendingSetup: 'hitster.pendingSetup',
  };

  /** Fold to a shape that survives typos, casing, punctuation and umlauts. */
  const normalize = (value) =>
    String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ') // "(Remastered)", "[Live]" ...
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^the\s+/, '');

  const levenshtein = (a, b) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const curr = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = curr;
    }
    return prev[b.length];
  };

  /**
   * Typo tolerance scaled to the length of the expected answer. Practice mode
   * lets the player pick how forgiving that is; the game itself stays on
   * 'normal', which is what the numbers below were tuned for.
   */
  const TOLERANCE = {
    strict: () => 0,
    normal: (len) => (len >= 12 ? 3 : len >= 8 ? 2 : len >= 5 ? 1 : 0),
    loose: (len) => (len >= 12 ? 5 : len >= 8 ? 3 : len >= 5 ? 2 : 1),
  };

  const isCloseEnough = (guess, answer, mode) => {
    const g = normalize(guess);
    const a = normalize(answer);
    if (!g || !a) return false;
    if (g === a) return true;
    // Half an answer counts when the player asked for a forgiving check, so
    // "bohemian" passes for "Bohemian Rhapsody".
    if (mode === 'loose' && g.length >= 5 && (a.includes(g) || g.includes(a))) return true;
    const scale = TOLERANCE[mode] || TOLERANCE.normal;
    return levenshtein(g, a) <= scale(a.length);
  };

  /** "Mark Ronson feat. Bruno Mars" also accepts just "Mark Ronson". */
  const artistVariants = (artist) =>
    artist
      .split(/\s+(?:feat\.?|ft\.?|featuring|and|x|vs\.?)\s+|[,&]/i)
      .map((part) => part.trim())
      .filter(Boolean)
      .concat(artist);

  const artistMatches = (guess, artist, mode) =>
    artistVariants(artist).some((variant) => isCloseEnough(guess, variant, mode));

  const shuffle = (items) => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // --- Auth (Authorization Code + PKCE) -------------------------------------

  const redirectUri = () => window.location.origin + window.location.pathname;

  const base64url = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const randomVerifier = () => {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
  };

  const challengeFor = async (verifier) =>
    base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));

  const getClientId = () => localStorage.getItem(STORE.clientId) || '';
  const setClientId = (id) => localStorage.setItem(STORE.clientId, id.trim());

  const readToken = () => {
    try {
      return JSON.parse(localStorage.getItem(STORE.token) || 'null');
    } catch (error) {
      return null;
    }
  };

  const writeToken = (payload) => {
    localStorage.setItem(
      STORE.token,
      JSON.stringify({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token || (readToken() || {}).refresh_token,
        expires_at: Date.now() + (payload.expires_in || 3600) * 1000,
      })
    );
  };

  const postToken = async (params) => {
    const response = await fetch(`${AUTH_HOST}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    if (!response.ok) throw new Error(`token request failed (${response.status})`);
    return response.json();
  };

  /** Sends the browser to Spotify's consent screen; the page unloads here. */
  const beginAuth = async () => {
    const clientId = getClientId();
    const verifier = randomVerifier();
    sessionStorage.setItem(STORE.verifier, verifier);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: await challengeFor(verifier),
      scope: SCOPES,
    });
    window.location.assign(`${AUTH_HOST}/authorize?${params}`);
  };

  const isAuthCallback = () => new URLSearchParams(window.location.search).has('code');

  const completeAuthCallback = async () => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get('code');
    const verifier = sessionStorage.getItem(STORE.verifier);
    // Strip the code from the address bar either way so a reload cannot replay it.
    window.history.replaceState({}, document.title, redirectUri());
    sessionStorage.removeItem(STORE.verifier);
    if (!code || !verifier) return { ok: false, error: 'missing authorization code' };
    try {
      writeToken(
        await postToken({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri(),
          client_id: getClientId(),
          code_verifier: verifier,
        })
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };

  const validAccessToken = async () => {
    const token = readToken();
    if (!token) return null;
    if (Date.now() < token.expires_at - 60000) return token.access_token;
    if (!token.refresh_token) return null;
    try {
      const refreshed = await postToken({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
        client_id: getClientId(),
      });
      writeToken(refreshed);
      return refreshed.access_token;
    } catch (error) {
      localStorage.removeItem(STORE.token);
      return null;
    }
  };

  // --- Playback -------------------------------------------------------------

  let sdkPromise = null;
  const loadSdk = () => {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      if (window.Spotify) return resolve();
      window.onSpotifyWebPlaybackSDKReady = resolve;
      const script = document.createElement('script');
      script.src = SDK_SRC;
      script.onerror = () => reject(new Error('could not load the Spotify SDK'));
      document.head.appendChild(script);
    });
    return sdkPromise;
  };

  /** Connects a player and resolves once Spotify hands us a device id. */
  const createPlayer = async (onFatal) => {
    await loadSdk();
    const player = new window.Spotify.Player({
      name: 'hitster terminal',
      volume: 0.7,
      getOAuthToken: (cb) => {
        validAccessToken().then((token) => token && cb(token));
      },
    });
    ['initialization_error', 'authentication_error', 'account_error', 'playback_error'].forEach(
      (event) => player.addListener(event, ({ message }) => onFatal(event, message))
    );
    const deviceId = await new Promise((resolve, reject) => {
      player.addListener('ready', ({ device_id }) => resolve(device_id));
      player.connect().then((ok) => {
        if (!ok) reject(new Error('the Spotify player refused to connect'));
      });
      setTimeout(() => reject(new Error('the Spotify player timed out')), 15000);
    });
    return { player, deviceId };
  };

  const api = async (path, options = {}) => {
    const token = await validAccessToken();
    if (!token) throw new Error('not authenticated');
    return fetch(`${API_HOST}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
  };

  /**
   * Resolves a curated entry to a playable Spotify track, or null if the
   * catalogue here has no match. The duration comes along because practice
   * mode needs it to pick a random starting point inside the track.
   */
  const findTrack = async (song) => {
    const query = encodeURIComponent(`track:${song.title} artist:${song.artist}`);
    try {
      const response = await api(`/search?q=${query}&type=track&limit=8`);
      if (!response.ok) return null;
      const items = ((await response.json()).tracks || {}).items || [];
      const hit = items.find((track) =>
        (track.artists || []).some((a) => artistMatches(a.name, song.artist))
      );
      return hit ? { uri: hit.uri, durationMs: hit.duration_ms || 0 } : null;
    } catch (error) {
      return null;
    }
  };

  const findTrackUri = async (song) => {
    const track = await findTrack(song);
    return track ? track.uri : null;
  };

  // --- Public surface -------------------------------------------------------

  window.Hitster = {
    SONGS,
    // audio
    createPlayer,
    findTrack,
    findTrackUri,
    api,
    // answer matching
    isCloseEnough,
    artistMatches,
    shuffle,
    // auth
    getClientId,
    setClientId,
    beginAuth,
    isAuthCallback,
    completeAuthCallback,
    hasToken: () => Boolean(readToken()),
    logout: () => {
      localStorage.removeItem(STORE.token);
      localStorage.removeItem(STORE.pendingSetup);
    },
    /** Setup config parked across the OAuth redirect. */
    stashSetup: (setup) => localStorage.setItem(STORE.pendingSetup, JSON.stringify(setup)),
    consumeSetup: () => {
      const raw = localStorage.getItem(STORE.pendingSetup);
      localStorage.removeItem(STORE.pendingSetup);
      try {
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return null;
      }
    },
  };
})();
