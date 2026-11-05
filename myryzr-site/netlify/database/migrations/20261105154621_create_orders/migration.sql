CREATE TABLE "orders" (
	"id" serial PRIMARY KEY,
	"stripe_session_id" text NOT NULL UNIQUE,
	"stripe_payment_intent_id" text,
	"status" text NOT NULL,
	"customer_email" text,
	"customer_name" text,
	"shipping_name" text,
	"shipping_address" jsonb,
	"shipping_method" text,
	"line_items" jsonb NOT NULL,
	"currency" text NOT NULL,
	"amount_subtotal" integer NOT NULL,
	"amount_shipping" integer DEFAULT 0 NOT NULL,
	"amount_tax" integer DEFAULT 0 NOT NULL,
	"amount_total" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
