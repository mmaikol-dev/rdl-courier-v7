import { Badge } from '@/components/badge';
import { Float, type FloatCorner } from '@/components/float';
import { Button } from '@/components/ui/button';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { ArrowRight, MessageCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type UnreadSummary = {
    count: number;
    conversations: number;
};

export function WhatsAppUnreadFloat() {
    const page = usePage<SharedData>();
    const user = page.props.auth?.user;
    const currentPath = page.url.split('?')[0];
    const enabled = Boolean(user && page.props.sidebar?.visibleItems.includes('whatsapp')) && currentPath !== '/whatsapp';
    const selectedCountry = page.props.selectedCountry;
    const country = selectedCountry && selectedCountry !== '__all__' ? selectedCountry : null;
    const [summary, setSummary] = useState<UnreadSummary>({ count: 0, conversations: 0 });
    const [corner, setCorner] = useState<FloatCorner>('bottom-right');
    const [tucked, setTucked] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setSummary({ count: 0, conversations: 0 });
            return;
        }

        let cancelled = false;
        const controller = new AbortController();
        const url = country ? `/api/whatsapp/unread-count?country=${encodeURIComponent(country)}` : '/api/whatsapp/unread-count';

        const load = async () => {
            try {
                const response = await fetch(url, {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                    signal: controller.signal,
                });
                if (!response.ok || cancelled) return;

                const data = (await response.json()) as Partial<UnreadSummary>;
                if (cancelled) return;

                setSummary({
                    count: Math.max(0, Number(data.count) || 0),
                    conversations: Math.max(0, Number(data.conversations) || 0),
                });
            } catch {
                return;
            }
        };

        void load();
        const interval = window.setInterval(load, 10000);
        const handleFocus = () => void load();
        window.addEventListener('focus', handleFocus);

        return () => {
            cancelled = true;
            controller.abort();
            window.clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
        };
    }, [country, enabled]);

    if (!enabled || !user || summary.count <= 0) return null;

    const messageLabel = summary.count === 1 ? 'message' : 'messages';
    const chatLabel = summary.conversations === 1 ? 'chat' : 'chats';

    return (
        <Float
            scope="viewport"
            storageKey={`whatsapp-unread-float-${user.id}`}
            label="Unread WhatsApp messages"
            corner={corner}
            onCornerChange={setCorner}
            tucked={tucked}
            onTuckedChange={setTucked}
            live
            margin={16}
            edgePeek={
                <span className="inline-flex items-center gap-2 font-mono text-xs">
                    <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    <MessageCircle className="size-3.5" aria-hidden="true" />
                    <span>{summary.count}</span>
                </span>
            }
        >
            <div className="flex w-[min(21rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-card-foreground shadow-[0_18px_45px_-18px_hsl(var(--foreground)/0.45)]">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                    <MessageCircle className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">WhatsApp huddle</p>
                        <Badge count={summary.count} tone="danger" size="sm" />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {summary.count} unread {messageLabel}
                        {summary.conversations > 0 ? ` · ${summary.conversations} ${chatLabel}` : ''}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 px-2.5 text-xs"
                        data-float-no-drag
                        onClick={() => router.visit('/whatsapp?read=unread')}
                    >
                        Open
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground"
                        data-float-no-drag
                        aria-label="Hide WhatsApp unread float"
                        onClick={() => setTucked(true)}
                    >
                        <X className="size-4" aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </Float>
    );
}
