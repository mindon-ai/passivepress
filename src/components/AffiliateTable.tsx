interface AffiliateTableProps {
  children: React.ReactNode;
}

export function AffiliateTable({ children }: AffiliateTableProps) {
  return (
    <div className="not-prose my-8 overflow-x-auto rounded-lg border border-border bg-card/70 shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quick comparison</p>
      </div>
      <div className="affiliate-table min-w-full [&_a]:inline-flex [&_a]:rounded-md [&_a]:bg-amber-500 [&_a]:px-3 [&_a]:py-1.5 [&_a]:text-xs [&_a]:font-bold [&_a]:text-amber-950 [&_a]:no-underline hover:[&_a]:bg-amber-400 [&_table]:m-0 [&_table]:w-full [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3">
        {children}
      </div>
    </div>
  );
}
