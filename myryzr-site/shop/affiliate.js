(function () {
  "use strict";

  // Same public, read-only catalog and affiliate tag as ryzrapp's Store > Gear.
  // This publishable key is designed for browser use; row-level security only
  // permits reading active products. No service-role key or Stripe is needed.
  var CATALOG_URL = "https://fuyzcssdryngvxmmjkvn.supabase.co/rest/v1/gear_products";
  var PUBLISHABLE_KEY = "sb_publishable_zfWm_GgKAH8NU4EyTr_vtQ_d03zJzFn";
  var ASSOCIATE_TAG = "bradikshop-20";
  // Original illustrative artwork; positions in a 3-column, 4-row atlas.
  // Map by ASIN so changing the catalog order cannot mismatch an illustration.
  var ILLUSTRATIONS = {
    B09PH9PNYY: [0, 0], // Adjustable phone tripod
    B0CW9MSMK4: [1, 0], // Ring light tripod
    B07837W5NX: [2, 0], // Flexible gripping mount
    B0C37RKB5T: [0, 1], // Resistance tubes with handles
    B084H4Q8VJ: [1, 1], // Workout mat
    B01AVDVHTI: [2, 1], // Mini loop bands
    B07BB3VQ42: [0, 2], // Lifting straps
    B00XM2MXK8: [1, 2], // Foam roller
    B00GL2HMES: [2, 2], // Creatine powder
    B002DYIZH6: [0, 3], // Whey powder
    B01LZQ8OYE: [1, 3]  // Shaker bottle
  };
  var catalog = document.getElementById("affiliate-catalog");
  var state = document.getElementById("affiliate-state");
  var retry = document.getElementById("affiliate-retry");

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function render(products) {
    catalog.replaceChildren();
    var sections = new Map();
    products.forEach(function (product) {
      // Build the destination ourselves, rather than trusting arbitrary URLs.
      if (!product || typeof product.asin !== "string" || !/^[A-Z0-9]{10}$/.test(product.asin) || typeof product.name !== "string") return;
      var title = product.section || "Gear";
      if (!sections.has(title)) {
        var section = element("section", "affiliate-category");
        var heading = element("h3", "category-title", title);
        heading.id = "amazon-category-" + sections.size;
        section.setAttribute("aria-labelledby", heading.id);
        section.appendChild(heading);
        var grid = element("div", "grid");
        section.appendChild(grid);
        catalog.appendChild(section);
        sections.set(title, grid);
      }
      var card = element("article", "card affiliate-card");
      var position = ILLUSTRATIONS[product.asin];
      if (position) {
        var illustration = element("div", "card-illustration");
        illustration.style.backgroundPosition = (position[0] * 50) + "% " + (position[1] * 100 / 3) + "%";
        illustration.setAttribute("aria-hidden", "true");
        card.appendChild(illustration);
      }
      var body = element("div", "card-body");
      body.appendChild(element("div", "affiliate-label", "Amazon pick"));
      body.appendChild(element("h4", "", product.name));
      body.appendChild(element("p", "", product.description || ""));
      var foot = element("div", "card-foot");
      var link = element("a", "btn", "View on Amazon");
      link.href = "https://www.amazon.com/dp/" + product.asin + "?tag=" + ASSOCIATE_TAG;
      link.target = "_blank";
      link.rel = "sponsored noopener";
      link.setAttribute("aria-label", "View " + product.name + " on Amazon (opens in a new tab)");
      var arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      arrow.setAttribute("viewBox", "0 0 24 24");
      arrow.setAttribute("width", "18");
      arrow.setAttribute("height", "18");
      arrow.setAttribute("fill", "none");
      arrow.setAttribute("stroke", "currentColor");
      arrow.setAttribute("stroke-width", "2");
      arrow.setAttribute("aria-hidden", "true");
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M7 17 17 7M7 7h10v10");
      arrow.appendChild(path);
      link.appendChild(arrow);
      foot.appendChild(link);
      body.appendChild(foot);
      card.appendChild(body);
      sections.get(title).appendChild(card);
    });
    state.hidden = sections.size > 0;
    state.textContent = sections.size ? "" : "New Amazon picks are coming soon. Check back shortly.";
  }

  async function load() {
    retry.hidden = true;
    state.hidden = false;
    state.textContent = "Loading Amazon picks…";
    catalog.setAttribute("aria-busy", "true");
    try {
      var query = "?select=section,name,description,asin&is_active=eq.true&order=sort_order.asc,name.asc";
      var response = await fetch(CATALOG_URL + query, {
        headers: { apikey: PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error("Catalog unavailable");
      var products = await response.json();
      if (!Array.isArray(products)) throw new Error("Invalid catalog");
      render(products);
    } catch (error) {
      state.textContent = "We couldn’t load the Amazon picks. Please try again.";
      retry.hidden = false;
    } finally {
      catalog.setAttribute("aria-busy", "false");
    }
  }

  retry.addEventListener("click", load);
  load();
})();
