import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateRequest } from "./auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    user = await authenticateRequest(opts.req);
    if (!user) {
      const authHeader = opts.req.headers.authorization;
      const hasCookie = !!opts.req.headers.cookie;
      console.log(`[Context] Auth failed - Bearer: ${!!authHeader}, Cookie: ${hasCookie}`);
    }
  } catch (e: any) {
    console.error("[Context] Auth error:", e?.message);
    user = null;
  }
  return { req: opts.req, res: opts.res, user };
}
