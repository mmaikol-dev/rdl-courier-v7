"use client";

import AppLayout from "@/layouts/app-layout";
import { type BreadcrumbItem, type User } from "@/types";
import { Head, router, usePage } from "@inertiajs/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Map,
  MapControlContainer,
  MapDrawControl,
  MapDrawDelete,
  MapDrawEdit,
  MapFullscreenControl,
  MapDrawPolygon,
  MapDrawRectangle,
  MapDrawUndo,
  MapMarker,
  MapPopup,
  MapPolyline,
  MapTileLayer,
  MapTooltip,
  MapZoomControl,
  useLeaflet,
} from "@/components/ui/map";
import { formatDistanceToNow } from "date-fns";
import { Clock3, Flag, MapPinned, Navigation, PauseCircle, RefreshCcw, Route, Settings2, ShieldCheck, Users2, Waves } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMap } from "react-leaflet";
import type { FeatureGroup, LatLngTuple } from "leaflet";

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Dashboard", href: "/dashboard" },
  { title: "Maps", href: "/maps" },
];

interface TrackedLocationPoint {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  event_type?: string | null;
  source?: string | null;
  recorded_at?: string | null;
}

interface LoginLocationPoint {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  source?: string | null;
  logged_in_at?: string | null;
}

interface TrailPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  speed_mps?: number | null;
  heading_degrees?: number | null;
  recorded_at?: string | null;
}

interface MapsPageProps {
  [key: string]: unknown;
  auth: {
    user: User;
    pendingLoginLocationCapture?: boolean;
  };
  users: User[];
  activeLocations: TrackedLocationPoint[];
  loginLocations: LoginLocationPoint[];
  selectedUserId?: number | null;
  selectedUserTrail: TrailPoint[];
  trailWindowHours: number;
  trackingSummary: {
    trackedUsers: number;
    loginPins: number;
    agentsOnline: number;
  };
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

function formatDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "Unknown time";
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

function MapViewportSync({
  points,
}: {
  points: Array<{ latitude: number; longitude: number }>;
}) {
  const map = useMap();
  const { L } = useLeaflet();

  useEffect(() => {
    if (!L) return;

    const validPoints = points
      .map((point) => ({
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
      }))
      .filter(
        (point) =>
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude) &&
          Math.abs(point.latitude) <= 90 &&
          Math.abs(point.longitude) <= 180,
      );

    if (validPoints.length === 0) {
      map.setView([-1.286389, 36.817223], 6);
      return;
    }

    if (validPoints.length === 1) {
      map.setView([validPoints[0].latitude, validPoints[0].longitude], 14);
      return;
    }

    try {
      const latLngs = validPoints.map((point) => L.latLng(point.latitude, point.longitude));
      const bounds = L.latLngBounds(latLngs);

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        map.setView([validPoints[0].latitude, validPoints[0].longitude], 13);
      }
    } catch (error) {
      console.warn("Failed to fit map bounds for tracking points", error, validPoints);
      map.setView([validPoints[0].latitude, validPoints[0].longitude], 13);
    }
  }, [L, map, points]);

  return null;
}

function MarkerBadge({
  label,
  colorClass,
}: {
  label: string;
  colorClass: string;
}) {
  return (
    <div className={`flex size-11 items-center justify-center rounded-full border-4 border-white text-[11px] font-bold text-white shadow-lg ${colorClass}`}>
      {label}
    </div>
  );
}

function TrackingMapCanvas({
  activeLocations,
  loginLocations,
  selectedUserTrail,
  deliveryZoneName,
  isFilterPanelOpen,
  onOpenFilters,
  onCloseFilters,
  filterPanelContent,
}: {
  activeLocations: TrackedLocationPoint[];
  loginLocations: LoginLocationPoint[];
  selectedUserTrail: TrailPoint[];
  deliveryZoneName: string;
  isFilterPanelOpen: boolean;
  onOpenFilters: () => void;
  onCloseFilters: () => void;
  filterPanelContent: React.ReactNode;
}) {
  const [deliveryZone, setDeliveryZone] = useState<LatLngTuple[]>([]);

  const allPoints = useMemo(
    () => [...activeLocations, ...loginLocations, ...selectedUserTrail],
    [activeLocations, loginLocations, selectedUserTrail],
  );

  const agentCount = useMemo(
    () => activeLocations.filter((point) => String(point.user_role ?? "").trim().toLowerCase() === "agent").length,
    [activeLocations],
  );

  const tripStart = selectedUserTrail[0];
  const tripEnd = selectedUserTrail[selectedUserTrail.length - 1];
  const trailCheckpoints = selectedUserTrail.filter((_, index) => index > 0 && index < selectedUserTrail.length - 1);

  const handleLayersChange = (layers: FeatureGroup) => {
    const layerList = layers.getLayers();

    if (layerList.length === 0) {
      setDeliveryZone([]);
      return;
    }

    const latestLayer = layerList[layerList.length - 1] as { getLatLngs?: () => unknown };
    const latLngs = latestLayer.getLatLngs?.();

    if (!Array.isArray(latLngs) || !Array.isArray(latLngs[0])) {
      setDeliveryZone([]);
      return;
    }

    const polygon = latLngs[0] as Array<{ lat: number; lng: number }>;
    setDeliveryZone(polygon.map((point) => [point.lat, point.lng]));
  };

  return (
    <div className="overflow-hidden rounded-3xl border shadow-xl">
      <Map center={[-1.286389, 36.817223]} zoom={6} className="h-[34rem] w-full">
        <MapTileLayer name="Operations" />
        <MapViewportSync points={allPoints} />
        <MapZoomControl position="bottom-3 right-3" />
        <MapFullscreenControl position="top-3 right-64" />

        <MapControlContainer
          className={`top-0 left-0 h-full w-full transition-opacity duration-200 ${isFilterPanelOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <div className="absolute inset-0 bg-black/20" onClick={onCloseFilters} />
          <div className="absolute top-0 left-0 h-full w-full max-w-sm border-r bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-4">
              <div>
                <p className="text-base font-semibold text-foreground">Track a user path</p>
                <p className="text-sm text-muted-foreground">Inspect movement without leaving the map.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onCloseFilters}>
                Close
              </Button>
            </div>
            <div className="h-[calc(100%-73px)] overflow-y-auto p-4">
              {filterPanelContent}
            </div>
          </div>
        </MapControlContainer>

        <MapControlContainer className="top-3 right-3">
          <div className="min-w-56 rounded-2xl border bg-card/95 p-4 text-card-foreground shadow-lg backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Tracking Overview</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-muted p-3">
                <p className="text-[11px] text-muted-foreground">Live</p>
                <p className="text-lg font-semibold">{activeLocations.length}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-[11px] text-muted-foreground">Agents</p>
                <p className="text-lg font-semibold">{agentCount}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-[11px] text-muted-foreground">Logins</p>
                <p className="text-lg font-semibold">{loginLocations.length}</p>
              </div>
            </div>
          </div>
        </MapControlContainer>

        <MapDrawControl onLayersChange={handleLayersChange} position="top-3 left-3">
          <MapDrawPolygon />
          <MapDrawRectangle />
          <MapDrawEdit />
          <MapDrawDelete />
          <MapDrawUndo />
        </MapDrawControl>

        <MapControlContainer className="top-3 left-40">
          <Button type="button" variant="secondary" size="sm" className="shadow-lg" onClick={onOpenFilters}>
            <Settings2 className="h-4 w-4" />
            Filters
          </Button>
        </MapControlContainer>

        {deliveryZone.length > 1 ? (
          <MapPolyline
            positions={[...deliveryZone, deliveryZone[0]]}
            pathOptions={{
              color: "#047857",
              weight: 4,
              opacity: 0.95,
              dashArray: "10 8",
            }}
          >
            <MapPopup>
              <div className="space-y-1">
                <p className="font-semibold">{deliveryZoneName}</p>
                <p className="text-sm text-muted-foreground">Custom delivery boundary drawn with shadcn-map controls.</p>
              </div>
            </MapPopup>
          </MapPolyline>
        ) : null}

        {selectedUserTrail.length > 1 ? (
          <MapPolyline
            positions={selectedUserTrail.map((point) => [point.latitude, point.longitude] as LatLngTuple)}
            pathOptions={{
              color: "#dc2626",
              weight: 6,
              opacity: 0.95,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ) : null}

        {trailCheckpoints.map((point, index) => (
          <MapMarker
            key={`checkpoint-${point.id}`}
            position={[point.latitude, point.longitude]}
            icon={<MarkerBadge label={`${index + 1}`} colorClass="bg-amber-500" />}
          >
            <MapPopup>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-amber-600" />
                  <p className="font-semibold">Trail checkpoint {index + 1}</p>
                </div>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(point.recorded_at)}</p>
                {point.speed_mps ? (
                  <p className="text-xs text-muted-foreground">Speed: {(point.speed_mps * 3.6).toFixed(1)} km/h</p>
                ) : null}
              </div>
            </MapPopup>
            <MapTooltip side="top">Checkpoint {index + 1}</MapTooltip>
          </MapMarker>
        ))}

        {tripStart ? (
          <MapMarker
            position={[tripStart.latitude, tripStart.longitude]}
            icon={<MarkerBadge label="ST" colorClass="bg-slate-700" />}
          >
            <MapPopup>
              <div className="space-y-1">
                <p className="font-semibold">Trip start</p>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(tripStart.recorded_at)}</p>
              </div>
            </MapPopup>
          </MapMarker>
        ) : null}

        {tripEnd && selectedUserTrail.length > 1 ? (
          <MapMarker
            position={[tripEnd.latitude, tripEnd.longitude]}
            icon={<MarkerBadge label="END" colorClass="bg-rose-600" />}
          >
            <MapPopup>
              <div className="space-y-1">
                <p className="font-semibold">Latest point</p>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(tripEnd.recorded_at)}</p>
              </div>
            </MapPopup>
          </MapMarker>
        ) : null}

        {loginLocations.map((location) => (
          <MapMarker
            key={`login-${location.id}`}
            position={[location.latitude, location.longitude]}
            icon={<MarkerBadge label="IN" colorClass="bg-blue-600" />}
          >
            <MapPopup>
              <div className="space-y-1">
                <p className="font-semibold">{location.user_name ?? "Unknown user"}</p>
                <p className="text-sm text-muted-foreground">{location.user_role ?? "User"} login point</p>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(location.logged_in_at)}</p>
              </div>
            </MapPopup>
            <MapTooltip side="top">Login: {location.user_name ?? "Unknown"}</MapTooltip>
          </MapMarker>
        ))}

        {activeLocations.map((location) => {
          const role = String(location.user_role ?? "").trim().toLowerCase();
          const isAgent = role === "agent";

          return (
            <MapMarker
              key={`live-${location.id}`}
              position={[location.latitude, location.longitude]}
              icon={<MarkerBadge label={isAgent ? "AG" : "US"} colorClass={isAgent ? "bg-emerald-600" : "bg-orange-500"} />}
            >
              <MapPopup>
                <div className="space-y-1">
                  <p className="font-semibold">{location.user_name ?? "Unknown user"}</p>
                  <p className="text-sm text-muted-foreground">{location.user_role ?? "User"} current location</p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(location.recorded_at)}</p>
                  {location.accuracy_meters ? (
                    <p className="text-xs text-muted-foreground">Accuracy: {Math.round(location.accuracy_meters)}m</p>
                  ) : null}
                </div>
              </MapPopup>
              <MapTooltip side="top">{location.user_name ?? "Unknown"} is here</MapTooltip>
            </MapMarker>
          );
        })}
      </Map>
    </div>
  );
}

export default function MapsIndex() {
  const { users, activeLocations, loginLocations, selectedUserId, selectedUserTrail, trailWindowHours, trackingSummary } =
    usePage<MapsPageProps>().props;

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const isAllUsersView = !selectedUserId;
  const [isLive, setIsLive] = useState(isAllUsersView);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date());
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  const trailDistanceMeters = useMemo(() => {
    if (selectedUserTrail.length < 2) return 0;

    return selectedUserTrail.slice(1).reduce((total, point, index) => {
      const previous = selectedUserTrail[index];
      return total + distanceInMeters(previous, point);
    }, 0);
  }, [selectedUserTrail]);

  const tripDurationLabel = useMemo(() => {
    if (selectedUserTrail.length < 2) return "Not enough points";

    const start = selectedUserTrail[0]?.recorded_at ? new Date(selectedUserTrail[0].recorded_at) : null;
    const end = selectedUserTrail[selectedUserTrail.length - 1]?.recorded_at
      ? new Date(selectedUserTrail[selectedUserTrail.length - 1].recorded_at!)
      : null;

    if (!start || !end) return "Unknown duration";

    const diffMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

    if (diffMinutes < 60) return `${diffMinutes} min`;

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }, [selectedUserTrail]);

  useEffect(() => {
    setLastUpdatedAt(new Date());
  }, [activeLocations, loginLocations, selectedUserTrail, trackingSummary]);

  useEffect(() => {
    setIsLive(isAllUsersView);
  }, [isAllUsersView]);

  useEffect(() => {
    if (!isLive) {
      return;
    }

    const timer = window.setInterval(() => {
      router.reload({
        only: ["activeLocations", "loginLocations", "selectedUserTrail", "trackingSummary", "selectedUserId"],
        preserveScroll: true,
        preserveState: true,
      });
    }, 20000);

    return () => window.clearInterval(timer);
  }, [isLive]);

  const refreshNow = () => {
    router.reload({
      only: ["activeLocations", "loginLocations", "selectedUserTrail", "trackingSummary", "selectedUserId"],
      preserveScroll: true,
      preserveState: true,
      onFinish: () => setLastUpdatedAt(new Date()),
    });
  };

  const filterByUser = (value: string) => {
    router.get(
      "/maps",
      value
        ? { user_id: value, trail_hours: trailWindowHours }
        : { trail_hours: trailWindowHours, all_users: 1 },
      {
        preserveScroll: true,
        preserveState: true,
      },
    );
  };

  const filterByTrailWindow = (value: string) => {
    router.get(
      "/maps",
      {
        ...(selectedUserId ? { user_id: selectedUserId } : { all_users: 1 }),
        trail_hours: value,
      },
      {
        preserveScroll: true,
        preserveState: true,
      },
    );
  };

  const filterPanelContent = (
    <div className="space-y-4">
      <select
        value={selectedUserId ?? ""}
        onChange={(event) => {
          filterByUser(event.target.value);
          setIsFilterPanelOpen(false);
        }}
        className="flex h-11 w-full rounded-xl border bg-card px-3 text-sm text-foreground shadow-sm outline-none ring-0 transition focus:border-emerald-500"
      >
        <option value="">All users</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} {user.roles ? `(${user.roles})` : ""}
          </option>
        ))}
      </select>

      <select
        value={trailWindowHours}
        onChange={(event) => filterByTrailWindow(event.target.value)}
        className="flex h-11 w-full rounded-xl border bg-card px-3 text-sm text-foreground shadow-sm outline-none ring-0 transition focus:border-emerald-500"
      >
        <option value="1">Last 1 hour</option>
        <option value="3">Last 3 hours</option>
        <option value="6">Last 6 hours</option>
        <option value="12">Last 12 hours</option>
        <option value="24">Last 24 hours</option>
      </select>

      <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
        {selectedUser ? (
          <>
            <p className="font-semibold text-foreground">{selectedUser.name}</p>
            <p>{selectedUser.email}</p>
            <p className="mt-2">Trail points in view: {selectedUserTrail.length}</p>
            <p>Window: last {trailWindowHours}h</p>
          </>
        ) : (
          <p>Selecting a user draws their movement trail on the map.</p>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live refresh</p>
            <p className="text-sm font-medium text-foreground">
              {isLive ? "On" : "Paused"} {isAllUsersView ? "for all-users view" : "for investigation mode"}
            </p>
          </div>
          <Button
            type="button"
            variant={isLive ? "secondary" : "default"}
            size="sm"
            onClick={() => setIsLive((current) => !current)}
          >
            {isLive ? <PauseCircle className="h-4 w-4" /> : <Waves className="h-4 w-4" />}
            {isLive ? "Pause live" : "Resume live"}
          </Button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Last updated {formatDistanceToNow(lastUpdatedAt, { addSuffix: true })}</p>
          <Button type="button" variant="outline" size="sm" onClick={refreshNow}>
            <RefreshCcw className="h-4 w-4" />
            Refresh now
          </Button>
        </div>
      </div>

      {selectedUserId ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            filterByUser("");
            setIsFilterPanelOpen(false);
          }}
        >
          Clear user filter
        </Button>
      ) : null}
    </div>
  );

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Maps" />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[21rem_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">What the markers mean</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3 rounded-2xl border bg-card p-3">
                  <Navigation className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <div>
                    <p className="font-medium text-foreground">Green live markers</p>
                    <p>Latest shared locations for agents. These are the best signal for delivery movement.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border bg-card p-3">
                  <MapPinned className="mt-0.5 h-4 w-4 text-blue-600" />
                  <div>
                    <p className="font-medium text-foreground">Blue login markers</p>
                    <p>Positions captured immediately after login when the browser shares location permission.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border bg-card p-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Drawn boundary</p>
                    <p>Use the draw tool on the map to sketch a delivery zone and visually compare locations against it.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Trip summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedUser ? (
                  <>
                    <div className="rounded-2xl border bg-card p-3">
                      <div className="flex items-center gap-3">
                        <Route className="h-4 w-4 text-emerald-600" />
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Distance covered</p>
                          <p className="font-semibold text-foreground">{formatDistance(trailDistanceMeters)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border bg-card p-3">
                      <div className="flex items-center gap-3">
                        <Clock3 className="h-4 w-4 text-sky-600" />
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Trip duration</p>
                          <p className="font-semibold text-foreground">{tripDurationLabel}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border bg-card p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Latest update</p>
                          <p className="font-semibold text-foreground">
                            {selectedUserTrail.at(-1)?.recorded_at ? formatRelativeTime(selectedUserTrail.at(-1)?.recorded_at) : "No recent points"}
                          </p>
                        </div>
                        <Badge variant="secondary">{selectedUser.roles ?? "User"}</Badge>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a user to see distance, duration, and the path they used over time.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <TrackingMapCanvas
              activeLocations={activeLocations}
              loginLocations={loginLocations}
              selectedUserTrail={selectedUserTrail}
              deliveryZoneName={selectedUser ? `${selectedUser.name}'s delivery zone` : "Delivery zone"}
              isFilterPanelOpen={isFilterPanelOpen}
              onOpenFilters={() => setIsFilterPanelOpen(true)}
              onCloseFilters={() => setIsFilterPanelOpen(false)}
              filterPanelContent={filterPanelContent}
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="border-0 shadow-lg">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tracked users</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{trackingSummary.trackedUsers}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Users currently contributing visible movement data.</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Agents active</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{trackingSummary.agentsOnline}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Agents whose latest points are in the current map window.</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Login pins</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{trackingSummary.loginPins}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Recent sign-in locations captured across the monitored users.</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Trail points</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{selectedUserTrail.length}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedUser ? `${selectedUser.name}'s visible checkpoints and route points.` : "Select a user to inspect their trail points."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
