import Stripe from "stripe";

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" });
}

let _stripeAccountChecked = false;
export async function verifyStripeAccount(): Promise<void> {
  if (_stripeAccountChecked) return;
  _stripeAccountChecked = true;
  try {
    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve();
    const keyMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "LIVE" : "TEST";
    console.log(`[Stripe] Account: ${account.id} (${keyMode} mode)`);
    if (keyMode === "TEST") {
      console.warn("[Stripe] WARNING: Using TEST secret key — payments and tax will not work in production.");
    }
  } catch (e: any) {
    console.error("[Stripe] Account verification failed:", e?.message);
  }
}

export async function createRefund(
  paymentIntentId: string
): Promise<{ id: string; method: "refund" | "cancel" }> {
  const stripe = getStripeClient();

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (pi.status === "canceled") {
    return { id: `pi_already_canceled_${paymentIntentId}`, method: "cancel" };
  }

  if (pi.status === "requires_capture") {
    await stripe.paymentIntents.cancel(paymentIntentId);
    return { id: `pi_canceled_${paymentIntentId}`, method: "cancel" };
  }

  if (
    pi.status === "requires_payment_method" ||
    pi.status === "requires_confirmation" ||
    pi.status === "requires_action"
  ) {
    await stripe.paymentIntents.cancel(paymentIntentId);
    return { id: `pi_canceled_${paymentIntentId}`, method: "cancel" };
  }

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    reason: "requested_by_customer",
  });

  return { id: refund.id, method: "refund" };
}

export async function createStripeCoupon(
  code: string,
  type: "percentage" | "fixed" | "free_shipping",
  value: number
): Promise<string> {
  const stripe = getStripeClient();
  const couponParams: Stripe.CouponCreateParams = {
    id: `RESILIENT_${code.toUpperCase()}`,
    name: code.toUpperCase(),
    ...(type === "percentage"
      ? { percent_off: value }
      : type === "fixed"
      ? { amount_off: Math.round(value * 100), currency: "usd" }
      : { percent_off: 100 }),
    duration: "once",
  };
  const coupon = await stripe.coupons.create(couponParams);
  return coupon.id;
}

export async function deleteStripeCoupon(couponId: string): Promise<void> {
  const stripe = getStripeClient();
  try {
    await stripe.coupons.del(couponId);
  } catch (e) {
    console.warn("[Stripe] Could not delete coupon:", e);
  }
}

export async function calculateTaxAmount(
  amountCents: number,
  address: { line1: string; city: string; state: string; postalCode: string }
): Promise<number> {
  const stripe = getStripeClient();

  console.log("[Tax] Calculating tax for address:", {
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: "US",
    amountCents,
  });

  try {
    const calculation = await (stripe as any).tax.calculations.create({
      currency: "usd",
      line_items: [
        {
          amount: amountCents,
          reference: "order",
          tax_behavior: "exclusive",
          tax_code: "txcd_10401000",
        },
      ],
      customer_details: {
        address: {
          line1: address.line1,
          city: address.city,
          state: address.state,
          postal_code: address.postalCode,
          country: "US",
        },
        address_source: "shipping",
      },
    });

    const taxAmount = calculation.tax_amount_exclusive ?? 0;

    if (taxAmount === 0) {
      console.warn(
        `[Tax] Stripe returned $0 tax for state "${address.state}" (ZIP ${address.postalCode}). ` +
        `This likely means no tax registration exists for this state in Stripe Dashboard → Settings → Tax → Registrations.`
      );
    } else {
      console.log(`[Tax] Calculated tax: ${taxAmount} cents for state "${address.state}" (ZIP ${address.postalCode})`);
    }

    return taxAmount;
  } catch (e: any) {
    console.error("[Tax] Stripe Tax calculation failed — falling back to $0 tax:", {
      message: e?.message,
      type: e?.type,
      code: e?.code,
      param: e?.param,
      statusCode: e?.statusCode,
    });
    return 0;
  }
}

export async function createPaymentIntent(
  amountDollars: number,
  metadata: Record<string, string> = {}
): Promise<{ clientSecret: string; id: string }> {
  const stripe = getStripeClient();
  const amountCents = Math.round(amountDollars * 100);

  const pi = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: { platform: "resilient-store", ...metadata },
  });

  if (!pi.client_secret) throw new Error("Failed to create payment intent");
  return { clientSecret: pi.client_secret, id: pi.id };
}
