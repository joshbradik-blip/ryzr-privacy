import Stripe from "stripe";

let client: Stripe | undefined;

export function getStripe(): Stripe {
  if (!client) {
    const key = Netlify.env.get("STRIPE_SECRET_KEY");
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}

// Shop configuration. Kept in code so it is reviewed like any other change.
export const SHOP = {
  // Countries we ship to. Stripe Tax calculates tax from the shipping address.
  shippingCountries: ["US"] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
  currency: "usd",
  freeShippingThreshold: 7500, // cents
  maxQuantityPerItem: 10,
  maxLineItems: 20,
};

// Stripe tax code for shipping charges, so shipping is taxed correctly per state.
const SHIPPING_TAX_CODE = "txcd_92010001";

export function shippingOptions(subtotal: number): Stripe.Checkout.SessionCreateParams.ShippingOption[] {
  const standardFree = subtotal >= SHOP.freeShippingThreshold;
  return [
    {
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: standardFree ? "Free standard shipping" : "Standard shipping",
        fixed_amount: { amount: standardFree ? 0 : 599, currency: SHOP.currency },
        tax_behavior: "exclusive",
        tax_code: SHIPPING_TAX_CODE,
        delivery_estimate: {
          minimum: { unit: "business_day", value: 5 },
          maximum: { unit: "business_day", value: 7 },
        },
      },
    },
    {
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: "Express shipping",
        fixed_amount: { amount: 1499, currency: SHOP.currency },
        tax_behavior: "exclusive",
        tax_code: SHIPPING_TAX_CODE,
        delivery_estimate: {
          minimum: { unit: "business_day", value: 2 },
          maximum: { unit: "business_day", value: 3 },
        },
      },
    },
  ];
}
