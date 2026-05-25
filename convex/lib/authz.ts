import type { MutationCtx, QueryCtx } from "../_generated/server";

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  return identity;
}

export async function isConfiguredAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !adminEmail) return false;
  return identity.email?.trim().toLowerCase() === adminEmail;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await requireUser(ctx);
  if (!adminEmail) throw new Error("Admin auth is not configured");

  if (identity.email?.trim().toLowerCase() !== adminEmail) {
    throw new Error("Forbidden");
  }

  return identity;
}
