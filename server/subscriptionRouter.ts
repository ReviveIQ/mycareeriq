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
