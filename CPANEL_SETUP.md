# cPanel Deployment Guide

This project can be deployed on cPanel as a standard Laravel app if the server supports:

- PHP 8.2 or newer
- Composer
- MySQL
- required PHP extensions such as `gd` and `zip`

## Recommended Folder Layout

Keep the Laravel project outside `public_html` if your hosting allows it.

Example:

```text
/home/username/rdl-courier-v7
/home/username/public_html
```

Then point the domain or subdomain document root to the Laravel [`public`](/home/atlas/Downloads/rdl-mcp%20(2)/public) directory.

If cPanel does not allow changing the document root, you can copy the contents of [`public`](/home/atlas/Downloads/rdl-mcp%20(2)/public) into `public_html` and update `index.php` paths carefully.

## Environment Setup

Create a production `.env` with at least:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-domain.com
APP_KEY=base64:your-generated-key

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=your_database
DB_USERNAME=your_database_user
DB_PASSWORD=your_database_password

CACHE_STORE=file
SESSION_DRIVER=file
QUEUE_CONNECTION=database
```

Generate an application key if needed:

```bash
php artisan key:generate --show
```

## Install Steps

Run these from the project root:

```bash
composer install --optimize-autoloader --no-dev
npm install
npm run build
php artisan migrate --force
php artisan storage:link
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

## Scheduler

Create exactly one cron entry for Laravel's scheduler. Use the real project path on your cPanel account:

```bash
* * * * * cd /home/username/rdl-courier-v7 && /usr/local/bin/php artisan schedule:run >> /dev/null 2>&1
```

Do not create separate cron entries for `orders:update-sheets`, `orders:process-synced`, `c2b:process-transactions`, or `whatsapp:send-meta`. The scheduler already controls those intervals and overlap locks.

## Queue Workers

Order imports from Google Sheets are buffered into the database and processed on the `imports` queue. Scheduled/manual command jobs use the `scheduled` queue. Keep worker counts fixed so traffic bursts do not spawn unlimited PHP processes.

Start with these two worker processes from the project root:

```bash
php artisan queue:work database --queue=imports --sleep=3 --tries=3 --timeout=120 --max-jobs=300 --max-time=3600
php artisan queue:work database --queue=scheduled,default --sleep=5 --tries=1 --timeout=1200 --max-jobs=100 --max-time=3600
```

If the server has spare CPU after observing production traffic, add one more `imports` worker. Avoid more than two import workers on shared hosting.

If your cPanel has a process manager, create one entry for each command above. If it only supports cron, run a checked startup script every minute rather than adding many raw `queue:work` cron entries. The script must first check whether the worker is already running before starting it.

Useful health checks:

```bash
php artisan queue:failed
php artisan schedule:list
php artisan queue:restart
```

## Permissions

Make sure these are writable:

- [`storage`](/home/atlas/Downloads/rdl-mcp%20(2)/storage)
- [`bootstrap/cache`](/home/atlas/Downloads/rdl-mcp%20(2)/bootstrap/cache)

## Notes

- This repo now defaults cache to the `file` driver, which is safer on shared hosting.
- [`php.ini`](/home/atlas/Downloads/rdl-mcp%20(2)/php.ini) includes `variables_order = "EGPCS"` so environment variables are available more reliably on shared hosting.
- Remove or disable any Railway-specific environment values if you previously used Railway.
