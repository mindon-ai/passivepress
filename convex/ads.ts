import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/authz";

const adSlotFields = {
  slot: v.string(),
  name: v.string(),
  code: v.string(),
  isActive: v.boolean(),
};

async function getAdSlotBySlot(ctx: any, slot: string) {
  return await ctx.db
    .query("adSlots")
    .withIndex("by_slot", (q: any) => q.eq("slot", slot))
    .unique();
}

function normalizeSlot(slot: string) {
  return slot.trim();
}

export const getBySlot = query({
  args: {
    slot: v.string(),
  },
  handler: async (ctx, { slot }) => {
    const normalizedSlot = normalizeSlot(slot);
    if (!normalizedSlot) return null;

    const adSlot = await getAdSlotBySlot(ctx, normalizedSlot);
    if (!adSlot || !adSlot.isActive) return null;

    return {
      slot: adSlot.slot,
      name: adSlot.name,
      code: adSlot.code,
    };
  },
});

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const slots = await ctx.db.query("adSlots").withIndex("by_updatedAt").order("desc").collect();

    return slots.map((slot) => ({
      id: slot._id,
      slot: slot.slot,
      name: slot.name,
      code: slot.code,
      isActive: slot.isActive,
      createdAt: slot.createdAt,
      updatedAt: slot.updatedAt,
      updatedBy: slot.updatedBy ?? null,
    }));
  },
});

export const upsert = mutation({
  args: adSlotFields,
  handler: async (ctx, { slot, name, code, isActive }) => {
    const identity = await requireAdmin(ctx);
    const normalizedSlot = normalizeSlot(slot);
    if (!normalizedSlot) throw new Error("Slot key is required");
    if (!name.trim()) throw new Error("Slot name is required");
    if (!code.trim()) throw new Error("Ad code is required");

    const now = Date.now();
    const existing = await getAdSlotBySlot(ctx, normalizedSlot);

    if (existing) {
      await ctx.db.patch(existing._id, {
        slot: normalizedSlot,
        name: name.trim(),
        code,
        isActive,
        updatedAt: now,
        updatedBy: identity.email,
      });
      return existing._id;
    }

    return await ctx.db.insert("adSlots", {
      slot: normalizedSlot,
      name: name.trim(),
      code,
      isActive,
      createdAt: now,
      updatedAt: now,
      updatedBy: identity.email,
    });
  },
});

export const remove = mutation({
  args: {
    id: v.id("adSlots"),
  },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
    return id;
  },
});
