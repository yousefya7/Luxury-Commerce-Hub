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
    name: `RESILIENT — ${code.toUpperCase()}`,
    ...(type === "percentage"
      ? { percent_off: value }
      : type === "fixed"
      ? { amount_off: Math.round(value * 100), currency: "usd" }
      : { percent_off: 100 }),
    duration: "once",
    metadata: { resilient_code: code.toUpperCase() },
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

export async function syncProductToStripe(product: {
  id: string;
  name: string;
  description: string;
  price: string | number;
  images: string[];
  stripeProductId?: string | null;
  stripePriceId?: string | null;
}): Promise<{ stripeProductId: string; stripePriceId: string; syncedAt: Date }> {
  const stripe = getStripeClient();
  const priceCents = Math.round(Number(product.price) * 100);

  let stripeProductId = product.stripeProductId || null;
  let stripePriceId = product.stripePriceId || null;

  // If no Stripe ID stored, search Stripe by metadata before creating to prevent duplicates
  if (!stripeProductId) {
    try {
      const search = await stripe.products.search({
        query: `metadata["resilientProductId"]:"${product.id}"`,
        limit: 5,
      });
      const existing = search.data.find((p) => p.active);
      if (existing) {
        stripeProductId = existing.id;
        console.log(`[Stripe] Found existing product for "${product.name}" via metadata: ${stripeProductId}`);
      }
    } catch (e: any) {
      console.warn(`[Stripe] Metadata search failed for "${product.name}":`, e?.message);
    }
  }

  if (stripeProductId) {
    // Update existing Stripe product
    await stripe.products.update(stripeProductId, {
      name: product.name,
      description: product.description || undefined,
      images: product.images.slice(0, 8).filter(Boolean),
      tax_code: "txcd_10401000",
    });

    let priceChanged = true;
    if (stripePriceId) {
      try {
        const existingPrice = await stripe.prices.retrieve(stripePriceId);
        priceChanged = existingPrice.unit_amount !== priceCents;
      } catch {
        priceChanged = true;
      }
    } else {
      // Look for an active price on this product
      try {
        const prices = await stripe.prices.list({ product: stripeProductId, active: true, limit: 1 });
        if (prices.data[0] && prices.data[0].unit_amount === priceCents) {
          stripePriceId = prices.data[0].id;
          priceChanged = false;
        }
      } catch {
        priceChanged = true;
      }
    }

    if (priceChanged) {
      if (stripePriceId) {
        await stripe.prices.update(stripePriceId, { active: false }).catch(() => {});
      }
      const newPrice = await stripe.prices.create({
        product: stripeProductId,
        unit_amount: priceCents,
        currency: "usd",
      });
      stripePriceId = newPrice.id;
    }
  } else {
    // Create brand-new Stripe product
    const stripeProduct = await stripe.products.create({
      name: product.name,
      description: product.description || undefined,
      images: product.images.slice(0, 8).filter(Boolean),
      tax_code: "txcd_10401000",
      metadata: { resilientProductId: product.id },
    });
    stripeProductId = stripeProduct.id;

    const stripePrice = await stripe.prices.create({
      product: stripeProductId,
      unit_amount: priceCents,
      currency: "usd",
    });
    stripePriceId = stripePrice.id;
  }

  const syncedAt = new Date();
  console.log(`[Stripe] Synced product "${product.name}" → ${stripeProductId} / ${stripePriceId}`);
  return { stripeProductId, stripePriceId, syncedAt };
}

export async function archiveStripeProduct(stripeProductId: string): Promise<void> {
  const stripe = getStripeClient();
  try {
    await stripe.products.update(stripeProductId, { active: false });
    console.log(`[Stripe] Archived product ${stripeProductId}`);
  } catch (e: any) {
    console.warn(`[Stripe] Could not archive product ${stripeProductId}:`, e?.message);
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
