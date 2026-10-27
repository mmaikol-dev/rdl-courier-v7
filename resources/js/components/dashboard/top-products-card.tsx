import { Link } from '@inertiajs/react';
import { ArrowUpRight, Trophy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardPageProps } from '@/types/dashboard';

interface TopProductsCardProps {
    products: NonNullable<DashboardPageProps['topProducts']>;
}

export function TopProductsCard({ products }: TopProductsCardProps) {
    const maxOrders = Math.max(1, ...products.map((product) => product.order_count));

    return (
        <Card className="rounded-2xl border bg-card p-4 shadow-xs">
            <CardHeader className="p-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Trophy aria-hidden="true" className="size-5" strokeWidth={1.75} />
                        </span>
                        <div>
                            <CardTitle className="text-[15px] font-semibold">Top 3 products</CardTitle>
                            <CardDescription className="mt-1 text-xs">By orders placed in the period</CardDescription>
                        </div>
                    </div>
                    <Link
                        href="/sheetorders"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Products <ArrowUpRight aria-hidden="true" className="size-3" />
                    </Link>
                </div>
            </CardHeader>

            <CardContent className="mt-5 space-y-5 p-0">
                {products.length === 0 ? (
                    <p className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                        No product orders in this period.
                    </p>
                ) : products.map((product, index) => {
                    const width = Math.max(6, (product.order_count / maxOrders) * 100);
                    const href = `/sheetorders?product_name=${encodeURIComponent(product.product_name)}`;

                    return (
                        <Link
                            key={product.product_name}
                            href={href}
                            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <div className="mb-2 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">
                                        <span className="mr-1 text-muted-foreground">{index + 1}.</span>
                                        {product.product_name}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {product.confirmed_count.toLocaleString()} confirmed
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-bold tabular-nums">
                                    {product.order_count.toLocaleString()}
                                </span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                                <div
                                    className={`h-full rounded-full ${index === 0 ? 'bg-primary' : 'bg-chart-2'}`}
                                    style={{ width: `${width}%` }}
                                />
                            </div>
                        </Link>
                    );
                })}
            </CardContent>
        </Card>
    );
}
