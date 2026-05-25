import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface MarkdownChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface MarkdownChartSpec {
  id: string;
  title: string;
  description: string;
  type: "bar" | "line" | "area";
  xKey: string;
  series: MarkdownChartSeries[];
  data: Array<Record<string, string | number>>;
  insight?: string;
  sourceLabel?: string;
}

function toChartConfig(series: MarkdownChartSeries[]): ChartConfig {
  return series.reduce<ChartConfig>((acc, item, index) => {
    acc[item.key] = {
      label: item.label,
      color: item.color || `hsl(var(--chart-${(index % 5) + 1}))`,
    };
    return acc;
  }, {});
}

function formatTick(value: string | number): string {
  if (typeof value === "number") {
    if (Math.abs(value) >= 1000) return value.toLocaleString();
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value);
}

export function MarkdownChart({ chart, className }: { chart: MarkdownChartSpec; className?: string }) {
  const config = toChartConfig(chart.series);

  const renderSeries = () => {
    if (chart.type === "line") {
      return chart.series.map((series) => (
        <Line
          key={series.key}
          type="monotone"
          dataKey={series.key}
          stroke={`var(--color-${series.key})`}
          strokeWidth={2.5}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      ));
    }

    if (chart.type === "area") {
      return chart.series.map((series) => (
        <Area
          key={series.key}
          type="monotone"
          dataKey={series.key}
          stroke={`var(--color-${series.key})`}
          fill={`var(--color-${series.key})`}
          fillOpacity={0.22}
          strokeWidth={2.25}
        />
      ));
    }

    return chart.series.map((series, index) => (
      <Bar
        key={series.key}
        dataKey={series.key}
        fill={`var(--color-${series.key})`}
        radius={chart.series.length === 1 ? 6 : [6, 6, 0, 0]}
        maxBarSize={chart.series.length === 1 ? 56 : 32}
      />
    ));
  };

  const chartBody = () => {
    const commonProps = {
      data: chart.data,
      margin: { top: 8, right: 12, left: 0, bottom: 8 },
    };

    const commonChildren = (
      <>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={chart.xKey}
          tickLine={false}
          axisLine={false}
          minTickGap={20}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatTick(value)}
          width={48}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {chart.series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {renderSeries()}
      </>
    );

    if (chart.type === "line") return <LineChart {...commonProps}>{commonChildren}</LineChart>;
    if (chart.type === "area") return <AreaChart {...commonProps}>{commonChildren}</AreaChart>;
    return <BarChart {...commonProps}>{commonChildren}</BarChart>;
  };

  return (
    <Card className={cn("not-prose my-8 overflow-hidden border-border/70 bg-card/60", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-semibold leading-tight">{chart.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{chart.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartContainer config={config} className="h-[320px] w-full aspect-auto">
          {chartBody()}
        </ChartContainer>
        {(chart.insight || chart.sourceLabel) && (
          <div className="space-y-1 text-sm">
            {chart.insight ? <p className="text-foreground/90">{chart.insight}</p> : null}
            {chart.sourceLabel ? (
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Source: {chart.sourceLabel}</p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
