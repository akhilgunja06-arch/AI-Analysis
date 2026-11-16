import { useRef, useState } from 'react';
import { Image as ImageIcon, Trash2, Upload, Video } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useDeleteMedia, useMyMedia, useUploadMedia } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { formatBytes } from '@/lib/utils';

/**
 * The member's own media library. Images are optimised server-side before they
 * are stored; videos are stored exactly as uploaded, and the panel says so.
 */
export default function MediaPage() {
  const toast = useToast();
  const { data: media, isLoading, isError, error, refetch } = useMyMedia();
  const uploadMedia = useUploadMedia();
  const deleteMedia = useDeleteMedia();

  const [filter, setFilter] = useState<'ALL' | 'IMAGE' | 'VIDEO'>('ALL');
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const visible = (media ?? []).filter((m) => filter === 'ALL' || m.mediaType === filter);

  const handleUpload = (file: File, mediaType: 'IMAGE' | 'VIDEO') => {
    uploadMedia.mutate(
      { file, mediaType },
      {
        onSuccess: (res) => {
          const asset = res.data;
          toast.success(
            mediaType === 'IMAGE' ? 'Image optimised and stored' : 'Video stored unchanged',
            mediaType === 'IMAGE'
              ? `Saved ${asset.percentSaved}% (${formatBytes(asset.originalSizeBytes)} → ${formatBytes(asset.storedSizeBytes)}).`
              : `Stored ${formatBytes(asset.storedSizeBytes)} without re-encoding.`,
          );
        },
        onError: (err) => {
          toast.error('Upload failed', err instanceof ApiError ? err.message : 'Please try again.');
        },
      },
    );
  };

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">My media</h1>
          <p className="mt-1 text-sm ss-subtle">
            Images are optimised before storage. Videos are kept exactly as uploaded, at full quality.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={imageInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file, 'IMAGE');
              e.target.value = '';
            }}
          />
          <input
            ref={videoInput}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file, 'VIDEO');
              e.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            loading={uploadMedia.isPending}
            onClick={() => imageInput.current?.click()}
            leftIcon={<Upload className="h-4 w-4" aria-hidden="true" />}
          >
            Upload image
          </Button>
          <Button
            loading={uploadMedia.isPending}
            onClick={() => videoInput.current?.click()}
            leftIcon={<Video className="h-4 w-4" aria-hidden="true" />}
          >
            Upload video
          </Button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {(['ALL', 'IMAGE', 'VIDEO'] as const).map((value) => (
          <Button
            key={value}
            variant={filter === value ? 'primary' : 'ghost'}
            onClick={() => setFilter(value)}
          >
            {value === 'ALL' ? 'All' : value === 'IMAGE' ? 'Images' : 'Videos'}
          </Button>
        ))}
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <SkeletonRows count={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-6 w-6" aria-hidden="true" />}
          title="Nothing uploaded yet"
          description="Upload a profile photograph, a gallery image or a video to see it here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((asset) => (
            <Card key={asset.id}>
              <CardBody className="space-y-3">
                <div className="overflow-hidden rounded-lg bg-black/5">
                  {asset.mediaType === 'VIDEO' ? (
                    <video
                      src={asset.url}
                      poster={asset.thumbnailUrl ?? undefined}
                      controls
                      preload="metadata"
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <img
                      src={asset.thumbnailUrl ?? asset.url}
                      alt={asset.originalFileName}
                      loading="lazy"
                      className="aspect-video w-full object-cover"
                    />
                  )}
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{asset.originalFileName}</p>
                    <p className="text-xs ss-subtle">
                      {asset.width && asset.height ? `${asset.width}×${asset.height}` : 'Dimensions unavailable'}
                      {asset.durationSeconds ? ` · ${asset.durationSeconds.toFixed(1)}s` : ''}
                    </p>
                  </div>
                  <Badge variant={asset.visibility === 'PUBLIC' ? 'success' : 'neutral'}>
                    {asset.visibility === 'PUBLIC' ? 'Public' : 'Private'}
                  </Badge>
                </div>

                {asset.mediaType === 'IMAGE' && asset.compressionReport ? (
                  <div className="rounded-lg border p-2 text-xs">
                    <p className="font-medium">
                      {asset.compressionReport.status === 'OPTIMIZED' ? 'Optimised' : 'Original kept'}
                    </p>
                    <p className="ss-subtle">
                      {formatBytes(asset.originalSizeBytes)} → {formatBytes(asset.storedSizeBytes)}
                      {asset.compressionReport.status === 'OPTIMIZED'
                        ? ` · ${asset.percentSaved}% smaller`
                        : ''}
                    </p>
                    <p className="mt-1 ss-subtle">{asset.compressionReport.note}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border p-2 text-xs">
                    <p className="font-medium">Stored at original quality</p>
                    <p className="ss-subtle">
                      {formatBytes(asset.storedSizeBytes)} · not re-encoded
                      {asset.frameRate ? ` · ${asset.frameRate.toFixed(2)} fps` : ''}
                    </p>
                  </div>
                )}

                <Button
                  variant="ghost"
                  loading={deleteMedia.isPending}
                  onClick={() =>
                    deleteMedia.mutate(asset.id, {
                      onSuccess: () => toast.success('Deleted'),
                      onError: () => toast.error('Could not delete that file'),
                    })
                  }
                  leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                >
                  Delete
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
