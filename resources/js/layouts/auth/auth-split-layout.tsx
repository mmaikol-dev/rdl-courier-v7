import AppLogoIcon from '@/components/app-logo-icon';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Boxes, MapPinned, Route, ShieldCheck, Sparkles, Truck, Waves } from 'lucide-react';
import { type PropsWithChildren } from 'react';

interface AuthLayoutProps {
    title?: string;
    description?: string;
}

export default function AuthSplitLayout({ children, title, description }: PropsWithChildren<AuthLayoutProps>) {
    const { name, quote } = usePage<SharedData>().props;

    return (
        <div className="relative grid h-dvh flex-col items-center justify-center px-8 sm:px-0 lg:max-w-none lg:grid-cols-2 lg:px-0">
            <div className="relative hidden h-full flex-col overflow-hidden border-r border-white/10 bg-slate-950 p-10 text-white lg:flex">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_10%,_rgba(249,115,22,0.44),_transparent_23%),radial-gradient(circle_at_92%_12%,_rgba(59,130,246,0.34),_transparent_25%),radial-gradient(circle_at_50%_88%,_rgba(34,211,238,0.15),_transparent_18%),linear-gradient(145deg,_#020617_0%,_#0f172a_48%,_#082f49_100%)]" />
                <div className="pointer-events-none absolute left-6 top-24 h-72 w-72 rounded-full bg-orange-500/28 blur-3xl" />
                <div className="pointer-events-none absolute right-6 top-10 h-80 w-80 rounded-full bg-blue-500/24 blur-3xl" />
                <div className="pointer-events-none absolute bottom-10 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-cyan-400/16 blur-3xl" />
                <div className="pointer-events-none absolute left-10 top-40 h-28 w-28 rounded-[2rem] border border-white/10 bg-white/8 shadow-[0_25px_70px_rgba(249,115,22,0.12)] backdrop-blur-xl [transform:rotate(-18deg)]" />
                <div className="pointer-events-none absolute right-12 top-1/4 h-32 w-32 rounded-[2.4rem] border border-white/10 bg-white/8 shadow-[0_25px_80px_rgba(59,130,246,0.15)] backdrop-blur-xl [transform:rotate(16deg)]" />
                <div className="pointer-events-none absolute bottom-24 right-16 h-40 w-40 rounded-[2.75rem] border border-white/10 bg-gradient-to-br from-orange-400/14 to-blue-500/14 shadow-[0_25px_80px_rgba(15,23,42,0.4)] backdrop-blur-xl [transform:rotate(20deg)]" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

                <Link href={route('home')} className="relative z-20 flex items-center text-lg font-medium">
                    <AppLogoIcon className="mr-2 size-8 fill-current text-white" />
                    {name}
                </Link>

                <div className="relative z-20 mt-14 max-w-xl space-y-7">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-sm text-sky-100 backdrop-blur-xl">
                        <ShieldCheck className="h-4 w-4 text-orange-300" />
                        RealDeal Logistics Operations System
                    </div>

                    <div className="space-y-5">
                        <h2 className="max-w-2xl text-6xl font-semibold leading-[1.02] tracking-tight text-white">
                            One system to help RealDeal <span className="text-orange-400">run orders</span>, <span className="text-blue-400">track deliveries</span>, and <span className="text-cyan-300">control operations</span>.
                        </h2>
                        <p className="max-w-lg text-base leading-7 text-slate-200/85">
                            It helps the company import orders, assign and dispatch deliveries, manage products and warehouse movement, collect payments, update merchant sheets, follow up customers, and generate reports from one place.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-100 backdrop-blur-xl">
                            <Truck className="h-4 w-4 text-orange-300" />
                            Dispatch and delivery tracking
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-100 backdrop-blur-xl">
                            <Route className="h-4 w-4 text-blue-300" />
                            Route and agent coordination
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-100 backdrop-blur-xl">
                            <Boxes className="h-4 w-4 text-cyan-300" />
                            Warehouse and inventory flow
                        </div>
                    </div>
                </div>

                <div className="relative z-20 mt-auto">
                    <div className="grid grid-cols-[1.2fr_0.8fr] gap-5">
                        <div className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/10 p-6 shadow-[0_30px_100px_rgba(15,23,42,0.5)] backdrop-blur-2xl">
                            <div className="absolute -right-12 top-8 h-32 w-32 rounded-full bg-orange-400/12 blur-2xl" />
                            <div className="absolute left-10 top-24 h-px w-40 bg-gradient-to-r from-orange-300/60 to-transparent" />
                            <div className="absolute right-14 bottom-16 h-px w-28 bg-gradient-to-r from-blue-300/60 to-transparent" />

                            <div className="relative flex items-start justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.34em] text-orange-300">Live Dispatch Board</p>
                                    <p className="mt-3 text-3xl font-semibold text-white">Daily order operations</p>
                                    <p className="mt-2 max-w-xs text-sm leading-6 text-slate-300">
                                        Keep dispatch teams, delivery progress, and order status updates aligned on one shared workflow.
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-gradient-to-br from-orange-400 to-blue-500 p-3 text-slate-950 shadow-lg shadow-blue-950/30">
                                    <MapPinned className="h-5 w-5" />
                                </div>
                            </div>

                            <div className="relative mt-8 rounded-[1.75rem] border border-white/10 bg-slate-950/35 p-5">
                                <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-400">
                                    <span>Order intake</span>
                                    <span>Delivery closeout</span>
                                </div>
                                <div className="mt-5 h-3 rounded-full bg-white/10">
                                    <div className="h-3 w-[76%] rounded-full bg-gradient-to-r from-orange-400 via-orange-300 to-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.35)]" />
                                </div>
                                <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
                                    <span>Orders, sheets, and field updates connected</span>
                                    <span>Payments included</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-5">
                            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.4)] backdrop-blur-xl">
                                <div className="flex items-center justify-between">
                                    <Boxes className="h-5 w-5 text-orange-300" />
                                    <Sparkles className="h-4 w-4 text-sky-200" />
                                </div>
                                <p className="mt-4 text-2xl font-semibold text-white">Inventory + sheets</p>
                                <p className="mt-1 text-sm leading-6 text-slate-300">Track product movement, imports, transfers, and merchant sheet updates.</p>
                            </div>
                            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.4)] backdrop-blur-xl">
                                <div className="flex items-center justify-between">
                                    <Waves className="h-5 w-5 text-cyan-300" />
                                    <ShieldCheck className="h-4 w-4 text-orange-300" />
                                </div>
                                <p className="mt-4 text-2xl font-semibold text-white">Payments + follow-up</p>
                                <p className="mt-1 text-sm leading-6 text-slate-300">Support collections, customer communication, remittance checks, and reporting.</p>
                            </div>
                        </div>
                    </div>

                    {quote && (
                        <blockquote className="mt-5 max-w-lg rounded-[1.5rem] border border-white/10 bg-white/8 px-5 py-4 text-sm leading-6 text-slate-200/85 backdrop-blur-xl">
                            <p>&ldquo;{quote.message}&rdquo;</p>
                            <footer className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{quote.author}</footer>
                        </blockquote>
                    )}
                </div>
            </div>
            <div className="w-full lg:p-8">
                <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
                    <Link href={route('home')} className="relative z-20 flex items-center justify-center lg:hidden">
                        <AppLogoIcon className="h-10 fill-current text-black sm:h-12" />
                    </Link>
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
