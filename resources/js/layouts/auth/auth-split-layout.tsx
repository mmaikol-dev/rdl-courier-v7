import { Carousel, CarouselApi, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    Boxes,
    MapPinned,
    Package,
    ShieldCheck,
    Sparkles,
    Truck,
    Waves,
} from 'lucide-react';
import * as React from 'react';
import { type PropsWithChildren } from 'react';

interface AuthLayoutProps {
    title?: string;
    description?: string;
}

const FEATURES = [
    {
        icon: Truck,
        accent: 'from-orange-400 to-amber-500',
        tag: 'Dispatch & Delivery',
        title: 'Live dispatch board',
        body: 'Import, assign, and dispatch deliveries with agents and progress aligned on one workflow.',
    },
    {
        icon: MapPinned,
        accent: 'from-blue-400 to-indigo-500',
        tag: 'Route Coordination',
        title: 'Track every route',
        body: 'Coordinate agents, follow up customers, and close out deliveries from one panel.',
    },
    {
        icon: Boxes,
        accent: 'from-cyan-400 to-teal-500',
        tag: 'Warehouse & Inventory',
        title: 'Products in motion',
        body: 'Manage product movement, transfers, merchant sheet updates, and stock alerts.',
    },
    {
        icon: Waves,
        accent: 'from-fuchsia-400 to-pink-500',
        tag: 'Payments & Reporting',
        title: 'Collections, verified',
        body: 'Collect payments, run remittance checks, and report from one source of truth.',
    },
];

const STATS = [
    { label: 'Orders processed', value: '12,400+' },
    { label: 'Countries', value: '4' },
    { label: 'Agents', value: '85' },
    { label: 'On-time', value: '97%' },
];

export default function AuthSplitLayout({ children, title, description }: PropsWithChildren<AuthLayoutProps>) {
    const [api, setApi] = React.useState<CarouselApi>();
    const [active, setActive] = React.useState(0);
    const [tick, setTick] = React.useState(0);
    const { quote } = usePage<SharedData>().props;

    React.useEffect(() => {
        if (!api) return;
        setActive(api.selectedScrollSnap());
        const onSelect = () => setActive(api.selectedScrollSnap());
        api.on('select', onSelect);

        const timer = setInterval(() => {
            if (api.canScrollNext()) api.scrollNext();
            else api.scrollTo(0);
        }, 5000);

        return () => {
            api.off('select', onSelect);
            clearInterval(timer);
        };
    }, [api]);

    React.useEffect(() => {
        const interval = setInterval(() => setTick((t) => (t + 1) % 3), 1400);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="relative grid h-dvh flex-col items-center justify-center px-8 sm:px-0 lg:max-w-none lg:grid-cols-2 lg:px-0">
            <div className="relative hidden h-full overflow-hidden border-r border-white/10 bg-slate-950 p-8 text-white xl:p-10 lg:flex lg:flex-col">
                {/* Animated background layer */}
                <div
                    className="absolute inset-0 bg-[radial-gradient(circle_at_8%_10%,_rgba(249,115,22,0.44),_transparent_23%),radial-gradient(circle_at_92%_12%,_rgba(59,130,246,0.34),_transparent_25%),radial-gradient(circle_at_50%_88%,_rgba(34,211,238,0.15),_transparent_18%),linear-gradient(145deg,_#020617_0%,_#0f172a_48%,_#082f49_100%)]"
                />
                {/* Drifting gradient blobs */}
                <div className="pointer-events-none absolute left-6 top-24 h-72 w-72 rounded-full bg-orange-500/28 blur-3xl motion-safe:animate-float-slow" />
                <div className="pointer-events-none absolute right-6 top-10 h-80 w-80 rounded-full bg-blue-500/24 blur-3xl motion-safe:animate-float" />
                <div className="pointer-events-none absolute bottom-10 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-cyan-400/16 blur-3xl motion-safe:animate-float-slow" />
                {/* Organic blob shapes */}
                <div className="pointer-events-none absolute left-[8%] top-[18%] h-40 w-40 bg-gradient-to-br from-orange-500/25 to-blue-500/20 blur-2xl motion-safe:animate-blob" />
                <div className="pointer-events-none absolute right-[10%] top-[40%] h-48 w-48 bg-gradient-to-br from-cyan-400/20 to-fuchsia-500/20 blur-2xl motion-safe:animate-blob" />
                {/* Floating glass cards */}
                <div className="pointer-events-none absolute left-10 top-40 h-28 w-28 rounded-[2rem] border border-white/10 bg-white/8 shadow-[0_25px_70px_rgba(249,115,22,0.12)] backdrop-blur-xl [transform:rotate(-18deg)] motion-safe:animate-drift" />
                <div className="pointer-events-none absolute right-12 top-1/4 h-32 w-32 rounded-[2.4rem] border border-white/10 bg-white/8 shadow-[0_25px_80px_rgba(59,130,246,0.15)] backdrop-blur-xl [transform:rotate(16deg)] motion-safe:animate-drift" />
                <div className="pointer-events-none absolute bottom-24 right-16 h-40 w-40 rounded-[2.75rem] border border-white/10 bg-gradient-to-br from-orange-400/14 to-blue-500/14 shadow-[0_25px_80px_rgba(15,23,42,0.4)] backdrop-blur-xl [transform:rotate(20deg)] motion-safe:animate-drift" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

                {/* Brand mark (wordmark only, no Laravel logo icon) */}
                <div className="relative z-20 flex items-center text-lg font-semibold tracking-tight">
                    RealDeal{' '}
                    <span className="ml-1.5 rounded-full bg-gradient-to-r from-orange-400 to-blue-400 bg-clip-text text-transparent">
                        Logistics
                    </span>
                </div>

                {/* Headline block */}
                <div className="relative z-20 mt-8 max-w-xl space-y-4 motion-safe:animate-fade-up">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-sky-100 backdrop-blur-xl">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                        </span>
                        <ShieldCheck className="h-3.5 w-3.5 text-orange-300" />
                        Operations System
                    </div>

                    <h2 className="max-w-2xl text-3xl font-semibold leading-[1.08] tracking-tight text-white xl:text-4xl">
                        One system to help RealDeal{' '}
                        <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">run orders</span>,{' '}
                        <span className="bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">track deliveries</span>, and{' '}
                        <span className="bg-gradient-to-r from-cyan-300 to-teal-300 bg-clip-text text-transparent">control operations</span>.
                    </h2>
                    <p className="max-w-lg text-sm leading-6 text-slate-200/85">
                        Import orders, dispatch deliveries, manage warehouse movement, collect payments, update merchant sheets, and generate
                        reports — all from one place.
                    </p>
                </div>

                {/* Animated live stats strip */}
                <div className="relative z-20 mt-6 grid grid-cols-4 gap-3">
                    {STATS.map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-2xl border border-white/10 bg-white/8 px-2 py-3 text-center backdrop-blur-xl"
                        >
                            <p className="text-lg font-semibold text-white motion-safe:animate-ticker">{stat.value}</p>
                            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{stat.label}</p>
                        </div>
                    ))}
                </div>

                {/* Animated dispatch mock */}
                <div className="relative z-20 mt-6 overflow-hidden rounded-[1.9rem] border border-white/10 bg-slate-950/40 p-5 shadow-[0_30px_100px_rgba(15,23,42,0.5)] backdrop-blur-2xl">
                    <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.3em] text-orange-300">Live Dispatch Board</p>
                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-300">
                            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
                            LIVE
                        </span>
                    </div>

                    <div className="relative mt-4 h-20 overflow-hidden rounded-[1.4rem] border border-white/10 bg-slate-950/40">
                        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 80" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#fb923c" />
                                    <stop offset="100%" stopColor="#60a5fa" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M20 60 C 80 16, 140 16, 200 44 S 330 66, 380 24"
                                fill="none"
                                stroke="url(#routeGrad)"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeDasharray="8 8"
                            />
                        </svg>

                        <div
                            className="absolute flex h-4 w-4 items-center justify-center"
                            style={{
                                left: `${[8, 45, 82][tick]}%`,
                                top: `${[58, 40, 18][tick]}%`,
                                transition: 'left 1.2s ease-in-out, top 1.2s ease-in-out',
                            }}
                        >
                            <span className="relative inline-flex h-3 w-3">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 motion-safe:animate-pulse-ring" />
                                <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
                            </span>
                        </div>

                        <div className="absolute left-3 top-2.5 flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-slate-200">
                            <MapPinned className="h-3 w-3 text-orange-300" /> Intake
                        </div>
                        <div className="absolute right-3 top-2.5 flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-slate-200">
                            <Truck className="h-3 w-3 text-blue-300" /> Delivered
                        </div>
                    </div>

                    <div className="mt-4">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-400">
                            <span>Order intake</span>
                            <span>Delivery closeout</span>
                        </div>
                        <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                            <div className="h-2.5 w-[76%] rounded-full bg-gradient-to-r from-orange-400 via-orange-300 to-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.35)]" />
                            <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-transparent via-white/40 to-transparent motion-safe:animate-shimmer" />
                        </div>
                        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-300">
                            <span className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-orange-300" />
                                Orders &amp; sheets connected
                            </span>
                            <span>Payments included</span>
                        </div>
                    </div>
                </div>

                {/* Feature carousel */}
                <div className="relative z-20 mt-6">
                    <Carousel setApi={setApi} opts={{ align: 'start', loop: true }} className="w-full">
                        <CarouselContent className="-ml-3">
                            {FEATURES.map((feature) => {
                                const Icon = feature.icon;
                                return (
                                    <CarouselItem key={feature.tag} className="basis-full pl-3 sm:basis-1/2 lg:basis-full">
                                        <div className="relative flex h-full items-center gap-3 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/10 p-4 backdrop-blur-2xl">
                                            <div
                                                className={`shrink-0 rounded-2xl bg-gradient-to-br ${feature.accent} p-2.5 text-slate-950 shadow-lg`}
                                            >
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-300">{feature.tag}</p>
                                                <p className="truncate text-lg font-semibold text-white">{feature.title}</p>
                                                <p className="line-clamp-2 text-xs leading-5 text-slate-300">{feature.body}</p>
                                            </div>
                                        </div>
                                    </CarouselItem>
                                );
                            })}
                        </CarouselContent>
                    </Carousel>

                    <div className="mt-3 flex items-center justify-center gap-2">
                        {FEATURES.map((feature, i) => (
                            <button
                                key={feature.tag}
                                onClick={() => api?.scrollTo(i)}
                                className={`h-2 rounded-full transition-all duration-300 ${
                                    active === i ? 'w-7 bg-orange-400' : 'w-2 bg-white/30 hover:bg-white/50'
                                }`}
                                aria-label={`Go to slide ${i + 1}`}
                            />
                        ))}
                    </div>
                </div>

                {/* Quote footer */}
                {quote && (
                    <blockquote className="relative z-20 mt-auto rounded-[1.5rem] border border-white/10 bg-white/8 px-5 py-3 text-sm leading-6 text-slate-200/85 backdrop-blur-xl">
                        <p className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 shrink-0 text-orange-300" />
                            <span>&ldquo;{quote.message}&rdquo;</span>
                        </p>
                        <footer className="mt-1.5 text-xs uppercase tracking-[0.2em] text-slate-400">{quote.author}</footer>
                    </blockquote>
                )}
            </div>
            <div className="w-full lg:p-8">
                <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
                    <div className="flex flex-col items-start gap-2 text-left sm:items-center sm:text-center">
                        <h1 className="text-xl font-medium">{title}</h1>
                        <p className="text-sm text-balance text-muted-foreground">{description}</p>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}
