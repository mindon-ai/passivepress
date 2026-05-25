import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * AdSlot renders admin-managed ad HTML for a markdown ad token slot.
 *
 * Authors place a slot in markdown with:
 * ```ad
 * { "slot": "article-mid" }
 * ```
 *
 * Admins manage the actual network code from Admin → Ads.
 */
export const AdSlot = ({ slot, className = "" }: { slot?: string; format?: string; className?: string }) => {
  const ad = useQuery(api.ads.getBySlot, slot ? { slot } : "skip");

  if (!slot) return null;

  return (
    <aside className={`my-10 ${className}`} aria-label="Advertisement">
      {ad?.code ? (
        <div className="not-prose" dangerouslySetInnerHTML={{ __html: ad.code }} />
      ) : (
        <div className="rounded-sm border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs uppercase tracking-widest text-muted-foreground">
          Advertisement
          <div className="mt-1 text-[10px] normal-case tracking-normal opacity-60">
            Unconfigured ad slot: <code>{slot}</code>
          </div>
        </div>
      )}
    </aside>
  );
};
