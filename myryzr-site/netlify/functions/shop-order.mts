import type { Config } from "@netlify/functions";
import { getStripe } from "../../lib/stripe.js";

// Minimal order summary for the post-checkout confirmation page. Only returns
// non-sensitive fields for the session ID the customer was redirected with.
export default async (req: Request) => {
  const sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return Response.json({ error: "Invalid session" }, { status: 400 });
  }
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return Response.json({
      status: session.status,
      paymentStatus: session.payment_status,
      email: session.customer_details?.email ?? null,
      amountTotal: session.amount_total,
      currency: session.currency,
    });
  } catch {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }
};

export const config: Config = { path: "/api/shop/order", method: "GET" };
