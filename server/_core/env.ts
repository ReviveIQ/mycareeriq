export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "change-me-in-production",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  hunterApiKey: process.env.HUNTER_API_KEY ?? "",
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  // Manus forge API — only used if explicitly set, otherwise falls back to OpenAI directly
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
};
