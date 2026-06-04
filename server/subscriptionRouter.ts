import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import {
  createSubscriptionCheckout,
  createCustomerPortal,
  isPro,
  FREE_LIMITS,
} from "./stripeService";

const APP_URL = process.env.APP_URL || "https://mycareeriq.reviveiqi.com";

export const subscriptionRouter = router({
  // Get current user's subscription status
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const result = await db
      .select({
        plan: users.plan,
        planInterval: users.planInterval,
        planStatus: users.planStatus,
        planExpiresAt: users.planExpiresAt,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    const user = result[0];
    if (!user) throw new Error("User not found");

    const pro = isPro(user as any);

    return {
      plan: user.plan || "free",
      planInterval: user.planInterval,
      planStatus: user.planStatus || "active",
      planExpiresAt: user.planExpiresAt,
      isPro: pro,
      limits: pro
        ? { runsPerMonth: -1, pipelineJobs: -1 } // unlimited
        : { runsPerMonth: FREE_LIMITS.runsPerMonth, pipelineJobs: FREE_LIMITS.pipelineJobs },
    };
  }),

  // Create checkout session for a plan
  createCheckout: protectedProcedure
    .input(z.object({
      plan: z.enum(["pro_monthly", "pro_annual"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const result = await db
        .select({
          email: users.email,
          name: users.name,
          stripeCustomerId: users.stripeCustomerId,
        })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      const user = result[0];
      if (!user) throw new Error("User not found");

      const { url, sessionId } = await createSubscriptionCheckout({
        userId: ctx.user.id,
        email: user.email || "",
        name: (user.name as string) || "",
        plan: input.plan,
        existingCustomerId: user.stripeCustomerId,
        successUrl: `${APP_URL}/?payment=success`,
        cancelUrl: `${APP_URL}/?payment=canceled`,
      });

      return { url, sessionId };
    }),

  // Verify a completed checkout session and update plan immediately
  // Used as fallback when webhook is delayed or not yet configured
  verifySession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      try {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" as any });

        const session = await stripe.checkout.sessions.retrieve(input.sessionId, {
          expand: ["subscription"],
        });

        if (session.payment_status !== "paid") {
          return { success: false, message: "Payment not completed" };
        }

        const sub = session.subscription as any;
        const plan = (session.metadata?.plan || "pro_monthly").includes("annual") ? "pro_annual" : "pro_monthly";
        const interval = plan === "pro_annual" ? "year" : "month";
        const expiresAt = sub?.current_period_end
          ? new Date((sub as any).current_period_end * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await db.update(users).set({
          plan: "pro" as any,
          planInterval: interval,
          planStatus: "active",
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          planExpiresAt: expiresAt,
        } as any).where(eq(users.id, ctx.user.id));

        // Update run limit
        const { researchConfig } = await import("../drizzle/schema");
        await db.update(researchConfig)
          .set({ monthlyRunLimit: 9999 } as any)
          .where(eq(researchConfig.userId, ctx.user.id));

        console.log(`[Stripe] Session verified — userId ${ctx.user.id} upgraded to Pro`);
        return { success: true, plan: "pro", interval };
      } catch (err: any) {
        console.error("[Stripe] Session verification failed:", err.message);
        throw new Error("Failed to verify payment");
      }
    }),

  // Create customer portal session for managing/canceling
  createPortal: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const result = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    const user = result[0];
    if (!user?.stripeCustomerId) {
      throw new Error("No billing account found — subscribe first");
    }

    const url = await createCustomerPortal(
      user.stripeCustomerId,
      `${APP_URL}/?tab=settings`
    );

    return { url };
  }),
});
