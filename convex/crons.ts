import { cronJobs } from "convex/server";

const crons = cronJobs();

/**
 * Publish a fresh AI news article every day at 08:00 UTC.
 * Adjust hourUTC to match your preferred publish time:
 *   - 08:00 UTC = 09:00 CET / 10:00 CEST (good for European morning readers)
 *   - 13:00 UTC = morning US East Coast
 *
 * NOTE: The daily publish pipeline is currently triggered by an external
 * Hermes cron job (configured via hermes cron), not a Convex cron.
 * This registry is intentionally empty. Add a Convex cron here only if
 * the pipeline is moved to run entirely inside Convex functions.
 */

export default crons;
