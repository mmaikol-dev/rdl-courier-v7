# Multi-stage Dockerfile for Laravel + Inertia + Vite SSR

# 0) Install PHP dependencies for node build and runtime
FROM php:8.2-cli-bullseye AS composer-builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    libpng-dev \
    libjpeg62-turbo-dev \
    libfreetype6-dev \
    libzip-dev \
    zlib1g-dev \
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install gd zip \
 && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer \
 && rm -rf /var/lib/apt/lists/*

COPY composer.json composer.lock ./
RUN composer install --no-dev --optimize-autoloader --no-progress --prefer-dist --no-scripts

# 1) Build Node assets and SSR bundle
FROM node:24-bullseye-slim AS node-builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY --from=composer-builder /app/vendor ./vendor
COPY vite.config.ts tsconfig.json ./
COPY resources/ resources/
COPY public/ public/
COPY components.json ./
COPY eslint.config.js ./

RUN npm run build:ssr

# 2) Install PHP dependencies for runtime
FROM php:8.2-fpm-bullseye AS php-builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    unzip \
    zip \
    libpng-dev \
    libjpeg62-turbo-dev \
    libfreetype6-dev \
    libicu-dev \
    libxml2-dev \
    libonig-dev \
    zlib1g-dev \
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install gd intl pdo_mysql pcntl bcmath xml zip \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY composer.json composer.lock ./
RUN composer install --no-dev --optimize-autoloader --no-progress --prefer-dist

COPY . ./

# 3) Final runtime image with PHP-FPM and Node runtime for SSR
FROM php:8.2-fpm-bullseye
WORKDIR /var/www/html

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    unzip \
    zip \
    libpng-dev \
    libicu-dev \
    libxml2-dev \
    libonig-dev \
    zlib1g-dev \
 && docker-php-ext-install intl pdo_mysql pcntl bcmath xml zip \
 && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

COPY --from=php-builder /app /var/www/html
COPY --from=node-builder /app/public/build /var/www/html/public/build
COPY --from=node-builder /app/node_modules /var/www/html/node_modules
COPY --from=node-builder /app/bootstrap/ssr /var/www/html/bootstrap/ssr

RUN mkdir -p storage/app storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache && \
    chown -R www-data:www-data /var/www/html && \
    chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
