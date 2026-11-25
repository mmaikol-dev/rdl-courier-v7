import { useAppearance, type Appearance } from '@/hooks/use-appearance';
import * as React from 'react';
import { flushSync } from 'react-dom';

const EASE = 'cubic-bezier(0.16,1,0.3,1)';
const THROW = 'cubic-bezier(0.34,1.36,0.64,1)';
const FOCUS =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const reducedQuery = '(prefers-reduced-motion: reduce)';
const darkQuery = '(prefers-color-scheme: dark)';

const subscribeQuery = (q: string) => (onChange: () => void) => {
    const query = window.matchMedia(q);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
};

const useMedia = (q: string) =>
    React.useSyncExternalStore(
        subscribeQuery(q),
        () => window.matchMedia(q).matches,
        () => false,
    );

function SunMoon({ dark, reduced, className = 'size-[18px]' }: { dark: boolean; reduced: boolean; className?: string }) {
    const id = React.useId().replace(/:/g, '');
    const t = (ms: number, ease = EASE) => (reduced ? 'none' : `transform ${ms}ms ${ease}, opacity ${Math.round(ms * 0.6)}ms ${EASE}`);

    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className}>
            <mask id={`${id}-shadow`}>
                <rect width="24" height="24" fill="white" />
                <circle
                    cx="12"
                    cy="12"
                    r="8"
                    fill="black"
                    style={{ transform: dark ? 'translate(5px,-5px)' : 'translate(14px,-14px)', transition: t(560) }}
                />
            </mask>
            <circle
                cx="12"
                cy="12"
                r="8"
                fill="currentColor"
                mask={`url(#${id}-shadow)`}
                style={{ transformOrigin: '12px 12px', transform: dark ? 'scale(1.05)' : 'scale(0.55)', transition: t(560, THROW) }}
            />
            <g
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                style={{
                    transformOrigin: '12px 12px',
                    transform: dark ? 'rotate(-90deg) scale(0.4)' : 'none',
                    opacity: dark ? 0 : 1,
                    transition: t(520),
                }}
            >
                {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                    <line key={a} x1="12" y1="2.5" x2="12" y2="4.5" transform={`rotate(${a} 12 12)`} />
                ))}
            </g>
        </svg>
    );
}

function withReveal(from: HTMLElement | null, apply: () => void, enabled: boolean) {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };

    if (!enabled || !from || !doc.startViewTransition) {
        const hold = document.createElement('style');
        hold.textContent = '*,*::before,*::after{transition:none!important}';
        document.head.appendChild(hold);
        apply();
        void document.body.offsetHeight;
        requestAnimationFrame(() => hold.remove());
        return;
    }

    const r = from.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const style = document.createElement('style');
    style.textContent = '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}';
    document.head.appendChild(style);

    const transition = doc.startViewTransition(() => flushSync(apply));
    transition.ready
        .then(() =>
            document.documentElement.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                { duration: 620, easing: 'cubic-bezier(0.65,0,0.35,1)', pseudoElement: '::view-transition-new(root)' },
            ),
        )
        .catch(() => {});
    void transition.finished.finally(() => style.remove());
}

export interface ThemeToggleProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
    value?: Appearance;
    onValueChange?: (theme: Appearance) => void;
    reveal?: boolean;
}

export function ThemeToggle({ value, onValueChange, reveal = true, className = '', ...props }: ThemeToggleProps) {
    const { appearance, updateAppearance } = useAppearance();
    const reduced = useMedia(reducedQuery);
    const systemDark = useMedia(darkQuery);
    const theme = value ?? appearance;
    const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    const dark = resolved === 'dark';
    const rootRef = React.useRef<HTMLDivElement>(null);
    const [ready, setReady] = React.useState(false);

    React.useEffect(() => {
        const frame = requestAnimationFrame(() => setReady(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const choose = () => {
        const next: Exclude<Appearance, 'system'> = dark ? 'light' : 'dark';
        const apply = () => {
            if (value === undefined) {
                updateAppearance(next);
            }
            onValueChange?.(next);
        };

        withReveal(rootRef.current, apply, reveal && !reduced && (next === 'dark') !== dark);
    };

    const label = `Switch to ${dark ? 'light' : 'dark'} theme`;

    return (
        <div ref={rootRef} className={`inline-flex ${className}`} {...props}>
            <button
                type="button"
                aria-label={label}
                aria-pressed={dark}
                title={label}
                onClick={choose}
                className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-foreground shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,box-shadow] duration-300 hover:bg-accent active:scale-[0.96] ${FOCUS}`}
            >
                <SunMoon dark={dark} reduced={reduced || !ready} />
            </button>
        </div>
    );
}
