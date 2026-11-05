import type { Config } from "@netlify/functions";
import type Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { orders } from "../../db/schema.js";
import { getStripe } from "../../lib/stripe.js";

// Receives Stripe events and records orders for fulfillment. Orders are only
// created from verified webhooks — never from the success-page redirect —
// so every row corresponds to money Stripe actually collected.
export default async (req: Request) => {
  const secret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Missing signature", { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch (err) {
    console.error("Stripe signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        // Delayed payment methods complete the session before funds arrive;
        // wait for async_payment_succeeded in that case.
        if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
          await recordOrder(stripe, session.id, "paid");
        }
        break;
      }
      case "checkout.session.async_payment_failed":
        await recordOrder(stripe, event.data.object.id, "payment_failed");
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`Failed handling ${event.type}`, err);
    // Non-2xx makes Stripe retry delivery.
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok");
};

async function recordOrder(stripe: Stripe, sessionId: string, status: "paid" | "payment_failed") {
  // Re-fetch so we always store the latest state, regardless of event order.
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "shipping_cost.shipping_rate"],
  });

  const shipping = session.collected_information?.shipping_details ?? null;
  const rate = session.shipping_cost?.shipping_rate;
  const lineItems = (session.line_items?.data ?? []).map((li) => ({
    description: li.description,
    priceId: li.price?.id ?? null,
    productId: typeof li.price?.product === "string" ? li.price.product : li.price?.product?.id ?? null,
    quantity: li.quantity,
    amountSubtotal: li.amount_subtotal,
    amountTax: li.amount_tax,
    amountTotal: li.amount_total,
  }));

  const values = {
    stripeSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    status,
    customerEmail: session.customer_details?.email ?? null,
    customerName: session.customer_details?.name ?? null,
    shippingName: shipping?.name ?? null,
    shippingAddress: shipping?.address ?? null,
    shippingMethod: rate && typeof rate !== "string" ? rate.display_name : null,
    lineItems,
    currency: session.currency ?? "usd",
    amountSubtotal: session.amount_subtotal ?? 0,
    amountShipping: session.total_details?.amount_shipping ?? 0,
    amountTax: session.total_details?.amount_tax ?? 0,
    amountTotal: session.amount_total ?? 0,
  };

  // Idempotent: Stripe can deliver the same event more than once.
  // Never downgrade an order that has already been fulfilled.
  await db
    .insert(orders)
    .values(values)
    .onConflictDoUpdate({
      target: orders.stripeSessionId,
      set: {
        ...values,
        status: sql`CASE WHEN ${orders.status} = 'fulfilled' THEN ${orders.status} ELSE ${status} END`,
        updatedAt: new Date(),
      },
    });
}

export const config: Config = { path: "/api/stripe-webhook", method: "POST" };
