# syntax=docker/dockerfile:1
# OCCDL (Laravel 12 + React/Vite) - one image for EthioDeploy / any Docker host.
# Stage 1 builds the React app, stage 2 installs PHP packages, stage 3 is the runtime.

# ---- 1. Frontend build (public/build is git-ignored, so it must be built here) ----------
FROM node:22-alpine AS assets
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY vite.config.js ./
COPY resources ./resources
COPY public ./public
RUN npm run build

# ---- 2. PHP packages (vendor/ is git-ignored too) -----------------------------------------
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
# `update minishlink/web-push` = a partial update: it adds the Web Push package when composer.lock does not
# have it yet (keeping every other locked version), and is a plain install once the lock is refreshed.
RUN composer update minishlink/web-push --with-dependencies --no-dev --no-interaction --no-progress \
    --no-scripts --prefer-dist --optimize-autoloader --ignore-platform-reqs

# ---- 3. Runtime ---------------------------------------------------------------------------
FROM php:8.3-apache
ENV PORT=80 \
    APACHE_DOCUMENT_ROOT=/var/www/html/public

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpng-dev libjpeg-dev libwebp-dev libfreetype6-dev libzip-dev libicu-dev libpq-dev unzip \
    && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
    && docker-php-ext-install -j"$(nproc)" gd exif zip intl bcmath opcache pdo_mysql pdo_pgsql \
    && a2enmod rewrite headers \
    && sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf \
    && sed -ri -e 's!Listen 80!Listen ${PORT}!' /etc/apache2/ports.conf \
    && sed -ri -e 's!<VirtualHost \*:80>!<VirtualHost *:${PORT}>!' /etc/apache2/sites-available/000-default.conf \
    && printf '<Directory ${APACHE_DOCUMENT_ROOT}>\n    AllowOverride All\n    Require all granted\n</Directory>\nServerName localhost\n' > /etc/apache2/conf-available/occ.conf \
    && a2enconf occ \
    && printf 'opcache.enable=1\nopcache.validate_timestamps=0\nupload_max_filesize=8M\npost_max_size=10M\nexpose_php=0\n' > /usr/local/etc/php/conf.d/occ.ini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html
COPY --from=vendor /usr/bin/composer /usr/bin/composer
COPY --from=vendor /app/vendor ./vendor
COPY . .
COPY --from=assets /app/public/build ./public/build

RUN composer dump-autoload --optimize --no-dev --no-interaction \
    && php artisan package:discover --ansi || true \
    && chmod +x docker/entrypoint.sh \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
    CMD curl -fs "http://127.0.0.1:${PORT}/up" || exit 1
ENTRYPOINT ["docker/entrypoint.sh"]
