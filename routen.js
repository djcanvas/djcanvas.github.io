/**
 * routen: take a planned route from Komoot, Strava or Google Maps and either
 * download it as GPX or carry it over to one of the other two platforms.
 *
 * Everything runs in the browser, the site has no backend. That shapes what is
 * possible per source:
 *
 *   Komoot       tours are read from the komoot API, or from the JSON that the
 *                tour page embeds. Komoot sends no CORS headers for foreign
 *                sites, so the direct request usually fails and the same URLs
 *                are retried through public CORS relays. share links carry a
 *                share_token that also unlocks private tours. If everything
 *                fails we fall back to komoot's own GPX export and the drop
 *                zone below.
 *   Strava       has no public route endpoint, so the GPX comes from Strava's
 *                own export URL (works when the user is logged in there) and is
 *                then dropped into this tool to continue.
 *   Google Maps  a directions link only carries the waypoints, not the drawn
 *                line. We pull the coordinates out of the URL (and geocode
 *                place names via Nominatim when the URL has none) and hand the
 *                waypoints on; Komoot re-routes between them on import.
 *
 * Targets: a generated GPX file, komoot.com/upload, Strava's route builder and
 * a Google Maps directions link built from the route's waypoints.
 */
(function () {
  'use strict';

  const KOMOOT_API = 'https://api.komoot.de/v007/tours/';
  const KOMOOT_WWW_API = 'https://www.komoot.com/api/v007/tours/';
  const KOMOOT_UPLOAD = 'https://www.komoot.com/upload';
  const STRAVA_ROUTE_BUILDER = 'https://www.strava.com/routes/new';
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const NOMINATIM_GAP_MS = 1100; // usage policy: at most one request per second

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // --- link parsing ---------------------------------------------------------

  const KOMOOT_RE = /komoot\.(?:com|de|[a-z]{2})\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:smart)?tour\/(\d+)/i;
  const STRAVA_RE = /strava\.com\/(routes|activities)\/(\d+)/i;
  const GMAPS_SHORT_RE = /^(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i;
  const GMAPS_RE = /(?:^|\.)google\.[a-z.]+\/maps|^maps\.google\./i;
  const LATLNG_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

  const normalizeUrl = (text) => {
    let raw = String(text || '').trim();
    if (!raw) return null;
    // People paste the link together with a title or a trailing period.
    const match = raw.match(/https?:\/\/\S+/i);
    if (match) raw = match[0].replace(/[).,;]+$/, '');
    else if (!/^[a-z]+:\/\//i.test(raw)) raw = `https://${raw}`;
    try {
      return new URL(raw);
    } catch (error) {
      return null;
    }
  };

  const GOOGLE_MODES = { 0: 'driving', 1: 'bicycling', 2: 'walking', 3: 'transit' };

  /** A waypoint is either a "lat,lng" pair or a place name to geocode later. */
  const toWaypoint = (text) => {
    const coords = LATLNG_RE.exec(text);
    if (coords) {
      return { lat: Number(coords[1]), lng: Number(coords[2]), name: '' };
    }
    return { lat: null, lng: null, name: text.trim() };
  };

  const parseGoogleMaps = (url) => {
    const params = url.searchParams;
    let waypoints = [];
    let mode = null;
    let ownLocation = false;

    if (params.get('api') === '1' || params.has('origin') || params.has('destination')) {
      const stops = [params.get('origin')];
      (params.get('waypoints') || '').split('|').forEach((w) => stops.push(w));
      stops.push(params.get('destination'));
      waypoints = stops.filter(Boolean).map(toWaypoint);
      mode = params.get('travelmode') || null;
    } else if (params.has('saddr') || params.has('daddr')) {
      const stops = [params.get('saddr')];
      (params.get('daddr') || '').split(/\s+to:/i).forEach((w) => stops.push(w));
      waypoints = stops.filter(Boolean).map(toWaypoint);
      const legacyMode = { w: 'walking', b: 'bicycling', r: 'transit', d: 'driving' };
      mode = legacyMode[params.get('dirflg')] || null;
    } else {
      const dirIndex = url.pathname.indexOf('/dir/');
      if (dirIndex === -1) {
        throw new Error('Das ist ein Google-Maps-Link, aber keine Route (kein /dir/ im Link).');
      }
      const rest = url.pathname.slice(dirIndex + 5);
      const names = [];
      for (const segment of rest.split('/')) {
        if (segment.startsWith('@') || segment.startsWith('data=')) break;
        names.push(decodeURIComponent(segment.replace(/\+/g, ' ')));
      }
      // Google stores the resolved coordinate of every stop in the data blob
      // as !1d<lng>!2d<lat>, in stop order. Names alone are ambiguous, so the
      // blob wins whenever it lines up with the stop list.
      const data = decodeURIComponent(url.pathname + url.search + url.hash);
      const pairs = [];
      const pairRe = /!2m2!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g;
      let m;
      while ((m = pairRe.exec(data)) !== null) {
        pairs.push({ lng: Number(m[1]), lat: Number(m[2]) });
      }
      const modeMatch = /!3e(\d)/.exec(data);
      if (modeMatch) mode = GOOGLE_MODES[modeMatch[1]] || null;

      // An empty stop is "Mein Standort" and cannot be reconstructed.
      ownLocation = names.some((n) => n === '');
      waypoints = names.filter((n) => n !== '').map(toWaypoint);
      if (pairs.length && pairs.length === waypoints.length) {
        waypoints = waypoints.map((w, i) =>
          w.lat === null ? { lat: pairs[i].lat, lng: pairs[i].lng, name: w.name } : w
        );
      }
    }

    if (waypoints.length < 2) {
      throw new Error(ownLocation
        ? 'Die Route startet bei „Mein Standort“, das steht nicht im Link. Bitte in Google Maps einen festen Startpunkt eintragen und den Link neu kopieren.'
        : 'Der Google-Maps-Link enthält weniger als zwei Wegpunkte. Ist es wirklich eine Route?');
    }
    return { source: 'google', waypoints, mode };
  };

  /**
   * Works out which platform a link belongs to and what we can do with it.
   * Returns a descriptor; loading the actual geometry happens in loadRoute.
   */
  const parseLink = (text) => {
    const url = normalizeUrl(text);
    if (!url) throw new Error('Das sieht nicht nach einem Link aus.');
    const href = url.href;

    const komoot = KOMOOT_RE.exec(href);
    if (komoot) {
      return {
        source: 'komoot',
        id: komoot[1],
        shareToken: url.searchParams.get('share_token') || '',
        pageUrl: `https://www.komoot.com/tour/${komoot[1]}` +
          (url.searchParams.get('share_token') ? `?share_token=${url.searchParams.get('share_token')}` : ''),
      };
    }
    const strava = STRAVA_RE.exec(href);
    if (strava) {
      return {
        source: 'strava',
        kind: strava[1],
        id: strava[2],
        pageUrl: `https://www.strava.com/${strava[1]}/${strava[2]}`,
        exportUrl: `https://www.strava.com/${strava[1]}/${strava[2]}/export_gpx`,
      };
    }
    if (GMAPS_SHORT_RE.test(href)) {
      return { source: 'google-short', pageUrl: href };
    }
    if (GMAPS_RE.test(url.host + url.pathname) || GMAPS_RE.test(href)) {
      return parseGoogleMaps(url);
    }
    throw new Error('Link nicht erkannt. Unterstützt: komoot.com/tour/…, strava.com/routes/…, google.com/maps/dir/…');
  };

  // --- geometry helpers -----------------------------------------------------

  const haversine = (a, b) => {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  const pathLength = (points) => {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
    return total;
  };

  const formatKm = (meters) => `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} km`;

  const KOMOOT_SPORT_MODE = {
    hike: 'walking', jogging: 'walking', mountaineering: 'walking', nordicwalking: 'walking',
    touringbicycle: 'bicycling', racebike: 'bicycling', mtb: 'bicycling', mtb_easy: 'bicycling',
    mtb_advanced: 'bicycling', e_touringbicycle: 'bicycling', e_racebike: 'bicycling',
    e_mtb: 'bicycling', e_mtb_easy: 'bicycling', e_mtb_advanced: 'bicycling', downhillbike: 'bicycling',
  };

  /**
   * Evenly spaced intermediate points for a Google Maps link. Google accepts
   * only a handful of waypoints and draws its own line between them, so this
   * is an approximation of the route by design.
   */
  const sampleVias = (points, max) => {
    const inner = points.slice(1, -1);
    if (inner.length <= max) return inner;
    const vias = [];
    for (let k = 1; k <= max; k++) {
      vias.push(inner[Math.round((k * (inner.length - 1)) / (max + 1))]);
    }
    return vias;
  };

  const fmt = (n) => Number(n).toFixed(5);

  const googleMapsUrl = (route, mode, maxVias) => {
    const pts = route.points;
    const params = new URLSearchParams();
    params.set('api', '1');
    params.set('origin', `${fmt(pts[0].lat)},${fmt(pts[0].lng)}`);
    params.set('destination', `${fmt(pts[pts.length - 1].lat)},${fmt(pts[pts.length - 1].lng)}`);
    const vias = sampleVias(pts, maxVias);
    if (vias.length) {
      params.set('waypoints', vias.map((p) => `${fmt(p.lat)},${fmt(p.lng)}`).join('|'));
    }
    params.set('travelmode', mode);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  };

  // --- GPX in and out -------------------------------------------------------

  const xmlEscape = (s) =>
    String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

  /**
   * A route with real geometry becomes a <trk>; a waypoint-only route (Google
   * Maps) becomes a <rte>, which Komoot treats as planning stops and routes
   * between on import. Writing a <trk> for waypoints would import straight
   * lines, so we deliberately do not.
   */
  const toGpx = (route) => {
    const name = xmlEscape(route.name || 'Route');
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="djcanvas.github.io routen" xmlns="http://www.topografix.com/GPX/1/1">',
      `  <metadata><name>${name}</name></metadata>`,
    ];
    const point = (tag, p) => {
      const ele = Number.isFinite(p.ele) ? `<ele>${p.ele}</ele>` : '';
      const label = p.name ? `<name>${xmlEscape(p.name)}</name>` : '';
      return `<${tag} lat="${p.lat}" lon="${p.lng}">${ele}${label}</${tag}>`;
    };
    if (route.kind === 'track') {
      lines.push(`  <trk><name>${name}</name><trkseg>`);
      route.points.forEach((p) => lines.push(`    ${point('trkpt', p)}`));
      lines.push('  </trkseg></trk>');
    } else {
      lines.push(`  <rte><name>${name}</name>`);
      route.points.forEach((p) => lines.push(`    ${point('rtept', p)}`));
      lines.push('  </rte>');
    }
    lines.push('</gpx>', '');
    return lines.join('\n');
  };

  const parseGpx = (text, fileName) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror') || !doc.documentElement || doc.documentElement.localName !== 'gpx') {
      throw new Error('Die Datei ist kein lesbares GPX.');
    }
    const read = (nodes) =>
      Array.from(nodes).map((n) => {
        const eleNode = n.getElementsByTagName('ele')[0];
        const nameNode = n.getElementsByTagName('name')[0];
        return {
          lat: Number(n.getAttribute('lat')),
          lng: Number(n.getAttribute('lon')),
          ele: eleNode ? Number(eleNode.textContent) : undefined,
          name: nameNode ? nameNode.textContent.trim() : '',
        };
      }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    let points = read(doc.getElementsByTagName('trkpt'));
    let kind = 'track';
    if (points.length < 2) {
      points = read(doc.getElementsByTagName('rtept'));
      kind = 'waypoints';
    }
    if (points.length < 2) {
      points = read(doc.getElementsByTagName('wpt'));
      kind = 'waypoints';
    }
    if (points.length < 2) throw new Error('Das GPX enthält keine Route (keine trkpt, rtept oder wpt).');

    const nameNode =
      doc.querySelector('trk > name') || doc.querySelector('rte > name') || doc.querySelector('metadata > name');
    const name = (nameNode && nameNode.textContent.trim()) || (fileName || '').replace(/\.gpx$/i, '') || 'Route';
    return { name, kind, points, mode: 'bicycling', origin: `GPX-Datei${fileName ? ` „${fileName}“` : ''}` };
  };

  // --- loading a route from a link -------------------------------------------

  /**
   * Coordinates can sit at different depths depending on which endpoint (or
   * which embedded page blob) answered, so look for the first array of
   * {lat, lng} objects anywhere in the document, and remember the nearest
   * enclosing object with a name: that is the tour itself.
   */
  const findCoordinates = (node, owner = null, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 14) return null;
    if (Array.isArray(node)) {
      if (node.length >= 2 && node.every((c) => c && Number.isFinite(c.lat) && Number.isFinite(c.lng))) {
        return { items: node, owner };
      }
      for (const item of node) {
        const found = findCoordinates(item, owner, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const nextOwner = typeof node.name === 'string' ? node : owner;
    for (const key of Object.keys(node)) {
      const found = findCoordinates(node[key], nextOwner, depth + 1);
      if (found) return found;
    }
    return null;
  };

  const komootRoute = (json, link) => {
    const found = findCoordinates(json);
    if (!found) return null;
    const points = found.items
      .map((c) => ({ lat: c.lat, lng: c.lng, ele: c.alt }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (points.length < 2) return null;
    const tour = found.owner || {};
    return {
      name: tour.name || `Komoot Tour ${link.id}`,
      kind: 'track',
      points,
      mode: KOMOOT_SPORT_MODE[tour.sport] || 'bicycling',
      origin: `Komoot Tour ${link.id}`,
    };
  };

  /**
   * Komoot's tour page embeds the tour as JSON in a kmtBoot.setProps("...")
   * call. It is a JS string literal holding JSON, so it is decoded twice.
   */
  const parseKomootPage = (html) => {
    const m = /kmtBoot\.setProps\(("(?:[^"\\]|\\.)*")\)/.exec(html);
    if (!m) return null;
    try {
      return JSON.parse(JSON.parse(m[1]));
    } catch (error) {
      return null;
    }
  };

  const FETCH_TIMEOUT_MS = 12000;

  const fetchText = async (url, accept) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { mode: 'cors', headers: { Accept: accept }, signal: controller.signal });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return text;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Zeitüberschreitung');
      if (error instanceof TypeError) throw new Error('vom Browser blockiert (CORS) oder nicht erreichbar');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * Komoot does not allow other websites to read its API from the browser, so
   * after the direct attempt the same URLs go through public CORS relays. The
   * tour URL (including a share_token) is visible to whichever relay answers.
   */
  const CORS_RELAYS = [
    { name: 'corsproxy.io', wrap: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
    { name: 'allorigins.win', wrap: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
    { name: 'codetabs.com', wrap: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
  ];

  const loadKomoot = async (link, report) => {
    const token = link.shareToken ? `share_token=${encodeURIComponent(link.shareToken)}` : '';
    const apiUrls = [
      `${KOMOOT_API}${link.id}?_embedded=coordinates${token ? `&${token}` : ''}`,
      `${KOMOOT_WWW_API}${link.id}?_embedded=coordinates${token ? `&${token}` : ''}`,
      `${KOMOOT_API}${link.id}/coordinates${token ? `?${token}` : ''}`,
    ];
    const pageUrl = `https://www.komoot.com/tour/${link.id}${token ? `?${token}` : ''}`;
    const log = [];
    let sawForbidden = false;
    let sawNotFound = false;

    const attempt = async (label, url, kind) => {
      try {
        const text = await fetchText(url, kind === 'json' ? 'application/json' : 'text/html');
        let json = null;
        if (kind === 'json') {
          try { json = JSON.parse(text); } catch (error) { json = parseKomootPage(text); }
        } else {
          json = parseKomootPage(text);
          if (!json) { try { json = JSON.parse(text); } catch (error) { json = null; } }
        }
        const route = json && komootRoute(json, link);
        if (route) {
          log.push(`${label}: ok`);
          return route;
        }
        log.push(`${label}: Antwort ohne Koordinaten`);
      } catch (error) {
        if (error.status === 401 || error.status === 403) sawForbidden = true;
        if (error.status === 404) sawNotFound = true;
        log.push(`${label}: ${error.message}`);
      }
      return null;
    };

    report(`Lade Komoot-Tour ${link.id}…`);
    for (const url of apiUrls) {
      const route = await attempt(`direkt ${new URL(url).host}`, url, 'json');
      if (route) return route;
    }
    for (const relay of CORS_RELAYS) {
      report(`Komoot blockt den direkten Abruf, versuche es über ${relay.name}…`);
      for (const url of apiUrls.slice(0, 1)) {
        const route = await attempt(`${relay.name} → API`, relay.wrap(url), 'json');
        if (route) { route.origin += ` (über ${relay.name})`; return route; }
      }
      const route = await attempt(`${relay.name} → Tourseite`, relay.wrap(pageUrl), 'html');
      if (route) { route.origin += ` (über ${relay.name})`; return route; }
    }

    const reason = sawNotFound
      ? 'Komoot kennt diese Tour-ID nicht.'
      : sawForbidden && !link.shareToken
        ? 'Komoot gibt die Tour ohne Login nicht heraus. Nimm den Teilen-Link aus der Komoot-App (der enthält ein share_token) oder exportiere sie unten selbst.'
        : 'Die Tour ließ sich weder direkt noch über einen Umweg laden. Details unten; der Export bei Komoot selbst geht immer.';
    const err = new Error(reason);
    err.fallback = 'komoot';
    err.log = log;
    throw err;
  };

  const geocode = async (name) => {
    const params = new URLSearchParams({ q: name, format: 'jsonv2', limit: '1' });
    const res = await fetch(`${NOMINATIM}?${params}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Nominatim antwortete mit HTTP ${res.status}`);
    const hits = await res.json();
    if (!hits.length) throw new Error(`„${name}“ wurde nicht gefunden.`);
    return { lat: Number(hits[0].lat), lng: Number(hits[0].lon) };
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const loadGoogle = async (link, report) => {
    const points = [];
    let geocoded = false;
    for (let i = 0; i < link.waypoints.length; i++) {
      const w = link.waypoints[i];
      if (w.lat !== null) {
        points.push({ lat: w.lat, lng: w.lng, name: w.name });
        continue;
      }
      if (geocoded) await sleep(NOMINATIM_GAP_MS);
      report(`Suche Koordinaten für „${w.name}“ (${i + 1}/${link.waypoints.length})…`);
      const hit = await geocode(w.name);
      geocoded = true;
      points.push({ lat: hit.lat, lng: hit.lng, name: w.name });
    }
    const named = points.filter((p) => p.name);
    const name = named.length >= 2
      ? `${named[0].name} → ${named[named.length - 1].name}`
      : 'Google Maps Route';
    return {
      name,
      kind: 'waypoints',
      points,
      mode: link.mode || 'bicycling',
      origin: `Google Maps (${points.length} Wegpunkte${geocoded ? ', Orte via OpenStreetMap/Nominatim' : ''})`,
    };
  };

  // --- overlay ---------------------------------------------------------------

  const MODE_LABELS = { bicycling: 'Fahrrad', walking: 'Zu Fuß', driving: 'Auto', transit: 'ÖPNV' };

  const slug = (s) =>
    String(s).toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c]))
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'route';

  const downloadGpx = (route) => {
    const blob = new Blob([toGpx(route)], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(route.name)}.gpx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return a.download;
  };

  const openTab = (url) => window.open(url, '_blank', 'noopener');

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      return false;
    }
  };

  window.Routen = {
    parseLink,
    parseGpx,
    toGpx,
    googleMapsUrl,

    /** @param {string} [initialLink] a link typed after the command */
    open(initialLink) {
      if (document.querySelector('.routen-root')) return;
      const root = el('div', 'routen-root');
      root.tabIndex = -1;
      document.body.appendChild(root);
      if (window.Starfield) window.Starfield.pause();

      let route = null;
      let busy = false;

      const close = () => {
        root.remove();
        document.removeEventListener('keydown', onKey);
        if (window.Starfield) window.Starfield.resume();
        // Hand the keyboard back to the shell so typing continues there.
        const prompt = document.querySelector('#terminal .prompt input:not([readonly])');
        if (prompt) prompt.focus();
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close();
      };
      document.addEventListener('keydown', onKey);

      const shell = el('div', 'routen-shell');
      const head = el('header', 'routen-head');
      head.appendChild(el('h1', null, 'routen'));
      const quit = el('button', 'routen-quit', 'close');
      quit.addEventListener('click', close);
      head.appendChild(quit);
      shell.appendChild(head);
      root.appendChild(shell);

      shell.appendChild(el('p', 'routen-hint',
        'Link einer geplanten Route von Komoot, Strava oder Google Maps einfügen. ' +
        'Danach als GPX herunterladen oder in eine der anderen Plattformen übernehmen.'));

      // source row
      const sourceRow = el('div', 'routen-row');
      const input = el('input', 'routen-input');
      input.type = 'url';
      input.placeholder = 'https://www.komoot.com/tour/…  |  strava.com/routes/…  |  google.com/maps/dir/…';
      input.setAttribute('aria-label', 'Routen-Link');
      input.value = initialLink || '';
      const go = el('button', 'routen-primary', 'Laden');
      sourceRow.appendChild(input);
      sourceRow.appendChild(go);
      shell.appendChild(sourceRow);

      // drop zone
      const drop = el('label', 'routen-drop');
      drop.appendChild(el('span', null, 'oder GPX-Datei hier ablegen / anklicken zum Auswählen'));
      const file = el('input');
      file.type = 'file';
      file.accept = '.gpx,application/gpx+xml,application/xml,text/xml';
      file.className = 'sr-only';
      drop.appendChild(file);
      shell.appendChild(drop);

      const status = el('div', 'routen-status');
      shell.appendChild(status);

      const card = el('div', 'routen-card');
      card.hidden = true;
      shell.appendChild(card);

      const say = (text, kind) => {
        status.textContent = text;
        status.className = `routen-status${kind ? ` routen-status-${kind}` : ''}`;
      };
      // Only the button is disabled: disabling the input would drop its focus.
      const setBusy = (value) => {
        busy = value;
        go.disabled = value;
      };

      // --- fallback panels when a source cannot be read directly ------------

      const linkButton = (label, url) => {
        const b = el('button', 'routen-mini', label);
        b.addEventListener('click', () => openTab(url));
        return b;
      };

      const showFallback = (link, message, log) => {
        card.hidden = false;
        card.innerHTML = '';
        card.appendChild(el('h2', null, link.source === 'strava' ? 'Strava' : link.source === 'komoot' ? 'Komoot' : 'Google Maps'));
        if (message) card.appendChild(el('p', 'routen-warn', message));
        const steps = el('ol', 'routen-steps');
        const actions = el('div', 'routen-actions');
        if (link.source === 'strava') {
          steps.appendChild(el('li', null,
            'Strava gibt Routen nur eingeloggt heraus. Der Knopf öffnet den GPX-Export deiner Route bei Strava ' +
            '(bist du dort nicht angemeldet, landest du erst auf der Login-Seite und musst danach noch einmal drücken).'));
          steps.appendChild(el('li', null, 'Die heruntergeladene GPX-Datei oben ablegen. Dann geht es hier weiter: nach Komoot, nach Google Maps oder als Datei behalten.'));
          actions.appendChild(linkButton('GPX bei Strava exportieren', link.exportUrl));
          actions.appendChild(linkButton('Route bei Strava öffnen', link.pageUrl));
        } else if (link.source === 'komoot') {
          steps.appendChild(el('li', null, 'Bei Komoot einloggen und die Tour öffnen. Unter „…“ (Mehr) gibt es „GPX exportieren“ oder „Als GPX herunterladen“.'));
          steps.appendChild(el('li', null, 'Die GPX-Datei oben ablegen. Dann geht es hier weiter: nach Strava, nach Google Maps oder als Datei behalten.'));
          actions.appendChild(linkButton('Tour bei Komoot öffnen', link.pageUrl));
          actions.appendChild(linkButton('Direkter GPX-Export (Login bei Komoot nötig)',
            `${KOMOOT_WWW_API}${link.id}.gpx${link.shareToken ? `?share_token=${encodeURIComponent(link.shareToken)}` : ''}`));
        } else {
          steps.appendChild(el('li', null, 'Kurzlinks (maps.app.goo.gl) lassen sich im Browser nicht auflösen. Öffne den Link, warte bis die Route steht, und kopiere dann die lange Adresse aus der Adresszeile (beginnt mit google.com/maps/dir/).'));
          steps.appendChild(el('li', null, 'Die lange Adresse oben einfügen.'));
          actions.appendChild(linkButton('Kurzlink öffnen', link.pageUrl));
        }
        card.appendChild(steps);
        card.appendChild(actions);
        if (log && log.length) {
          const details = el('details', 'routen-log');
          details.appendChild(el('summary', null, 'Was wurde versucht?'));
          details.appendChild(el('pre', null, log.join('\n')));
          card.appendChild(details);
        }
      };

      // --- the loaded route and its targets ----------------------------------

      const showRoute = () => {
        card.hidden = false;
        card.innerHTML = '';
        card.appendChild(el('h2', null, route.name));
        const facts = el('dl', 'routen-facts');
        const fact = (k, v) => {
          facts.appendChild(el('dt', null, k));
          facts.appendChild(el('dd', null, v));
        };
        fact('Quelle', route.origin);
        if (route.kind === 'track') {
          fact('Länge', `${formatKm(pathLength(route.points))} (${route.points.length} Punkte)`);
        } else {
          fact('Wegpunkte', `${route.points.length} (Luftlinie ${formatKm(pathLength(route.points))}; der Weg dazwischen wird beim Import neu berechnet)`);
        }
        card.appendChild(facts);

        const modeRow = el('div', 'routen-row routen-mode');
        const modeLabel = el('label', null, 'Fortbewegung (für Google Maps): ');
        const modeSelect = el('select', 'routen-select');
        Object.entries(MODE_LABELS).forEach(([value, label]) => {
          const opt = el('option', null, label);
          opt.value = value;
          if (value === route.mode) opt.selected = true;
          modeSelect.appendChild(opt);
        });
        modeLabel.appendChild(modeSelect);
        modeRow.appendChild(modeLabel);
        card.appendChild(modeRow);

        const actions = el('div', 'routen-actions');
        const note = el('div', 'routen-note');

        const gpxBtn = el('button', 'routen-primary', 'GPX herunterladen');
        gpxBtn.addEventListener('click', () => {
          const fileName = downloadGpx(route);
          note.textContent = `„${fileName}“ wurde gespeichert.`;
        });

        const komootBtn = el('button', 'routen-mini', 'Nach Komoot');
        komootBtn.addEventListener('click', () => {
          const fileName = downloadGpx(route);
          openTab(KOMOOT_UPLOAD);
          note.textContent =
            `„${fileName}“ wurde gespeichert und komoot.com/upload geöffnet. Dort die Datei ablegen und ` +
            `„Als geplante Tour“ wählen. Komoot legt die Route dann neu auf sein Wegenetz` +
            (route.kind === 'waypoints' ? ' und berechnet den Weg zwischen den Wegpunkten.' : '.');
        });

        const stravaBtn = el('button', 'routen-mini', 'Nach Strava');
        stravaBtn.addEventListener('click', () => {
          const fileName = downloadGpx(route);
          openTab(STRAVA_ROUTE_BUILDER);
          note.textContent =
            `„${fileName}“ wurde gespeichert und der Strava-Routenplaner geöffnet. Dort oben „GPX hochladen“ ` +
            `(Pfeil-Symbol) wählen und die Datei auswählen.` +
            (route.kind === 'waypoints'
              ? ' Achtung: Strava zieht zwischen den Wegpunkten gerade Linien. Für eine echte Strecke erst nach Komoot, dort als GPX exportieren und diese Datei bei Strava hochladen.'
              : '');
        });

        const gmapsBtn = el('button', 'routen-mini', 'In Google Maps öffnen');
        gmapsBtn.addEventListener('click', async () => {
          const small = window.matchMedia('(max-width: 768px)').matches;
          const url = googleMapsUrl(route, modeSelect.value, small ? 3 : 9);
          openTab(url);
          const copied = await copyText(url);
          note.textContent =
            (route.kind === 'track'
              ? `Google Maps kennt keine GPX-Dateien und nimmt nur wenige Zwischenziele an. Der Link enthält Start, Ziel und bis zu ${small ? 3 : 9} Zwischenpunkte der Strecke; Google berechnet den Weg dazwischen selbst. `
              : 'Der Link enthält die Wegpunkte der Route; Google berechnet den Weg dazwischen selbst. ') +
            (copied ? 'Der Link liegt auch in der Zwischenablage.' : '');
          const linkBox = el('textarea', 'routen-linkbox');
          linkBox.readOnly = true;
          linkBox.value = url;
          linkBox.rows = 2;
          note.appendChild(document.createElement('br'));
          note.appendChild(linkBox);
        });

        actions.appendChild(gpxBtn);
        actions.appendChild(komootBtn);
        actions.appendChild(stravaBtn);
        actions.appendChild(gmapsBtn);
        card.appendChild(actions);
        card.appendChild(note);
      };

      // --- wiring -------------------------------------------------------------

      const loadLink = async (text) => {
        if (busy) return;
        let link;
        try {
          link = parseLink(text);
        } catch (error) {
          say(error.message, 'error');
          return;
        }
        card.hidden = true;
        if (link.source === 'strava') {
          say('Strava-Route erkannt.');
          showFallback(link, '');
          return;
        }
        if (link.source === 'google-short') {
          say('Google-Maps-Kurzlink erkannt.', 'error');
          showFallback(link, '');
          return;
        }
        setBusy(true);
        try {
          if (link.source === 'komoot') {
            route = await loadKomoot(link, say);
          } else {
            say('Lese Wegpunkte aus dem Google-Maps-Link…');
            route = await loadGoogle(link, say);
          }
          say('Route geladen.', 'ok');
          showRoute();
        } catch (error) {
          say(error.message, 'error');
          if (error.fallback === 'komoot') showFallback(link, '', error.log);
        } finally {
          setBusy(false);
        }
      };

      const loadFile = async (f) => {
        if (!f) return;
        try {
          route = parseGpx(await f.text(), f.name);
          say('GPX gelesen.', 'ok');
          showRoute();
        } catch (error) {
          say(error.message, 'error');
        }
      };

      go.addEventListener('click', () => loadLink(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadLink(input.value);
      });
      file.addEventListener('change', () => loadFile(file.files[0]));
      ['dragenter', 'dragover'].forEach((type) =>
        shell.addEventListener(type, (e) => {
          e.preventDefault();
          drop.classList.add('routen-drop-active');
        }));
      ['dragleave', 'drop'].forEach((type) =>
        shell.addEventListener(type, (e) => {
          e.preventDefault();
          drop.classList.remove('routen-drop-active');
        }));
      shell.addEventListener('drop', (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadFile(f);
      });

      // The terminal input still holds focus; take it so typing lands here.
      setTimeout(() => {
        const active = document.activeElement;
        if (active && active.blur && !root.contains(active)) active.blur();
        input.focus();
        if (initialLink) loadLink(initialLink);
      }, 0);
    },
  };
})();
