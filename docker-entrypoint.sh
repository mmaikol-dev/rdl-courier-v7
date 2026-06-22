#!/usr/bin/env bash
set -e
cd /var/www/html

if [ "$APP_ENV" = "production" ]; then
  php artisan config:cache
  php artisan route:cache
  php artisan view:cache
fi

# Start the Inertia SSR worker if available.
if php artisan list --format=txt | grep -q 'inertia:start-ssr'; then
  php artisan inertia:start-ssr >/tmp/inertia-ssr.log 2>&1 &
fi

exec "$@"
