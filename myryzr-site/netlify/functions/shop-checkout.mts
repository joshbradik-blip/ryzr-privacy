import type { Config } from "@netlify/functions";
import type Stripe from "stripe";
import { getStripe, SHOP, shippingOptions } from "../../lib/stripe.js";

type CartItem = { priceId: string; quantity: number };

// Creates a Stripe-hosted Checkout Session. Prices are re-read from Stripe so
// the browser can only choose *which* items, never what they cost.
export default async (req: Request) => {
  let cart: CartItem[];
  try {
    const body = await req.json();
    cart = Array.isArray(body?.items) ? body.items : [];
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // Merge duplicates and validate shape.
  const merged = new Map<string, number>();
  for (const item of cart) {
    if (typeof item?.priceId !== "string" || !/^price_[A-Za-z0-9]+$/.test(item.priceId)) {
      return Response.json({ error: "Invalid item" }, { status: 400 });
    }
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1) return Response.json({ error: "Invalid quantity" }, { status: 400 });
    merged.set(item.priceId, Math.min((merged.get(item.priceId) ?? 0) + qty, SHOP.maxQuantityPerItem));
  }
  if (merged.size === 0) return Response.json({ error: "Your cart is empty" }, { status: 400 });
  if (merged.size > SHOP.maxLineItems) return Response.json({ error: "Too many items" }, { status: 400 });

  try {
    const stripe = getStripe();
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let subtotal = 0;

    for (const [priceId, quantity] of merged) {
      let price: Stripe.Price;
      try {
        price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
      } catch {
        return Response.json({ error: "An item in your cart is no longer available" }, { status: 400 });
      }
      const product = price.product as Stripe.Product;
      if (
        !price.active || price.type !== "one_time" || price.unit_amount == null ||
        price.currency !== SHOP.currency || typeof product === "string" || !product.active || product.deleted
      ) {
        return Response.json({ error: "An item in your cart is no longer available" }, { status: 400 });
      }
      subtotal += price.unit_amount * quantity;
      lineItems.push({
        price: price.id,
        quantity,
        adjustable_quantity: { enabled: true, minimum: 1, maximum: SHOP.maxQuantityPerItem },
      });
    }

    const origin = new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      // Stripe Tax: calculates sales tax from the shipping address and the
      // product tax codes set in the Stripe Dashboard.
      automatic_tax: { enabled: true },
      shipping_address_collection: { allowed_countries: SHOP.shippingCountries },
      shipping_options: shippingOptions(subtotal),
      billing_address_collection: "auto",
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      customer_creation: "if_required",
      success_url: `${origin}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop`,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/automatic tax|head office|tax registration/i.test(message)) {
      console.error("Stripe Tax is not configured — finish setup at https://dashboard.stripe.com/settings/tax:", message);
    } else {
      console.error("shop-checkout failed", err);
    }
    return Response.json({ error: "Checkout is unavailable right now. Please try again." }, { status: 500 });
  }
};

export const config: Config = { path: "/api/shop/checkout", method: "POST" };
