import type { Config } from "@netlify/functions";
import type Stripe from "stripe";
import { getStripe, SHOP } from "../../lib/stripe.js";

// Lists sellable items straight from the Stripe product catalog, so products
// and prices are managed in the Stripe Dashboard rather than in code.
// A product is shown when it is active, has an active one-time default price,
// and is not tagged with metadata `shop=hidden`.
export default async () => {
  try {
    const stripe = getStripe();
    const products: Stripe.Product[] = [];
    for await (const p of stripe.products.list({ active: true, limit: 100, expand: ["data.default_price"] })) {
      products.push(p);
    }

    const items = products
      .filter((p) => p.metadata?.shop !== "hidden")
      .map((p) => {
        const price = p.default_price as Stripe.Price | null;
        if (!price || typeof price === "string" || !price.active || price.type !== "one_time") return null;
        if (price.currency !== SHOP.currency || price.unit_amount == null) return null;
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          image: p.images?.[0] ?? null,
          priceId: price.id,
          unitAmount: price.unit_amount,
          currency: price.currency,
        };
      })
      .filter(Boolean);

    return Response.json(
      { products: items, freeShippingThreshold: SHOP.freeShippingThreshold },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (err) {
    console.error("shop-products failed", err);
    return Response.json({ error: "Could not load products" }, { status: 500 });
  }
};

export const config: Config = { path: "/api/shop/products", method: "GET" };
