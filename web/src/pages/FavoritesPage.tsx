import { Link } from 'react-router-dom';
import { Bookmark, MapPin, MessageSquare, UserMinus } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useFavorites, useToggleFavorite } from '@/hooks/queries';
import { relativeTime } from '@/lib/utils';

/**
 * Members the signed-in user has saved. The list is private: only the owner's
 * favourites are ever returned by the API.
 */
export default function FavoritesPage() {
  const toast = useToast();
  const { data: favorites, isLoading, isError, error, refetch } = useFavorites();
  const toggleFavorite = useToggleFavorite();

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Favourites</h1>
        <p className="mt-1 text-sm ss-subtle">
          Members you have saved for later. This list is private to you.
        </p>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <SkeletonRows count={4} />
      ) : !favorites || favorites.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="h-6 w-6" aria-hidden="true" />}
          title="No favourites yet"
          description="Save a member from their profile to keep them close at hand."
          action={
            <Link to="/members">
              <Button>Browse members</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map((entry) => (
            <Card key={entry.id}>
              <CardBody className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <Avatar
                    name={entry.member.displayName}
                    src={entry.member.avatarUrl ?? undefined}
                    seed={entry.member.username}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/members/${entry.member.username}`}
                      className="font-medium hover:underline"
                    >
                      {entry.member.displayName}
                    </Link>
                    <p className="truncate text-sm ss-subtle">@{entry.member.username}</p>
                    {entry.member.headline ? (
                      <p className="mt-1 line-clamp-2 text-sm">{entry.member.headline}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs ss-subtle">
                  {entry.member.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {entry.member.location}
                    </span>
                  ) : null}
                  <span>Saved {relativeTime(entry.createdAt)}</span>
                </div>

                <div className="flex gap-2">
                  <Link to={`/members/${entry.member.username}`} className="flex-1">
                    <Button variant="secondary" className="w-full" leftIcon={<MessageSquare className="h-4 w-4" />}>
                      View profile
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    loading={toggleFavorite.isPending}
                    aria-label={`Remove ${entry.member.displayName} from favourites`}
                    onClick={() =>
                      toggleFavorite.mutate(
                        { username: entry.member.username, favorite: false },
                        {
                          onSuccess: () => toast.success('Removed from favourites'),
                        },
                      )
                    }
                    leftIcon={<UserMinus className="h-4 w-4" aria-hidden="true" />}
                  >
                    Remove
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
