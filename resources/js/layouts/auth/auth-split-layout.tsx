import BrandLogo from '@/components/brand-logo';
import * as React from 'react';
import { type PropsWithChildren } from 'react';

interface AuthLayoutProps {
    title?: string;
    description?: string;
}

const CYCLING_WORDS = ['Everywhere.', 'On Time.', 'Securely.', 'Tracked.', 'Without Limits.'];

export default function AuthSplitLayout({ children, title, description }: PropsWithChildren<AuthLayoutProps>) {
    const [wordIndex, setWordIndex] = React.useState(0);

    React.useEffect(() => {
        const interval = setInterval(() => {
            setWordIndex((i) => (i + 1) % CYCLING_WORDS.length);
        }, 2600);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="relative grid h-dvh flex-col items-center justify-center px-8 sm:px-0 lg:max-w-none lg:grid-cols-2 lg:px-0">
            <div className="relative hidden h-full overflow-hidden border-r border-white/10 bg-slate-950 text-white lg:flex lg:flex-col">
                {/* Base orange/blue glow backdrop */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,_rgba(249,115,22,0.32),_transparent_36%),radial-gradient(circle_at_85%_88%,_rgba(59,130,246,0.3),_transparent_38%),linear-gradient(150deg,_#020617_0%,_#0f172a_50%,_#082f49_100%)]" />
                {/* Soft edge blend into the form side */}
                <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-28 bg-gradient-to-l from-slate-950/70 to-transparent" />

                <div className="relative z-30 flex h-full w-full flex-col p-10 xl:p-14">
                    {/* Brand mark */}
                    <div className="flex items-center gap-3.5">
                        <div className="relative">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-slate-900/60 shadow-lg shadow-blue-950/40 backdrop-blur-xl">
                                <BrandLogo className="h-8 w-8" />
                            </div>
                            <div className="pointer-events-none absolute -inset-0.5 -z-10 rounded-[1.1rem] bg-gradient-to-br from-orange-500/70 to-blue-600/70 opacity-60 blur-md" />
                        </div>
                        <div>
                            <p className="text-xl font-bold leading-tight tracking-tight">
                                RealDeal{' '}
                                <span className="bg-gradient-to-r from-orange-400 to-blue-400 bg-clip-text text-transparent">Courier</span>
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.34em] text-slate-400">
                                Logistics &amp; Delivery Services
                            </p>
                        </div>
                    </div>

                    {/* Center headline block */}
                    <div className="flex flex-1 flex-col justify-center">
                        <div className="inline-flex w-fit items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-xl">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-80" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-400" />
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-200">Delivery Services</span>
                        </div>

                        <h1 className="mt-8 text-5xl font-semibold leading-[1.05] tracking-tight xl:text-6xl">
                            We deliver
                            <br />
                            <span
                                key={wordIndex}
                                className="inline-block bg-gradient-to-r from-orange-400 via-amber-300 to-blue-400 bg-clip-text text-transparent motion-safe:animate-fade-in-out"
                            >
                                {CYCLING_WORDS[wordIndex]}
                            </span>
                        </h1>

                        <p className="mt-6 max-w-md text-base leading-7 text-slate-300/90">
                            From order intake to final delivery — track every package, coordinate every dispatch, and collect every payment
                            from one control room.
                        </p>
                    </div>

                    {/* Bottom strip */}
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
                        <span>Across 4 African countries</span>
                        <span className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Systems online
                        </span>
                    </div>
                </div>
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

            {/* Designed by attribution */}
            <div className="pointer-events-none absolute bottom-4 right-5 z-50 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Designed &amp; Developed by
                <span className="bg-gradient-to-r from-orange-500 to-blue-500 bg-clip-text font-semibold text-transparent">
                    Colony-One
                </span>
            </div>
        </div>
    );
}