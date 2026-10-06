/*
 * RYZR cookie / tracking consent (myryzr.com).
 *
 * Nothing that measures visitors runs until the visitor clicks Accept.
 * Mark any tracking <script> as inert and this file activates it on consent:
 *
 *   <script type="text/plain" data-ryzr-consent="analytics" src="/x.js"></script>
 *   <script type="text/plain" data-ryzr-consent="analytics">inline code</script>
 *
 * Choice is kept in localStorage ("ryzr_consent": "granted" | "denied").
 * A Global Privacy Control signal is treated as Decline and shows no banner.
 * Any element with data-ryzr-consent-open reopens the banner (footer link).
 * Never throws: consent UI must not break the page.
 */
(function () {
  'use strict';
  var KEY = 'ryzr_consent';

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function activate() {
    var nodes = document.querySelectorAll('script[type="text/plain"][data-ryzr-consent]');
    Array.prototype.forEach.call(nodes, function (old) {
      var s = document.createElement('script');
      Array.prototype.forEach.call(old.attributes, function (a) {
        if (a.name !== 'type') s.setAttribute(a.name, a.value);
      });
      s.text = old.text;
      old.parentNode.replaceChild(s, old);
    });
  }

  function banner() {
    if (document.getElementById('ryzr-consent')) return;
    var css = document.createElement('style');
    css.textContent =
      '#ryzr-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:560px;margin:0 auto;' +
      'background:#111;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:18px 20px;' +
      'box-shadow:0 8px 40px rgba(0,0,0,.6);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Archivo",sans-serif}' +
      '#ryzr-consent p{margin:0 0 14px;color:rgba(255,255,255,.78)}' +
      '#ryzr-consent a{color:#FF6B1A}' +
      '#ryzr-consent .btns{display:flex;gap:10px;flex-wrap:wrap}' +
      '#ryzr-consent button{flex:1 1 120px;cursor:pointer;font:inherit;font-weight:700;border-radius:999px;padding:11px 18px;' +
      'border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff}' +
      '#ryzr-consent button.yes{background:#FF6B1A;border-color:#FF6B1A;color:#2A1004}' +
      '#ryzr-consent button:focus-visible{outline:2px solid #fff;outline-offset:2px}';
    document.head.appendChild(css);

    var box = document.createElement('div');
    box.id = 'ryzr-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Cookie and tracking preferences');
    box.innerHTML =
      '<p>We use cookies and similar technology to measure how our ads perform and how visitors use this site. ' +
      'Nothing is collected unless you accept. <a href="/privacy-policy.html#advertising">Learn more</a></p>' +
      '<div class="btns"><button type="button" class="no">Decline</button>' +
      '<button type="button" class="yes">Accept</button></div>';
    document.body.appendChild(box);

    function choose(v) {
      var prev = read();
      write(v);
      box.remove();
      if (v === 'granted') activate();
      // Tracking that already ran can't be unloaded; reload so it stops.
      else if (prev === 'granted') window.location.reload();
    }
    box.querySelector('.yes').addEventListener('click', function () { choose('granted'); });
    box.querySelector('.no').addEventListener('click', function () { choose('denied'); });
    box.querySelector('.no').focus();
  }

  function init() {
    var gpc = navigator.globalPrivacyControl === true;
    var saved = read();
    if (gpc && saved !== 'granted') { write('denied'); saved = 'denied'; }
    if (saved === 'granted') activate();
    else if (!saved) banner();

    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-ryzr-consent-open]') : null;
      if (t) { ev.preventDefault(); banner(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
