(function () {
  var KEY = "ryzr_cart";
  var products = [];
  var byPrice = {};
  var cart = load();
  var $ = function (id) { return document.getElementById(id); };
  var money = function (cents, cur) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: (cur || "usd").toUpperCase() }).format(cents / 100);
  };
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  function renderGrid() {
    var grid = $("grid");
    if (!products.length) { $("state").textContent = "New gear is dropping soon. Check back shortly."; return; }
    $("state").remove();
    grid.innerHTML = products.map(function (p) {
      var img = p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy" />' : '<span class="ph">RYZR</span>';
      return '<article class="card"><div class="card-img">' + img + '</div><div class="card-body">' +
        "<h2>" + esc(p.name) + "</h2><p>" + esc(p.description || "") + "</p>" +
        '<div class="card-foot"><span class="price">' + money(p.unitAmount, p.currency) + "</span>" +
        '<button class="btn" type="button" data-add="' + esc(p.priceId) + '">Add to cart</button></div></div></article>';
    }).join("");
  }

  function renderCart() {
    // Drop items that are no longer for sale.
    Object.keys(cart).forEach(function (k) { if (!byPrice[k]) delete cart[k]; });
    save();
    var ids = Object.keys(cart);
    var count = 0, subtotal = 0;
    $("lines").innerHTML = ids.length ? ids.map(function (id) {
      var p = byPrice[id], q = cart[id];
      count += q; subtotal += p.unitAmount * q;
      return '<div class="line"><div class="line-name">' + esc(p.name) + '<div class="line-sub">' + money(p.unitAmount, p.currency) + "</div></div>" +
        '<div class="qty"><button type="button" data-dec="' + esc(id) + '" aria-label="Decrease">&minus;</button><span>' + q +
        '</span><button type="button" data-inc="' + esc(id) + '" aria-label="Increase">+</button></div></div>';
    }).join("") : '<div class="empty">Your cart is empty.</div>';
    $("cart-count").textContent = count;
    $("subtotal").textContent = money(subtotal, "usd");
    $("checkout").disabled = !ids.length;
  }

  function setQty(id, q) {
    if (q <= 0) delete cart[id]; else cart[id] = Math.min(q, 10);
    renderCart();
  }
  function openCart(open) { document.body.classList.toggle("cart-open", open); }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-add],[data-inc],[data-dec]");
    if (!t) return;
    if (t.dataset.add) { setQty(t.dataset.add, (cart[t.dataset.add] || 0) + 1); openCart(true); }
    if (t.dataset.inc) setQty(t.dataset.inc, cart[t.dataset.inc] + 1);
    if (t.dataset.dec) setQty(t.dataset.dec, cart[t.dataset.dec] - 1);
  });
  $("open-cart").onclick = function () { openCart(true); };
  $("close-cart").onclick = $("drawer-bg").onclick = function () { openCart(false); };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") openCart(false); });

  $("checkout").onclick = function () {
    var btn = this;
    btn.disabled = true; btn.textContent = "Redirecting…"; $("err").textContent = "";
    var items = Object.keys(cart).map(function (id) { return { priceId: id, quantity: cart[id] }; });
    fetch("/api/shop/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.url) throw new Error(d.error || "Checkout failed"); location.assign(d.url); })
      .catch(function (err) { $("err").textContent = err.message; btn.disabled = false; btn.textContent = "Checkout"; });
  };

  fetch("/api/shop/products").then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) throw new Error(d.error);
    products = d.products || [];
    products.forEach(function (p) { byPrice[p.priceId] = p; });
    if (d.freeShippingThreshold) $("free-ship").textContent = "Free standard shipping over " + money(d.freeShippingThreshold, "usd");
    renderGrid(); renderCart();
  }).catch(function () { $("state").textContent = "The shop is temporarily unavailable. Please try again soon."; });
})();
