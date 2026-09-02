# Real-time events with Laravel Reverb + Echo

This document explains how to add **real-time, server-pushed updates** to the RealDeal
dashboard using **Laravel Reverb** (WebSocket) + **Laravel Echo** (browser client).

We use a **single global channel** (`orders`) for all users — every connected browser
hears every event. This is the simplest setup and is not permission-scoped.

> **Is it free?** Yes. Reverb is MIT-licensed and self-hosted — no license, no
> subscription, no per-connection fees. The only cost is running it on your server.

---

## 1. How it works

A pub/sub model with Reverb as the relay "radio tower":

```
 [Laravel backend]       [Reverb server]        [Browsers (Echo)]
        |                      |                       |
   publishes an event   ===> relays it to all  ==>  subscribed clients
   on the "orders"          subscribers on the        receive it
   channel                   "orders" channel         immediately
```

- **Backend publishes** — Laravel fires a broadcast event when something happens
  (e.g. a new order is imported, status changed, an order was assigned an agent).
- **Reverb relays** — it holds WebSocket connections from both Laravel and the browsers
  and forwards events to everyone subscribed to the same channel.
- **Browser listens** — Echo (`laravel-echo` + `pusher-js`) subscribes in React and
  reacts (toast, refresh, sound).

---

## 2. Backend setup (Laravel)

### 2.1 Install & configure Reverb

```bash
composer require laravel/reverb
php artisan reverb:install
```

Publish and check the config (channel authentication, origins, apps):

```bash
php artisan vendor:publish --tag=reverb-config
```

### 2.2 Update `.env`

```env
BROADCAST_CONNECTION=reverb

# Reverb server
REVERB_APP_ID=my-app-id
REVERB_APP_KEY=my-reverb-key          # public key, sent to the browser
REVERB_APP_SECRET=my-reverb-secret     # secret, never exposed to the browser
REVERB_HOST=127.0.0.1
REVERB_PORT=8080
REVERB_SCHEME=http                      # use https in production (wss://)

# Vite injects these into the frontend
VITE_REVERB_APP_KEY=${REVERB_APP_KEY}
VITE_REVERB_HOST=${REVERB_HOST}
VITE_REVERB_PORT=${REVERB_PORT}
VITE_REVERB_SCHEME=${REVERB_SCHEME}
```

> The `VITE_*` variables MUST be prefixed with `VITE_` so Vite can read them. After
> editing them, restart the Vite dev server.

### 2.3 Set up the broadcast driver

`config/broadcasting.php` already default to the `reverb` driver from the install.
No separate Pusher service is needed — Reverb speaks the Pusher protocol locally.

---

## 3. Create events (backend)

Create an event class for the thing you want to push. Example — a new order was
imported:

```bash
php artisan make:event OrderImported
```

```php
<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Support\Facades\Broadcast;

class OrderImported implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public array $order) {}

    public function broadcastOn(): Channel
    {
        return new Channel('orders'); // global channel
    }
}
```

Fire it from anywhere in your code when the event occurs:

```php
use App\Events\OrderImported;

// After an order is created/imported
event(new OrderImported([
    'order_no' => $order->order_no,
    'client_name' => $order->client_name,
    'status' => $order->status,
    'amount' => $order->amount,
]));
```

### Other events you might add

| Event | Fired when | Payload idea |
|---|---|---|
| `OrderImported` | New order imported from sheet | order_no, client, status, country |
| `OrderStatusChanged` | A status is edited | order_no, old, new status |
| `OrderCleared` | Clearance status toggled | order_no, clearance_status |
| `OrderAssigned` | Agent assigned to an order | order_no, agent |

Each just needs `ShouldBroadcast` + a `broadcastOn()` channel.

---

## 4. Frontend setup (React + Inertia)

### 4.1 Install the client libraries

```bash
npm install laravel-echo pusher-js
```

### 4.2 Register Echo once (in `app.tsx`)

Add this near the top of `resources/js/app.tsx` (or a small `resources/js/echo.ts`
that `app.tsx` imports), so the connection is global before pages render:

```tsx
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Echo = new Echo({
    broadcaster: 'pusher',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT,
    wssPort: import.meta.env.VITE_REVERB_PORT,
    forceTLS: import.meta.env.VITE_REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
});
```

> We instantiate Echo **once** at boot because the pages below subscribe/unsubscribe
> on mount/unmount. For a global channel, listening in pages is fine; the single
> connection is shared.

---

## 5. Connect each page

Every page follows the same pattern:

1. `useEffect` that subscribes to `orders` with `.listen('EventName', cb)`.
2. On the callback, react to the new data (toast + optional `router.reload({ only: [...] })`).
3. `return () => window.Echo.leaveChannel('orders')` to clean up when the page unmounts.

The `router.reload({ only: [...] })` re-hits the page's controller so the Inertia data
stays fresh without a full page reload.

### 5.1 Dashboard — `resources/js/pages/dashboard.tsx`

React to new orders and status changes to keep summary numbers live:

```tsx
import { router } from '@inertiajs/react';
import { useEffect } from 'react';

// inside the component
useEffect(() => {
    if (!window.Echo) return;

    window.Echo.channel('orders')
        .listen('OrderImported', (e) => {
            toast.success(`New order: ${e.order.order_no}`);
            router.reload({ only: ['orders', 'stats'] });
        })
        .listen('OrderStatusChanged', (e) => {
            toast.info(`${e.order_no} is now ${e.status}`);
            router.reload({ only: ['orders', 'stats'] });
        });

    return () => window.Echo.leaveChannel('orders');
}, []);
```

> The exact shared keys (`'orders'`, `'stats'`) must match the props your
> `DashboardController` actually shares. Adjust `only` to your dashboard's real props.

### 5.2 Sheet Orders — `resources/js/pages/sheetorders/index.tsx`

Refresh the list when an order is imported or its status changes:

```tsx
useEffect(() => {
    if (!window.Echo) return;

    window.Echo.channel('orders')
        .listen('OrderImported', (e) => {
            toast.success(`New order arrived: ${e.order_no}`);
            router.reload({
                only: ['orders'],
                preserveState: true,
                preserveScroll: true,
            });
        })
        .listen('OrderStatusChanged', (e) => {
            toast.info(`${e.order_no} → ${e.status}`);
            router.reload({
                only: ['orders'],
                preserveState: true,
                preserveScroll: true,
            });
        });

    return () => window.Echo.leaveChannel('orders');
}, []);
```

### 5.3 Transactions — `resources/js/pages/transactions/index.tsx`

Push new transactions / payment events:

```tsx
useEffect(() => {
    if (!window.Echo) return;

    window.Echo.channel('orders')
        .listen('OrderStatusChanged', (e) => {
            router.reload({ only: ['transactions'], preserveScroll: true });
        });

    return () => window.Echo.leaveChannel('orders');
}, []);
```

Emit a `TransactionCreated` event from the backend if you want a dedicated transaction
push instead of reusing `OrderStatusChanged`:

```tsx
.listen('TransactionCreated', (e) => {
    toast.success(`Payment received: ${e.amount}`);
    router.reload({ only: ['transactions'], preserveScroll: true });
});
```

### 5.4 Maps — `resources/js/pages/maps/index.tsx`

Refresh markers when order locations change:

```tsx
useEffect(() => {
    if (!window.Echo) return;

    window.Echo.channel('orders')
        .listen('OrderAssigned', (e) => {
            // e.g. re-fetch marker data for the affected order
            router.reload({ only: ['markers'], preserveScroll: true });
        });

    return () => window.Echo.leaveChannel('orders');
}, []);
```

### 5.5 Incoming Sheet Orders — `resources/js/pages/incoming-sheet-orders/index.tsx`

Push immediately when new sheets arrive, and re-run the import queue:

```tsx
useEffect(() => {
    if (!window.Echo) return;

    window.Echo.channel('orders')
        .listen('OrderImported', (e) => {
            toast.success(`Incoming order: ${e.order_no}`);
            // refresh both the pending list and the import status
            router.reload({ only: ['orders', 'imports'], preserveScroll: true });
        });

    return () => window.Echo.leaveChannel('orders');
}, []);
```

---

## 6. Run Reverb

### Development

```bash
php artisan reverb:start
```

### Production (keep it alive with Supervisor)

Create `/etc/supervisor/conf.d/reverb.conf`:

```ini
[program:reverb]
process_name=%(program_name)s
command=php /path/to/project/artisan reverb:start --host=0.0.0.0 --port=8080
autostart=true
autorestart=true
redirect_stderr=true
```

Then:

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start reverb
```

---

## 7. Security notes

- **`REVERB_APP_KEY` is public** — it ships to the browser (it's the `VITE_` value).
- **`REVERB_APP_SECRET` must stay server-side only** — never put it in a `VITE_` var.
- This doc uses a **global channel (`Channel`)** with no auth. Everything the server
  broadcasts goes to every connected user. **Anyone can see raw event payloads**, so
  **do not broadcast sensitive data** (phone numbers, addresses, private notes) until
  you move to private/per-user channels.
- If you later need per-user or per-country scoping, switch to
  `PrivateChannel` / `PresenceChannel` + `channel-auth`, or `Channel` per country
  (e.g. `orders.kenya`) and `Broadcast::routes()` with `auth()` middleware.

---

## 8. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| No events arrive | `BROADCAST_CONNECTION` not `reverb`; Reverb not running; wrong port/`wsHost` |
| Connection refused | Firewall on the Reverb port; wrong `REVERB_PORT`/`VITE_REVERB_PORT` |
| Events in browser but data not updated | The `only: [...]` keys don't match controller-shared props — check them |
| Page errors "Echo is not defined" | `window.Echo` not initialized in `app.tsx`, or `laravel-echo`/`pusher-js` not installed |
| Works on `ws://` but not production | Need `https`/`wss` + `REVERB_SCHEME=https` behind a TLS-terminating proxy |
| Reverb dies after a while | Not under Supervisor; add it (section 6) |
```

