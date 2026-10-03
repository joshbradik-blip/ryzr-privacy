/*
 * RYZR web funnel tracker (myryzr.com).
 *
 * Logs the ad -> landing -> CTA -> store path to Supabase `web_events`:
 *   landing_view  page loaded
 *   cta_click     a link/button marked data-ryzr-cta was clicked
 *   store_click   a link to the App Store / Google Play was clicked
 *
 * Install: add before </body> on every page that should be measured.
 *
 *   <script src="/ryzr-web.js" defer
 *     data-supabase-url="https://<project-ref>.supabase.co"
 *     data-supabase-key="<anon/publishable key>"></script>
 *
 * Mark call-to-action buttons with  data-ryzr-cta="hero"  (any label).
 * The anon key is public by design; the table is insert-only (see migration).
 *
 * Captures utm_* and fbclid on first landing and keeps them for the session,
 * so a click two pages later is still attributed to the original ad. Never
 * throws: analytics must not break the page. No cookies; uses sessionStorage.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var URL_ = script && script.getAttribute('data-supabase-url');
  var KEY = script && script.getAttribute('data-supabase-key');
  if (!URL_ || !KEY) return;

  var STORE_RE = /apps\.apple\.com|play\.google\.com|\/download(\/|$)/i;

  function safeStorage() {
    try { var k = '__ryzr_t'; sessionStorage.setItem(k, '1'); sessionStorage.removeItem(k); return sessionStorage; }
    catch (e) { return null; }
  }
  var store = safeStorage();
  function get(k) { try { return store ? store.getItem(k) : null; } catch (e) { return null; } }
  function set(k, v) { try { if (store) store.setItem(k, v); } catch (e) {} }

  function randomId() {
    var a = new Uint8Array(12);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  /** Pure: pull attribution params out of a query string. Exposed for tests. */
  function parseAttribution(search) {
    var out = {};
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
    var q = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
      var v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      q[k] = v;
    });
    keys.forEach(function (k) { if (q[k]) out[k] = q[k]; });
    return out;
  }

  var sessionId = get('ryzr_sid');
  if (!sessionId) { sessionId = randomId(); set('ryzr_sid', sessionId); }

  var attr = {};
  try { attr = JSON.parse(get('ryzr_attr') || '{}'); } catch (e) { attr = {}; }
  var fresh = parseAttribution(window.location.search);
  if (Object.keys(fresh).length) { attr = fresh; set('ryzr_attr', JSON.stringify(attr)); }

  var ua = navigator.userAgent || '';
  var platform = /iPad|iPhone|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'other';

  function send(step, cta) {
    try {
      var body = {
        session_id: sessionId,
        step: step,
        utm_source: attr.utm_source || null,
        utm_medium: attr.utm_medium || null,
        utm_campaign: attr.utm_campaign || null,
        utm_content: attr.utm_content || null,
        utm_term: attr.utm_term || null,
        fbclid: attr.fbclid || null,
        referrer: (document.referrer || '').slice(0, 300) || null,
        path: window.location.pathname.slice(0, 200),
        platform: platform,
        cta: cta ? String(cta).slice(0, 100) : null,
      };
      // keepalive lets the request finish even as the page navigates to the store.
      fetch(URL_ + '/rest/v1/web_events', {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  if (!get('ryzr_landed:' + window.location.pathname)) {
    set('ryzr_landed:' + window.location.pathname, '1');
    send('landing_view');
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('a,button,[data-ryzr-cta]') : null;
    if (!el) return;
    var cta = el.getAttribute('data-ryzr-cta');
    var href = el.getAttribute('href') || '';
    if (cta) send('cta_click', cta);
    if (STORE_RE.test(href)) send('store_click', cta || href.slice(0, 100));
  }, true);

  window.RyzrWeb = { parseAttribution: parseAttribution, sessionId: sessionId, track: send, attribution: function () { return attr; } };
})();
