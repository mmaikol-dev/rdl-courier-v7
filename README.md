# RealDeal Logistics Operations System

> A full-stack logistics platform for managing orders, dispatch, warehouse, payments, finance, and back-office operations — built with Laravel 12 + React + Inertia.js.

![Laravel](https://img.shields.io/badge/Laravel-12-red?logo=laravel) ![React](https://img.shields.io/badge/React-19-blue?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript) ![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)

---

## Overview

RealDeal is a logistics operations platform that centralises everything from order import to final payment remittance. Teams across dispatch, warehouse, finance, and communication all work from the same system, with role-based access controlling what each user can see and do.

**Who uses it:**

| Role | What they do |
|------|-------------|
| **Admin / G.O.D** | Full access across all countries and modules |
| **Finance** | Budget management, requisitions, report generation, remittance tracking |
| **Dispatch Agent** | View assigned orders, generate waybills, mark deliveries |
| **Warehouse** | Product management, barcode scanning, stock transfers |
| **Merchant** | View and confirm their own orders via the finance workflow |
| **Call Center** | WhatsApp/chat conversations, STK push, customer communication |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Laravel 12, PHP 8.2+ |
| Frontend | React 19, TypeScript |
| Bridge | Inertia.js + Ziggy |
| Styling | Tailwind CSS v4, Radix UI |
| Build | Vite |
| Database | MySQL (via Eloquent ORM) |
| PDF | barryvdh/laravel-dompdf |
| Excel | maatwebsite/excel |
| Barcodes | milon/barcode |

---

## System Architecture

```mermaid
graph TD
    Browser["Browser\n(React + TypeScript)"]
    Inertia["Inertia.js Bridge"]
    Laravel["Laravel 12 Backend\n(Controllers + Models + Services)"]
    DB[("MySQL Database")]
    Queue["Queue Worker\n(Scheduled Jobs)"]
    Integrations["External APIs\n(M-Pesa · WhatsApp · Shopify · Google · AfricasTalking)"]

    Browser <-->|"Page requests / form submissions"| Inertia
    Inertia <-->|"Shared props + route data"| Laravel
    Laravel <-->|"Eloquent ORM"| DB
    Laravel -->|"Dispatch jobs"| Queue
    Queue -->|"Sync / notify / process"| Integrations
    Laravel -->|"Direct API calls"| Integrations
```

---

## Project Structure

```
├── app/
│   ├── Console/
│   │   └── Commands/          # Scheduled & CLI commands
│   ├── Exports/               # Excel/CSV export classes
│   ├── Http/
│   │   ├── Controllers/       # 40+ controllers (web + API)
│   │   ├── Middleware/         # Custom middleware
│   │   └── Requests/          # Form request validation
│   ├── Jobs/                  # Queueable jobs
│   ├── Models/                # 35 Eloquent models
│   ├── Providers/             # Service providers
│   ├── Services/              # Business logic services
│   └── Support/               # Helpers (CountryAccess, etc.)
├── config/                    # Laravel config files
├── database/
│   ├── migrations/            # 23 schema migrations
│   ├── factories/             # Model factories
│   └── seeders/               # Database seeders
├── resources/
│   ├── js/                    # React frontend
│   │   ├── components/        # Reusable UI components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── layouts/           # Layout components
│   │   ├── lib/               # Utility functions
│   │   ├── pages/             # Inertia page components
│   │   └── types/             # TypeScript type definitions
│   └── views/                 # Blade templates
├── routes/
│   ├── web.php                # Web routes (Inertia pages)
│   ├── api.php                # API routes (webhooks, integrations)
│   ├── auth.php               # Auth routes
│   └── settings.php           # Settings routes
└── tests/                     # PHPUnit tests
```

---

## Modules & Workflows

### 1. Order Lifecycle

Orders start as raw CSV/Excel data and move through dispatch, delivery, and monitoring until they are fully remitted.

```mermaid
flowchart LR
    Import["📥 CSV / Excel Import\nor Shopify Sync"]
    Sheet["Sheet Order\nCreated"]
    Assign["Assigned to\nDispatch Agent"]
    Deliver["Delivered\nor Not Delivered"]
    Monitor["Undelivered /\nUnremitted Monitor"]
    Finance["Finance\nWorkflow"]

    Import --> Sheet --> Assign --> Deliver
    Deliver --> Monitor
    Deliver --> Finance
```

**Key pages:** `import`, `sheetorders`, `dispatch`, `undelivered`, `unremitted`

**Controllers:** `ImportController`, `SheetOrderController`, `DispatchController`, `UndeliveredController`, `UnremittedController`

---

### 2. Finance Workflow

Once an order is delivered, it moves through a four-stage finance pipeline tracked with timestamps and user IDs at every step.

```mermaid
flowchart TD
    A["✅ Order Delivered\ndelivered_at · delivered_by"]
    B["📄 Report Generated\nreport_generated_at · report_generated_by"]
    C["🤝 Merchant Confirmed\nmerchant_confirmed_at · merchant_confirmed_by"]
    D["💰 Remitted\nremitted_at · agent = 'Remitted'"]

    A --> B --> C --> D

    style A fill:#d1fae5,color:#000
    style B fill:#dbeafe,color:#000
    style C fill:#fef3c7,color:#000
    style D fill:#ede9fe,color:#000
```

Each stage is gated — you cannot skip steps. Finance staff mark delivery and generate reports; merchants confirm; finance finalises remittance.

**Key pages:** `finance-workflow`

**Controller:** `FinanceWorkflowController`

---

### 3. Payment Collection (STK Push / M-Pesa)

Agents initiate mobile payments directly from the system, which talks to M-Pesa and waits for the payment callback.

```mermaid
sequenceDiagram
    participant Agent
    participant System
    participant MPesa as M-Pesa API
    participant Customer as Customer Phone

    Agent->>System: Initiate STK Push for order
    System->>MPesa: Send STK push request
    MPesa->>Customer: Display payment prompt
    Customer->>MPesa: Confirm payment (PIN)
    MPesa->>System: C2B callback with transaction details
    System->>System: Record MpesaTransaction + update order status
```

**Key pages:** `stk`

**Controllers:** `StkController`, `C2BTransactionController`

**Console Commands:** `ProcessC2BTransactions`

---

### 4. Inventory & Warehouse

Products are tracked from creation through barcode scanning, stock updates, agent transfers, and deductions.

```mermaid
flowchart TD
    Create["🆕 Product Created\n(name, category, unit, quantity)"]
    Barcode["🏷️ Barcode Assigned"]
    Scan["📷 Barcode Scanned\n(BarcodeHistory logged)"]
    Qty["📦 Quantity Updated\n(InventoryLog entry)"]
    Alert["🔔 Low Stock Alert"]
    Transfer["🔄 Transfer to Agent"]
    Deduction["➖ Deduction Recorded"]

    Create --> Barcode --> Scan --> Qty
    Qty --> Transfer --> Deduction
    Qty --> Alert
```

**Key pages:** `products`, `transfer`, `waredash`, `inventory-deductions`

**Controllers:** `ProductController`, `TransferController`, `InventoryDeductionController`, `WaredashController`

**Services:** `ProductStockAlertService`

---

### 5. Inventory Deduction Workflow

When delivered orders need inventory deducted from merchant stock:

```mermaid
flowchart TD
    Delivered["📦 Delivered Orders\n(inventory_deducted_at IS NULL)"]
    SelectMerchant["Select Merchant\nFilter orders & products"]
    Deduct["Deduct Stock\nPer product, per order"]
    Update["Product.quantity -= total\nInventoryLog created"]
    Notify["📤 WhatsApp Group Notification\nvia OpenwaService"]
    Mark["Order.inventory_deducted_at = now()"]

    Delivered --> SelectMerchant --> Deduct --> Update --> Mark
    Update --> Notify
```

**Key pages:** `inventory-deductions`

**Controller:** `InventoryDeductionController`

---

### 6. Requisition & Budget Approval

Finance teams create requisitions that go through an approval chain before being paid out from a daily budget.

```mermaid
flowchart LR
    Create["📝 Requisition\nCreated"]
    Pending["⏳ Pending\nApproval"]
    Approved["✅ Approved"]
    Rejected["❌ Rejected"]
    Paid["💳 Marked as Paid\n(deducted from DailyBudget)"]

    Create --> Pending
    Pending --> Approved --> Paid
    Pending --> Rejected
```

Budgets have daily limits and can receive top-ups. Requisitions link to a `RequisitionCategory` and are associated with specific budget lines.

**Key pages:** `requisitions`, `budgets`

**Controllers:** `RequisitionController`, `RequisitionCategoryController`, `DailyBudgetController`

---

### 7. Communication (WhatsApp & Voice)

RealDeal has a **layered WhatsApp messaging system** with multiple providers:

```mermaid
flowchart TD
    subgraph Inbound
        W_In["📱 Inbound WhatsApp"]
        Webhook["🔗 Webhook\n(WASender / AfricasTalking)"]
        Store["💾 Chat Record"]
    end

    subgraph Chat UI
        Agent["👤 Agent Views\nChat Interface"]
        Reply["💬 AgentSends Reply"]
    end

    subgraph Outbound
        WS["Wasender API\n(primary)"]
        WAWP["WAWP API\n(fallback)"]
        OWA["OpenWA\n(self-hosted)"]
    end

    subgraph Group Notifications
        LSA["Low Stock Alert"]
        IDN["Inventory Deduction"]
        STN["Stock Transfer"]
        SDN["Stock Deduction"]
    end

    W_In --> Webhook --> Store --> Agent --> Reply

    Reply --> WS -->|"fails"| WAWP
    Reply --> OWA

    LSA --> OWA
    IDN --> OWA
    STN --> OWA
    SDN --> OWA
```

**Providers:**

| Provider | Role | Used By |
|----------|------|---------|
| **Wasender** | Primary outbound (chat replies) | `WhatsAppFallbackService`, `WhatsappController` |
| **WAWP** | Fallback (if Wasender fails) | `WhatsAppFallbackService` |
| **OpenWA** | Group notifications, fallback chat | `OpenwaService`, `WhatsappController` |

**Key pages:** `whatsapp`

**Controllers:** `WhatsappController`, `ChatController`

**Services:** `OpenwaService`, `WhatsAppFallbackService`

**Console Commands:** `SendWhatsAppMessage`

#### WhatsApp Group Notifications

Automated notifications are sent to country-specific WhatsApp groups instead of individual numbers:

```mermaid
flowchart LR
    subgraph Triggers
        LS["Stock below\nalert threshold"]
        ID["Inventory\ndeducted from orders"]
        ST["Stock transferred\nto agent"]
        SD["Stock deducted\nfrom agent"]
    end

    subgraph Service
        OWA["OpenwaService\nsendToGroup()"]
    end

    subgraph Groups
        KE["Kenya Group\n120363430968913090@g.us"]
        TZ["Tanzania Group\n120363411453438004@g.us"]
        UG["Uganda Group\n120363426385787478@g.us"]
        ZM["Zambia Group\n120363409224310826@g.us"]
    end

    LS --> OWA
    ID --> OWA
    ST --> OWA
    SD --> OWA

    OWA -->|"country = Kenya"| KE
    OWA -->|"country = Tanzania"| TZ
    OWA -->|"country = Uganda"| UG
    OWA -->|"country = Zambia"| ZM
```

```mermaid
sequenceDiagram
    participant System
    participant OWA as OpenwaService
    participant API as OpenWA API\n(api.sitebase.co.ke)
    participant Group as WhatsApp Group

    System->>OWA: sendToGroup(country, message)
    OWA->>OWA: country → country code\n(e.g. Kenya → 254)
    OWA->>OWA: country code → group chat ID\n(e.g. 254 → 120363...@g.us)
    OWA->>OWA: country code → session ID\n(from config/services.php)
    OWA->>API: POST /sessions/{id}/messages/send-text
    API-->>OWA: { messageId: "..." }
    OWA-->>System: { provider, to, message_id }
    System->>System: Log to Whatsapp table
```

**Services involved:**
- `OpenwaService` — shared service used by `ProductStockAlertService`, `InventoryDeductionController`, and `TransferController`
- `ProductStockAlertService` — low stock threshold alerts
- `WhatsAppFallbackService` — Wasender → WAWP fallback for chat replies

---

### 8. Reports & Monitoring

```mermaid
flowchart LR
    Filter["🔍 Apply Filters\n(date, agent, status, merchant)"]
    Build["📊 Report Builder"]
    Excel["📥 Download Excel\n(maatwebsite/excel)"]
    Undelivered["📋 Undelivered Orders\nView + Update Status"]
    Unremitted["📋 Unremitted Orders\nView + Mark Remitted"]

    Filter --> Build --> Excel
    Build --> Undelivered
    Build --> Unremitted
```

**Key pages:** `report`, `undelivered`, `unremitted`, `stats`

**Controllers:** `ReportController`, `StatsController`

**Services:** `DashboardReportService`, `StatsReportService`

---

### 9. Order Scanning (Warehouse Outbound/Inbound)

Warehouse staff scan product barcodes to process inbound and outbound operations:

```mermaid
flowchart TD
    Product["Product Page\nSelect product"]
    Scan["Scan Barcodes\n(bulk QR codes)"]
    Decision{"Operation Type?"}
    Inbound["Inbound: quantity +="]
    Outbound["Outbound: quantity -="]
    Alert["Low Stock Alert\n(if threshold reached)"]
    BarcodeHist["BarcodeHistory logged"]

    Product --> Scan --> Decision
    Decision -->|inbound| Inbound
    Decision -->|outbound| Outbound
    Outbound --> Alert
    Inbound --> BarcodeHist
    Outbound --> BarcodeHist
```

**Controllers:** `ProductController` (scanBarcodes method), `OrderScanController`

---

### 10. Dispatch & Waybills

Orders are assigned to dispatch agents who generate waybills and manage deliveries:

```mermaid
flowchart LR
    Orders["Sheet Orders\n(undispatched)"]
    Assign["Assign to\nDispatch Agent"]
    Waybill["Generate Waybill\n(PDF via dompdf)"]
    Bulk["Bulk Download\nWaybills"]
    Print["Print Agent\nOrders"]

    Orders --> Assign --> Waybill
    Waybill --> Bulk
    Waybill --> Print
```

**Controllers:** `DispatchController`, `WaybillController`

---

## Multi-Tenancy (Country Isolation)

Every user belongs to a `Country`. All queries are automatically scoped to the user's country via the `CountryAccess` helper class — users can only see data for their own country.

The **G.O.D** (admin) role bypasses country scoping and has global access across all countries.

```mermaid
flowchart TD
    User["User Request"]
    Check{"G.O.D role?"}
    Global["Return all data\n(no country filter)"]
    Scoped["Return data filtered\nby user's Country"]

    User --> Check
    Check -->|Yes| Global
    Check -->|No| Scoped
```

**Supported countries:**

| Country | Code | OpenWA Session Env Var |
|---------|------|------------------------|
| Kenya | 254 | `OPENWA_SESSION_KENYA` |
| Tanzania | 255 | `OPENWA_SESSION_TANZANIA` |
| Uganda | 256 | `OPENWA_SESSION_UGANDA` |
| Zambia | 260 | `OPENWA_SESSION_ZAMBIA` |

---

## Role-Based Sidebar

The navigation menu is dynamically controlled per role. Admins configure which menu items each role can see via the **Sidebar Permissions** page. This is stored in `SidebarRolePermission` and delivered to the frontend via Inertia shared props.

---

## Services Layer

| Service | Purpose |
|---------|---------|
| `OpenwaService` | Shared OpenWA messaging — sends to country groups or individual numbers |
| `WhatsAppFallbackService` | Wasender primary → WAWP fallback for chat replies |
| `ProductStockAlertService` | Low stock alerts via OpenWA groups |
| `DashboardReportService` | Dashboard statistics and charts |
| `StatsReportService` | Reporting and analytics |
| `SheetOrderImportService` | CSV/Excel import processing |
| `ShopifyService` | Shopify order sync |

---

## Key Integrations

| Integration | Purpose |
|-------------|---------|
| **M-Pesa (Daraja)** | STK push payment collection, C2B callbacks |
| **WASender** | WhatsApp messaging (inbound + outbound, primary) |
| **OpenWA (WaZuri)** | WhatsApp group notifications + fallback messaging |
| **WAWP** | WhatsApp fallback provider |
| **AfricasTalking** | SMS / voice / telecom integrations |
| **Shopify** | Order sync from merchant stores |
| **Google API** | Google Sheets / Drive integrations |

---

## Data Model (Key Tables)

| Table | Purpose |
|-------|---------|
| `countries` | Supported countries |
| `users` | All users with role and country assignment |
| `products` | Inventory products with quantity tracking |
| `sheet_orders` | Core order table with finance workflow columns |
| `incoming_sheet_orders` | Pre-processed imported orders |
| `sheets` | Merchant sheet groupings |
| `transfers` | Stock transfers to agents |
| `deductions` | Stock deductions from agents |
| `barcodes` | Scanned barcode history |
| `inventory_logs` | Quantity change audit trail |
| `stk` | STK push payment records |
| `mpesa_transactions` | M-Pesa C2B callback records |
| `c2b_transactions` | C2B transaction records |
| `requisitions` | Finance requisitions |
| `daily_budgets` | Daily budget tracking |
| `chats` / `whatsapp` | WhatsApp conversation records |
| `sidebare_role_permissions` | Dynamic sidebar visibility config |
| `dispatch` | Dispatch agent assignments |
| `voice_calls` | Voice call records |
| `user_locations` | Agent location tracking |

---

## Scheduled Background Jobs

The system runs automated tasks via Laravel's scheduler and queue workers:

| Command | Schedule | Purpose |
|---------|----------|---------|
| `NotifyOverdueOrders` | Daily | Overdue order alerts |
| `SendOverdueOrdersAlert` | Daily | Overdue summary to groups |
| `SendUpcomingOrdersReminder` | Daily | Upcoming delivery reminders |
| `SendScheduledOrders` | Varies | Scheduled order notifications |
| `ProcessC2BTransactions` | Every minute | Handle M-Pesa callback data |
| `ProcessSyncedOrders` | Varies | Process shopify-synced orders |
| `ImportShopifyOrders` | Hourly | Sync orders from Shopify |
| `SendWhatsAppMessage` | Varies | Queue-based WhatsApp delivery |
| `UpdateSheetOrders` | Varies | Merchant sheet sync |

---

## Development Setup

```bash
# Install dependencies
composer install
npm install

# Environment setup
cp .env.example .env
php artisan key:generate

# Database
php artisan migrate

# Start development servers (Laravel + Queue + Vite concurrently)
composer run dev
```

> `composer run dev` starts the Laravel server, queue worker, and Vite dev server concurrently.

### Linting & Type Checking

```bash
npm run lint        # ESLint
npm run types       # TypeScript type check
npm run format      # Prettier
composer run test   # PHPUnit
```

---

## Notes

- Authentication and shared frontend state are handled through Inertia middleware (`HandleInertiaRequests`)
- The app supports both web routes (Inertia pages) and API endpoints (for webhooks and external integrations)
- Role-based access covers not just UI visibility but also controller-level guards
- All finance workflow steps are immutable audit trails — timestamps and user IDs are recorded and never overwritten
- WhatsApp notifications are routed through `OpenwaService` which maps country names → country codes → group chat IDs → OpenWA session IDs
- The `ProductStockAlertService` uses constructor injection for `OpenwaService` — Laravel's service container auto-resolves it
