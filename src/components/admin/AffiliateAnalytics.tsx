import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ExternalLink, MousePointerClick, PackageSearch, ShoppingCart } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface TopAffiliateLink {
  id: string;
  postSlug: string;
  asin: string;
  productTitle: string;
  placeholderType: string;
  clickCount: number;
  affiliateUrl: string;
}

interface AffiliateSummary {
  totalLinks: number;
  totalClicks: number;
  uniquePosts: number;
  uniqueProducts: number;
  topLinks: TopAffiliateLink[];
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof MousePointerClick }) {
  return (
    <div className="rounded-md bg-muted p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}

export function AffiliateAnalytics() {
  const summary = useQuery(api.affiliateLinks.getSummary, {}) as AffiliateSummary | undefined;

  if (summary === undefined) {
    return <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading affiliate analytics…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MousePointerClick className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Affiliate analytics</CardTitle>
        </div>
        <CardDescription>Publish-time link inventory and click counts captured by /api/track-click.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Clicks" value={summary.totalClicks} icon={MousePointerClick} />
          <StatCard label="Links" value={summary.totalLinks} icon={ShoppingCart} />
          <StatCard label="Posts" value={summary.uniquePosts} icon={ExternalLink} />
          <StatCard label="Products" value={summary.uniqueProducts} icon={PackageSearch} />
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">ASIN</th>
                <th className="p-3">Post</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {summary.topLinks.map((link) => (
                <tr key={link.id} className="border-t border-border">
                  <td className="max-w-xs truncate p-3">
                    <a href={link.affiliateUrl} target="_blank" rel="sponsored noopener noreferrer" className="hover:text-accent">
                      {link.productTitle}
                    </a>
                  </td>
                  <td className="p-3 font-mono text-xs">{link.asin}</td>
                  <td className="p-3"><a className="hover:text-accent" href={`/${link.postSlug}`}>/{link.postSlug}</a></td>
                  <td className="p-3">{link.placeholderType}</td>
                  <td className="p-3 text-right font-semibold">{link.clickCount.toLocaleString()}</td>
                </tr>
              ))}
              {summary.topLinks.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No affiliate links have been published yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
