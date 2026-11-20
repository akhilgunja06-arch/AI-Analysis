import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Minimal typing for the parts of the Maps JavaScript API this file touches.
 * The SDK has no bundled types here, and pulling `@types/google.maps` in for
 * four symbols would be heavier than the surface it describes.
 */
type LatLngLiteral = { lat: number; lng: number };

type MapsMarker = {
  setMap: (map: unknown) => void;
  addListener: (event: string, handler: () => void) => void;
  setTitle: (title: string) => void;
};

type MapsInstance = {
  setCenter: (position: LatLngLiteral) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: unknown) => void;
};

type MapsNamespace = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapsInstance;
  Marker: new (options: Record<string, unknown>) => MapsMarker;
  LatLngBounds: new () => { extend: (position: LatLngLiteral) => void };
  Circle?: new (options: Record<string, unknown>) => { setMap: (map: unknown) => void };
};

declare global {
  interface Window {
    google?: { maps: MapsNamespace };
    __ssMapsPromise?: Promise<MapsNamespace>;
  }
}

export const GOOGLE_MAPS_API_KEY: string =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? '';

export const isMapsConfigured = GOOGLE_MAPS_API_KEY.length > 0;

/**
 * Loads the Maps SDK once per page.
 *
 * The promise is cached on `window` so two components mounting at the same
 * time do not inject the script twice — a duplicate `<script>` tag makes the
 * API log an error and can render a blank canvas.
 */
function loadMaps(): Promise<MapsNamespace> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (window.__ssMapsPromise) return window.__ssMapsPromise;

  window.__ssMapsPromise = new Promise<MapsNamespace>((resolve, reject) => {
    const callbackName = '__ssMapsReady';
    (window as unknown as Record<string, unknown>)[callbackName] = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error('The map library loaded but did not initialise.'));
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      GOOGLE_MAPS_API_KEY,
    )}&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('The map library could not be downloaded.'));
    document.head.appendChild(script);
  });

  return window.__ssMapsPromise;
}

export type MapMarker = {
  id: string;
  position: LatLngLiteral;
  label: string;
  /** Shown as the pin title and used for the accessible name. */
  title: string;
  onClick?: () => void;
};

/**
 * A Google map with member pins.
 *
 * When `VITE_GOOGLE_MAPS_API_KEY` is absent the component renders an explicit
 * placeholder instead of an empty box: the surrounding page still works, and
 * the reader learns why the map is missing.
 */
export function GoogleMap({
  center,
  markers,
  radiusKm,
  onMarkerClick,
  className,
}: {
  center: LatLngLiteral;
  markers: MapMarker[];
  radiusKm?: number;
  onMarkerClick?: (marker: MapMarker) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapsInstance | null>(null);
  const markerRefs = useRef<MapsMarker[]>([]);
  const circleRef = useRef<{ setMap: (map: unknown) => void } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    isMapsConfigured ? 'loading' : 'idle',
  );
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isMapsConfigured) return;
    let cancelled = false;

    loadMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center,
            zoom: 12,
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
          });
        }
        setStatus('ready');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(err.message);
      });

    return () => {
      cancelled = true;
    };
    // The map is created once; centre and markers are applied by the effects
    // below so a re-render does not rebuild the whole canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return;
    mapRef.current.setCenter(center);
  }, [center, status]);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.google?.maps) return;
    const maps = window.google.maps;

    for (const marker of markerRefs.current) marker.setMap(null);
    markerRefs.current = [];

    for (const marker of markers) {
      const pin = new maps.Marker({
        map: mapRef.current,
        position: marker.position,
        title: `${marker.label} — ${marker.title}`,
        label: marker.label.slice(0, 1).toUpperCase(),
      });
      if (marker.onClick ?? onMarkerClick) {
        pin.addListener('click', () => {
          (marker.onClick ?? onMarkerClick)?.(marker);
        });
      }
      markerRefs.current.push(pin);
    }

    // Frame everything on the map, so nobody has to hunt for a pin.
    if (markers.length > 1) {
      const bounds = new maps.LatLngBounds();
      bounds.extend(center);
      for (const marker of markers) bounds.extend(marker.position);
      mapRef.current.fitBounds(bounds);
    }
  }, [markers, center, status, onMarkerClick]);

  // A translucent circle makes the radius meaningful rather than decorative.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.google?.maps) return;
    const Ctor = window.google.maps.Circle;
    if (!radiusKm || !Ctor) {
      circleRef.current?.setMap(null);
      circleRef.current = null;
      return;
    }
    circleRef.current?.setMap(null);
    circleRef.current = new Ctor({
      map: mapRef.current,
      center,
      radius: radiusKm * 1000,
      strokeColor: '#0f766e',
      strokeOpacity: 0.5,
      strokeWeight: 1,
      fillColor: '#0f766e',
      fillOpacity: 0.08,
    });
  }, [center, radiusKm, status]);

  if (!isMapsConfigured) {
    return (
      <div
        className={cn(
          'flex h-full min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40',
          className,
        )}
      >
        <MapPin className="h-7 w-7 text-slate-400" aria-hidden />
        <p className="text-sm font-medium">The map is not configured</p>
        <p className="max-w-sm text-xs ss-subtle">
          Add{' '}
          <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">VITE_GOOGLE_MAPS_API_KEY</code>{' '}
          to the web environment to show member pins. Nearby members are listed below either way.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('relative h-full min-h-[320px] overflow-hidden rounded-xl', className)}>
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="Map of nearby members"
      />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 text-sm ss-subtle dark:bg-slate-900/80">
          Loading the map…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-50 p-6 text-center dark:bg-slate-900">
          <p className="text-sm font-medium">The map could not load</p>
          <p className="max-w-sm text-xs ss-subtle">{errorMessage}</p>
          <p className="max-w-sm text-xs ss-subtle">Nearby members are still listed below.</p>
        </div>
      )}
    </div>
  );
}
