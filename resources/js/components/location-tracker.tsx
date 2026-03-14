import { useEffect, useRef } from 'react';
import type { Auth } from '@/types';

type GeoPayload = {
    latitude: number;
    longitude: number;
    accuracy_meters?: number;
    altitude_meters?: number;
    speed_mps?: number;
    heading_degrees?: number;
    event_type?: string;
    source?: string;
};

const HEARTBEAT_URL = '/locations/heartbeat';
const LOGIN_URL = '/locations/login';
const MIN_SEND_INTERVAL_MS = 15_000;
const MIN_DISTANCE_METERS = 15;

function getCsrfToken() {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

function toRadians(value: number) {
    return (value * Math.PI) / 180;
}

function distanceInMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
    const earthRadius = 6371000;
    const latitudeDelta = toRadians(b.latitude - a.latitude);
    const longitudeDelta = toRadians(b.longitude - a.longitude);
    const latitudeA = toRadians(a.latitude);
    const latitudeB = toRadians(b.latitude);

    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;

    return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

async function postLocation(url: string, payload: GeoPayload) {
    await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-TOKEN': getCsrfToken(),
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });
}

export function LocationTracker({ auth }: { auth?: Auth & { pendingLoginLocationCapture?: boolean } }) {
    const lastSentAtRef = useRef(0);
    const lastSentCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
    const pendingLoginCaptureRef = useRef(Boolean(auth?.pendingLoginLocationCapture));

    useEffect(() => {
        pendingLoginCaptureRef.current = Boolean(auth?.pendingLoginLocationCapture);
    }, [auth?.pendingLoginLocationCapture]);

    useEffect(() => {
        if (!auth?.user || typeof window === 'undefined' || !('geolocation' in navigator)) {
            return;
        }

        const maybeSendLocation = async (position: GeolocationPosition) => {
            const now = Date.now();
            const lastCoords = lastSentCoordsRef.current;
            const currentCoords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
            };
            const movedEnough = lastCoords
                ? distanceInMeters(lastCoords, currentCoords) >= MIN_DISTANCE_METERS
                : true;
            const waitedLongEnough = now - lastSentAtRef.current >= MIN_SEND_INTERVAL_MS;
            const payload: GeoPayload = {
                latitude: currentCoords.latitude,
                longitude: currentCoords.longitude,
                accuracy_meters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
                altitude_meters: Number.isFinite(position.coords.altitude ?? NaN) ? (position.coords.altitude ?? undefined) : undefined,
                speed_mps: Number.isFinite(position.coords.speed ?? NaN) ? (position.coords.speed ?? undefined) : undefined,
                heading_degrees: Number.isFinite(position.coords.heading ?? NaN) ? (position.coords.heading ?? undefined) : undefined,
                event_type: movedEnough ? 'moving' : 'heartbeat',
                source: 'browser',
            };

            if (!lastCoords || movedEnough || waitedLongEnough) {
                try {
                    await postLocation(HEARTBEAT_URL, payload);
                    lastSentAtRef.current = now;
                    lastSentCoordsRef.current = {
                        latitude: payload.latitude,
                        longitude: payload.longitude,
                    };
                } catch {
                    // Keep tracking silent in the background.
                }
            }

            if (pendingLoginCaptureRef.current) {
                try {
                    await postLocation(LOGIN_URL, payload);
                    pendingLoginCaptureRef.current = false;
                } catch {
                    // The next successful position can retry this.
                }
            }
        };

        navigator.geolocation.getCurrentPosition(maybeSendLocation, () => undefined, {
            enableHighAccuracy: true,
            maximumAge: 10_000,
            timeout: 10_000,
        });

        const watchId = navigator.geolocation.watchPosition(maybeSendLocation, () => undefined, {
            enableHighAccuracy: true,
            maximumAge: 10_000,
            timeout: 10_000,
        });

        return () => {
            navigator.geolocation.clearWatch(watchId);
        };
    }, [auth?.user]);

    return null;
}
