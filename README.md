# RealDeal Logistics Operations System

RealDeal is a Laravel + Inertia + React application used to run logistics, dispatch, warehouse, payments, reporting, and back-office operations from one system.

## What The System Does

This project helps the company:

- import and manage order data
- assign, dispatch, and track deliveries
- manage products, stock movement, and warehouse activity
- process STK / M-Pesa payment collection
- monitor undelivered and unremitted orders
- sync sheet updates and merchant-facing sheet data
- manage requisitions, budgets, and approvals
- generate operational and financial reports
- support WhatsApp/chat workflows
- manage users, merchants, categories, and operational settings

## Main Functional Areas

### Dashboard and Statistics

- operational dashboard with order, revenue, customer, and status summaries
- growth metrics and time-based comparisons
- chart views and deeper statistics pages

### Orders and Dispatch

- sheet order management
- order history tracking
- dispatch assignment and reassignment
- bulk assign actions
- agent order printing
- waybill generation and download

### Payment Collection

- STK push initiation for orders
- transaction status checks
- payment callback handling
- order payment processing screen
- confirmation / unconfirmed status visibility

### Order Monitoring

- undelivered orders view with filters and status updates
- unremitted orders view with remittance marking
- update queue for pending sheet updates

### Imports and Sheets

- CSV / Excel order import
- sheet listing and viewing
- merchant sheet update command
- App Script integration endpoints

### Warehouse and Inventory

- product management
- quantity updates
- barcode scanning and barcode history
- inventory log viewing
- transfer flows between products and agents
- deduction tracking on transfers
- warehouse dashboard

### Communication

- WhatsApp/chat conversations
- chat status updates
- outbound WhatsApp sending
- webhook handling
- call center / voice related API endpoints

### Reports and Finance

- report builder and Excel export
- delivered / remitted monitoring
- transaction views
- daily budgets and top-ups
- requisition creation, approval, rejection, and payment flow

### Administration

- user management
- unit / merchant management
- categories and requisition category management
- settings pages
- auth, password reset, and profile management

## Key Pages / Modules

- `dashboard`
- `sheetorders`
- `dispatch`
- `stk`
- `report`
- `undelivered`
- `unremitted`
- `updates`
- `import`
- `products`
- `transfer`
- `sheets`
- `waredash`
- `whatsapp`
- `stats`
- `budgets`
- `requisitions`
- `users`
- `units`

## Tech Stack

- Laravel 12
- PHP 8.2+
- Inertia.js
- React
- TypeScript
- Vite
- Tailwind CSS
- Ziggy

## Notable Integrations / Packages

- `maatwebsite/excel` for imports / exports
- `barryvdh/laravel-dompdf` for PDF-related output
- `milon/barcode` for barcode generation / handling
- `google/apiclient` for Google-related integrations
- `wasenderapi/wasenderapi-laravel` for messaging integration
- `africastalking/africastalking` for telecom-related integrations

## Development

Install dependencies and run the app:

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate
composer run dev
```

## Notes

- authentication and shared frontend state are handled through Inertia
- several workflows are role-based, including agent, finance, merchant, and call center access
- the application includes both web routes and API endpoints for operational integrations
