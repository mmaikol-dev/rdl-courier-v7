# Railway Laravel Setup Guide

This guide documents the Railway deployment issues we hit in this project and the exact fixes that got the build moving again.

## Stack Assumptions

- Laravel 12
- PHP 8.2
- Node 20+
- npm with a committed `package-lock.json`
- Railway using Railpack / Nixpacks-style detection for Laravel

## What Broke

During deployment, Railway failed at multiple stages:

1. `npm ci` failed because `package.json` and `package-lock.json` were out of sync.
2. `composer install` failed because the lock file had been resolved with PHP 8.3-compatible packages, while Railway was building with PHP 8.2.30.
3. `composer install` failed again because required PHP extensions were not declared for Railway to install automatically.

## Problem 1: `npm ci` Lockfile Mismatch

### Error

Railway reported errors like:

```text
npm ci can only install packages when your package.json and package-lock.json are in sync
Missing: @types/leaflet-draw@1.0.13 from lock file
Missing: @types/leaflet.markercluster@1.5.6 from lock file
Missing: leaflet.fullscreen@5.3.0 from lock file
```

### Cause

New frontend packages had been added to `package.json`, but `package-lock.json` had not been updated.

### Fix

Refresh the lockfile locally:

```bash
npm install
```

Then verify:

```bash
npm ci
```

### Result

Railway was then able to pass the Node install step.

## Problem 2: Composer Lockfile Not Compatible With Railway PHP

### Error

Railway reported:

```text
maennchen/zipstream-php 3.2.1 requires php-64bit ^8.3
your php-64bit version (8.2.30) does not satisfy that requirement
```

### Cause

The project lockfile had been generated on PHP 8.3, but Railway was building with PHP 8.2.30.

### Fix

We pinned Composer's platform target in [`composer.json`](/home/atlas/Downloads/rdl-mcp%20(2)/composer.json):

```json
"config": {
  "platform": {
    "php": "8.2.30"
  }
}
```

Then we regenerated the lockfile:

```bash
composer update maennchen/zipstream-php phpoffice/phpspreadsheet maatwebsite/excel milon/barcode --with-all-dependencies --no-interaction
```

### Result

Composer downgraded `maennchen/zipstream-php` from `3.2.1` to `3.1.2`, which is compatible with PHP 8.2.

## Problem 3: Missing `gd` Extension

### Error

Railway reported:

```text
milon/barcode requires ext-gd *
phpoffice/phpspreadsheet requires ext-gd *
```

### Cause

The application depended on packages that require the PHP GD extension, but it was not declared in Composer requirements.

### Fix

We added this to [`composer.json`](/home/atlas/Downloads/rdl-mcp%20(2)/composer.json):

```json
"require": {
  "php": "^8.2",
  "ext-gd": "*"
}
```

Then refreshed the lockfile:

```bash
composer update --lock --no-interaction
```

### Result

Railway detected the requirement and installed `gd` during build.

## Problem 4: Missing `zip` Extension

### Error

Railway later reported:

```text
phpoffice/phpspreadsheet 1.30.2 requires ext-zip *
```

### Cause

The ZIP extension was also required by spreadsheet/export packages, but it was not declared in Composer requirements.

### Fix

We added this to [`composer.json`](/home/atlas/Downloads/rdl-mcp%20(2)/composer.json):

```json
"require": {
  "php": "^8.2",
  "ext-gd": "*",
  "ext-zip": "*"
}
```

Then refreshed the lockfile metadata:

```bash
composer update --lock --no-interaction
```

### Result

Railway detected `ext-zip` and installed the ZIP extension during build.

## Final Working Checks

Before pushing, these commands should pass locally:

```bash
npm ci
composer install --optimize-autoloader --no-scripts --no-interaction
```

## Recommended Railway Checklist

Before deploying this Laravel app to Railway:

1. Make sure `package-lock.json` is committed and in sync with `package.json`.
2. Pin Composer platform PHP to the Railway PHP version you deploy with.
3. Declare required PHP extensions in `composer.json` such as `ext-gd` and `ext-zip`.
4. Rebuild `composer.lock` after changing PHP version targets or extension requirements.
5. Test the exact build commands locally before pushing.

## Commands We Used

```bash
npm install
npm ci
composer update maennchen/zipstream-php phpoffice/phpspreadsheet maatwebsite/excel milon/barcode --with-all-dependencies --no-interaction
composer update --lock --no-interaction
composer install --optimize-autoloader --no-scripts --no-interaction
```

## Files That Matter

- [`package.json`](/home/atlas/Downloads/rdl-mcp%20(2)/package.json)
- [`package-lock.json`](/home/atlas/Downloads/rdl-mcp%20(2)/package-lock.json)
- [`composer.json`](/home/atlas/Downloads/rdl-mcp%20(2)/composer.json)
- [`composer.lock`](/home/atlas/Downloads/rdl-mcp%20(2)/composer.lock)

## Summary

The deployment issues were not caused by Laravel itself. They came from environment mismatch and dependency metadata:

- Node lockfile drift broke `npm ci`
- PHP 8.3-generated Composer locks broke Railway PHP 8.2 builds
- Missing Composer-declared extensions prevented Railpack from installing `gd` and `zip`

Once those were aligned, the Railway build pipeline was able to proceed normally.
