import { query } from "./_generated/server";
import { isConfiguredAdmin } from "./lib/authz";

export const getMyRole = query({
  args: {},
  handler: async (ctx) => {
    const isAdmin = await isConfiguredAdmin(ctx);
    return isAdmin ? "admin" : null;
  },
});
