import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

// One row per Stripe Checkout Session that reached a terminal payment state.
// Stripe is the source of truth for money; this table is the shipping queue.
export const orders = pgTable("orders", {
  id: serial().primaryKey(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  // paid | payment_failed | fulfilled
  status: text().notNull(),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  shippingName: text("shipping_name"),
  shippingAddress: jsonb("shipping_address"),
  shippingMethod: text("shipping_method"),
  lineItems: jsonb("line_items").notNull(),
  currency: text().notNull(),
  amountSubtotal: integer("amount_subtotal").notNull(),
  amountShipping: integer("amount_shipping").notNull().default(0),
  amountTax: integer("amount_tax").notNull().default(0),
  amountTotal: integer("amount_total").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
