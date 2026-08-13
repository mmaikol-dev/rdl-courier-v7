/**
 * CSRF helpers for raw `fetch` calls.
 *
 * Laravel refreshes the XSRF-TOKEN cookie on every response, so it is always
 * in sync with the current session token — even after client-side (Inertia)
 * navigation, where the `csrf-token` meta tag in the <head> goes stale
 * (e.g. after login regenerates the session). Send `X-XSRF-TOKEN` from the
 * cookie and fall back to the meta tag only when the cookie is missing.
 */

export function getCsrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

export function getXsrfToken(): string {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);

    return match ? decodeURIComponent(match[1]) : '';
}

export function csrfHeaders(): Record<string, string> {
    const xsrf = getXsrfToken();
    const meta = getCsrfToken();

    if (xsrf) {
        return { 'X-XSRF-TOKEN': xsrf };
    }

    return meta ? { 'X-CSRF-TOKEN': meta } : {};
}
