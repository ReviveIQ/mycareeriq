/**
 * MyCareerIQ Stripe Service
 *
 * Handles subscription checkout, webhook processing, and customer portal.
 *
 * Plans:
 *   Pro Monthly:  $49.99/month  — STRIPE_PRICE_PRO_MONTHLY env var
 *   Pro Annual:   $299.00/year  — STRIPE_PRICE_PRO_ANNUAL env var
 *
 * No auto-renew: subscriptions use cancel_at_period_end = true by default.
 * User must actively renew. This matches ReviveIQI pricing policy.
 */

import Stripe from "stripe";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" as any });
}

export const PLANS = {
  pro_monthly: {
    name: "MyCareerIQ Pro — Monthly",
    price: 4999, // cents
    interval: "month" as const,
    description: "Unlimited job research runs, unlimited pipeline, cover letters",
  },
  pro_annual: {
    name: "MyCareerIQ Pro — Annual",
    price: 29900, // cents — $299/year
    interval: "year" as const,
    description: "Best value — save 50% vs monthly ($24.92/month)",
  },
};

// Free tier limits
export const FREE_LIMITS = {
  runsPerMonth: 3,
  pipelineJobs: 10,
};

/**
 * Create or retrieve a Stripe customer for a user.
 */
export async function getOrCreateCustomer(
  userId: number,
  email: string,
  name: string,
  existingCustomerId?: string | null
): Promise<string> {
  const stripe = getStripe();

  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      if (!customer.deleted) return existingCustomerId;
    } catch { /* customer may have been deleted */ }
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { userId: String(userId) },
  });

  return customer.id;
}

/**
 * Create a Stripe Checkout session for a subscription plan.
 * Sets cancel_at_period_end = true so it doesn't auto-renew.
 */
export async function createSubscriptionCheckout(params: {
  userId: number;
  email: string;
  name: string;
  plan: "pro_monthly" | "pro_annual";
  existingCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();

  const customerId = await getOrCreateCustomer(
    params.userId,
    params.email,
    params.name,
    params.existingCustomerId
  );

  // Get or create the price in Stripe
  const priceId = await getOrCreatePrice(params.plan);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      metadata: {
        userId: String(params.userId),
        plan: params.plan,
        cancel_at_period_end: "true",
      },
    },
    success_url: `${params.successUrl}?session_id={CHECKOUT_SESSION_ID}&plan=${params.plan}`,
    cancel_url: params.cancelUrl,
    metadata: {
      userId: String(params.userId),
      plan: params.plan,
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id };
}

/**
 * Create a Stripe Customer Portal session so users can manage/cancel.
 */
export async function createCustomerPortal(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * Get or create a Stripe Price for a plan.
 * Checks STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_ANNUAL env vars first.
 * Creates inline prices if env vars not set (useful for first-time setup).
 */
async function getOrCreatePrice(plan: "pro_monthly" | "pro_annual"): Promise<string> {
  const envVar = plan === "pro_monthly"
    ? process.env.STRIPE_PRICE_PRO_MONTHLY
    : process.env.STRIPE_PRICE_PRO_ANNUAL;

  if (envVar) return envVar;

  // Create the price dynamically if not configured
  const stripe = getStripe();
  const planData = PLANS[plan];

  const product = await stripe.products.create({
    name: planData.name,
    description: planData.description,
    metadata: { plan },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: planData.price,
    currency: "usd",
    recurring: { interval: planData.interval },
    metadata: { plan },
  });

  console.log(`[Stripe] Created price ${price.id} for ${plan} — add to Railway as ${
    plan === "pro_monthly" ? "STRIPE_PRICE_PRO_MONTHLY" : "STRIPE_PRICE_PRO_ANNUAL"
  }`);

  return price.id;
}

/**
 * Handle Stripe webhook events.
 * Returns updated user fields to write to DB.
 */
export async function handleWebhookEvent(
  payload: Buffer,
  signature: string
): Promise<{
  type: string;
  userId?: number;
  updates?: {
    plan: "free" | "pro";
    planInterval?: string;
    planStatus: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    planExpiresAt?: Date;
  };
} | null> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[Stripe] STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
  }

  let event: Stripe.Event;
  try {
    event = secret
      ? stripe.webhooks.constructEvent(payload, signature, secret)
      : JSON.parse(payload.toString());
  } catch (err) {
    console.error("[Stripe] Webhook signature verification failed:", err);
    throw new Error("Invalid webhook signature");
  }

  console.log(`[Stripe] Webhook: ${event.type}`);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = parseInt(session.metadata?.userId || "0");
      if (!userId) { console.warn("[Stripe] No userId in checkout session metadata"); return null; }

      // Retrieve subscription details
      const subId = session.subscription as string;
      const sub = await stripe.subscriptions.retrieve(subId);
      const plan = (session.metadata?.plan || "pro_monthly").includes("annual") ? "pro_annual" : "pro_monthly";
      const interval = plan === "pro_annual" ? "year" : "month";
      // current_period_end is in billing_cycle_anchor or items in newer API versions
      const expiresAt = new Date(((sub as any).current_period_end || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60) * 1000);

      console.log(`[Stripe] Subscription activated for userId ${userId} — ${plan} expires ${expiresAt.toISOString()}`);

      return {
        type: event.type,
        userId,
        updates: {
          plan: "pro",
          planInterval: interval,
          planStatus: "active",
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subId,
          planExpiresAt: expiresAt,
        },
      };
    }

    case "customer.subscription.deleted":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = parseInt(sub.metadata?.userId || "0");
      if (!userId) {
        // Try to find userId from customer metadata
        console.warn("[Stripe] No userId in subscription metadata, looking up by customerId");
        return { type: event.type }; // Non-fatal
      }

      const isActive = sub.status === "active" || sub.status === "trialing";
      const isCanceled = sub.status === "canceled" || sub.cancel_at_period_end;

      if (event.type === "customer.subscription.deleted" || sub.status === "canceled") {
        console.log(`[Stripe] Subscription canceled for userId ${userId}`);
        return {
          type: event.type,
          userId,
          updates: {
            plan: "free",
            planStatus: "canceled",
            planExpiresAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : undefined,
          },
        };
      }

      return {
        type: event.type,
        userId,
        updates: {
          plan: isActive ? "pro" : "free",
          planStatus: sub.status,
          planExpiresAt: new Date(((sub as any).current_period_end || 0) * 1000),
        },
      };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as any;
      const sub = invoice.subscription
        ? await stripe.subscriptions.retrieve(invoice.subscription as string)
        : null;
      const userId = parseInt(sub?.metadata?.userId || "0");
      if (userId) {
        console.warn(`[Stripe] Payment failed for userId ${userId}`);
        return {
          type: event.type,
          userId,
          updates: {
            plan: "pro", // Keep access until period ends
            planStatus: "past_due",
          },
        };
      }
      return null;
    }

    default:
      return { type: event.type };
  }
}

/**
 * Check if a user has an active pro subscription.
 */
export function isPro(user: {
  plan?: string | null;
  planStatus?: string | null;
  planExpiresAt?: Date | null;
}): boolean {
  if (user.plan !== "pro") return false;
  if (user.planStatus === "canceled" && user.planExpiresAt) {
    // Allow access until period actually ends
    return new Date() < new Date(user.planExpiresAt);
  }
  return user.planStatus === "active" || user.planStatus === "past_due";
}
