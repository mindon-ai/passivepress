import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const subscribe = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    // Simple email regex validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email address");
    }

    // Check if already exists
    const existing = await ctx.db
      .query("newsletterSubscriptions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) {
      if (existing.status === "active") {
        return { success: true, message: "Already subscribed!" };
      }
      
      // Reactive if previously unsubscribed
      await ctx.db.patch(existing._id, {
        status: "active",
        subscribedAt: Date.now(),
      });
      return { success: true, message: "Welcome back!" };
    }

    // Create new subscription
    await ctx.db.insert("newsletterSubscriptions", {
      email,
      subscribedAt: Date.now(),
      status: "active",
    });

    return { success: true, message: "Subscribed successfully!" };
  },
});
