import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Crosshair,
  Loader2,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { GoogleMap, isMapsConfigured, type MapMarker } from '@/components/map/GoogleMap';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { useNavigate } from 'react-router-dom';
import {
  useClearLocation,
  useMyLocation,
  useNearbyMembers,
  useSaveLocation,
  useSetLocationSharing,
  useStartConversation,
} from '@/hooks/queries';
import { cn } from '@/lib/utils';

const RADII = [1, 5, 10, 25, 50] as const;

/**
 * Nearby-member discovery.
 *
 * Consent is the spine of this page: the browser permission prompt is only
 * requested after the member presses the button, the exact point is saved only
 * with the checkbox ticked, and visibility is a separate switch. The map is
 * optional; the list underneath works without it.
 */
export default function NearbyPage() {
  const navigate = useNavigate();
  const { data: saved, isLoading: savedLoading } = useMyLocation();
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const { data: nearbyData, isFetching, isError, error } = useNearbyMembers({ radiusKm });
  const saveLocation = useSaveLocation();
  const setSharing = useSetLocationSharing();
  const clearLocation = useClearLocation();
  const startConversation = useStartConversation();

  const [consent, setConsent] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [manual, setManual] = useState({ latitude: '', longitude: '', city: '' });

  const members = nearbyData?.members ?? [];
  const center = nearbyData?.center ?? saved ?? null;

  const markers = useMemo<MapMarker[]>(
    () =>
      members.map((member) => ({
        id: member.id,
        position: { lat: member.location.latitude, lng: member.location.longitude },
        label: member.displayName || member.username,
        title: member.place ?? `${member.distanceKm} km away`,
      })),
    [members],
  );

  const requestBrowserLocation = useCallback(() => {
    if (!consent) {
      setGeoError('Tick the consent box first. Nothing is stored until you agree.');
      return;
    }
    if (!('geolocation' in navigator)) {
      setGeoError('This browser cannot share a location. Enter coordinates manually below.');
      return;
    }

    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        saveLocation.mutate(
          {
            latitude: Number(position.coords.latitude.toFixed(5)),
            longitude: Number(position.coords.longitude.toFixed(5)),
            sharingEnabled: true,
            consent: true,
          },
          {
            onSettled: () => setLocating(false),
            onError: (err) =>
              setGeoError(err instanceof Error ? err.message : 'The location could not be saved.'),
          },
        );
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. You can enter coordinates manually instead.'
            : 'Your location could not be determined. Try again or enter it manually.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, [consent, saveLocation]);

  const submitManual = () => {
    const latitude = Number(manual.latitude);
    const longitude = Number(manual.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setGeoError('Enter a latitude and a longitude as numbers.');
      return;
    }
    if (!consent) {
      setGeoError('Tick the consent box first. Nothing is stored until you agree.');
      return;
    }
    setGeoError(null);
    saveLocation.mutate({
      latitude,
      longitude,
      city: manual.city || undefined,
      sharingEnabled: true,
      consent: true,
    });
  };

  const openChat = async (username: string) => {
    const result = await startConversation.mutateAsync({ username });
    navigate(`/messages/${result.data.conversationId}`);
  };

  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Nearby members' }]} />

      <header className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Nearby members</h1>
        <p className="mt-1 max-w-2xl text-sm ss-subtle">
          Find people to learn with close to you. Locations are rounded to about a kilometre before
          anyone else sees them, and you decide whether to share at all.
        </p>
      </header>

      {/* Privacy notice: the rules, stated before any permission prompt. */}
      <Card className="mt-4 flex items-start gap-3 border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900 dark:bg-brand-950/30">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">How your location is handled</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 ss-subtle">
            <li>Nothing is stored until you tick the consent box and save a point.</li>
            <li>Other members only ever see a pin rounded to roughly 1 km.</li>
            <li>You can turn sharing off, or delete the saved point, at any time.</li>
          </ul>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Map */}
        <Card className="min-h-[380px] overflow-hidden p-0">
          {center ? (
            <GoogleMap
              center={{ lat: center.latitude, lng: center.longitude }}
              markers={markers}
              radiusKm={radiusKm}
              className="h-[380px]"
            />
          ) : (
            <div className="flex h-[380px] flex-col items-center justify-center gap-2 p-6 text-center">
              <MapPin className="h-8 w-8 text-slate-400" aria-hidden />
              <p className="text-sm font-medium">No location saved yet</p>
              <p className="max-w-sm text-xs ss-subtle">
                Save a point to see who is nearby. Nothing is shared until you choose to share it.
              </p>
            </div>
          )}
        </Card>

        {/* Controls */}
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Your location</h2>

            {savedLoading ? (
              <p className="mt-2 flex items-center gap-2 text-sm ss-subtle">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
              </p>
            ) : saved ? (
              <div className="mt-2 space-y-3">
                <p className="text-sm">
                  <MapPin className="mr-1 inline h-4 w-4 text-brand-600" aria-hidden />
                  {saved.place || `${saved.latitude.toFixed(3)}, ${saved.longitude.toFixed(3)}`}
                </p>

                <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <span>
                    <span className="block font-medium">Share with other members</span>
                    <span className="block text-xs ss-subtle">
                      When off, only you can see your pin.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={saved.sharingEnabled}
                    onChange={(event) =>
                      setSharing.mutate({
                        sharingEnabled: event.target.checked,
                        ...(event.target.checked ? { consent: true as const } : {}),
                      })
                    }
                    className="h-4 w-4 accent-brand-600"
                    aria-label="Share my approximate location with other members"
                  />
                </label>

                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="h-4 w-4" />}
                  onClick={() => clearLocation.mutate()}
                  loading={clearLocation.isPending}
                >
                  Delete my saved location
                </Button>
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                  />
                  <span>
                    I agree to store my location so SkillSpring can show me nearby members.
                  </span>
                </label>

                <Button
                  fullWidth
                  leftIcon={<Crosshair className="h-4 w-4" />}
                  onClick={requestBrowserLocation}
                  loading={locating || saveLocation.isPending}
                >
                  Use my current location
                </Button>

                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Enter coordinates manually
                  </summary>
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs">
                        Latitude
                        <input
                          type="number"
                          step="0.0001"
                          value={manual.latitude}
                          onChange={(event) =>
                            setManual((m) => ({ ...m, latitude: event.target.value }))
                          }
                          placeholder="17.385"
                          className="mt-1 w-full rounded border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                        />
                      </label>
                      <label className="text-xs">
                        Longitude
                        <input
                          type="number"
                          step="0.0001"
                          value={manual.longitude}
                          onChange={(event) =>
                            setManual((m) => ({ ...m, longitude: event.target.value }))
                          }
                          placeholder="78.486"
                          className="mt-1 w-full rounded border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                        />
                      </label>
                    </div>
                    <label className="block text-xs">
                      City (optional)
                      <input
                        type="text"
                        value={manual.city}
                        onChange={(event) => setManual((m) => ({ ...m, city: event.target.value }))}
                        placeholder="Hyderabad"
                        className="mt-1 w-full rounded border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                    <Button size="sm" variant="secondary" fullWidth onClick={submitManual}>
                      Save this point
                    </Button>
                  </div>
                </details>
              </div>
            )}

            {geoError && (
              <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                {geoError}
              </p>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold">Search radius</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {RADII.map((radius) => (
                <button
                  key={radius}
                  type="button"
                  onClick={() => setRadiusKm(radius)}
                  aria-pressed={radiusKm === radius}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition',
                    radiusKm === radius
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400',
                  )}
                >
                  {radius} km
                </button>
              ))}
            </div>
            {!isMapsConfigured && (
              <p className="mt-3 text-xs ss-subtle">
                The map needs <code>VITE_GOOGLE_MAPS_API_KEY</code>. The list below works without it.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Results list: the accessible, no-map-needed view. */}
      <section className="mt-6" aria-live="polite">
        <h2 className="text-lg font-semibold">
          Within {radiusKm} km
          {members.length > 0 && (
            <span className="ml-2 text-sm font-normal ss-subtle">
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </span>
          )}
        </h2>

        {isFetching && (
          <p className="mt-3 flex items-center gap-2 text-sm ss-subtle">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Looking around you…
          </p>
        )}

        {isError && (
          <p className="mt-3 text-sm ss-subtle">
            {error instanceof Error && error.message.includes('Set a location')
              ? 'Save a location above to see who is nearby.'
              : 'Nearby members could not be loaded right now.'}
          </p>
        )}

        {!isFetching && !isError && members.length === 0 && (
          <EmptyState
            className="mt-3"
            icon={<Users className="h-6 w-6" aria-hidden />}
            title="Nobody nearby is sharing a location"
            description="Try a wider radius. Members only appear here after they choose to share an approximate location."
          />
        )}

        {members.length > 0 && (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {members.map((member) => (
              <li key={member.id}>
                <Card className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={member.displayName} src={member.avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/members/${member.username}`}
                        className="block truncate font-medium hover:text-brand-600 dark:hover:text-brand-400"
                      >
                        {member.displayName}
                      </Link>
                      <p className="truncate text-xs ss-subtle">@{member.username}</p>
                      <p className="mt-0.5 text-xs ss-subtle">
                        {member.place ? `${member.place} · ` : ''}
                        {member.distanceKm} km away
                      </p>
                    </div>
                  </div>

                  {member.teaches.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {member.teaches.map((skill) => (
                        <Badge key={skill.slug} variant="brand">
                          {skill.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex gap-2">
                    <Link
                      to={`/members/${member.username}`}
                      className="ss-btn ss-btn-secondary ss-btn-sm flex-1"
                    >
                      Profile
                    </Link>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => void openChat(member.username)}
                      disabled={startConversation.isPending}
                      leftIcon={<MessageSquare className="h-3.5 w-3.5" />}
                    >
                      Message
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
