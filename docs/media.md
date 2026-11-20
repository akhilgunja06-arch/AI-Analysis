# Media, storage and the assistant

This document covers the three feature areas added together: file storage and
media, favourites, and the (optional) AI assistant. All three follow the existing
house rules — real data only, no mock responses, and per-user isolation enforced
on the server.

## Storage buckets

Five logical buckets. The bucket is always the first path segment of a storage
key, and the key is always scoped to the owning user's UUID.

| Bucket | Contents | Default visibility | Served via |
| --- | --- | --- | --- |
| `profile-images` | Avatars | Public | `/uploads/profile-images/...` |
| `user-images` | Gallery images | Private | signed URL |
| `user-videos` | Videos | Private | signed URL |
| `message-attachments` | Chat attachments | Private | signed URL |
| `thumbnails` | Generated previews | Private | signed URL |

Key shape: `{bucket}/{userId}/{uuid}{ext}`. The only bucket that is ever exposed
as a permanent public path is `profile-images`. Everything else is served through
a short-lived signed URL, so a stored path is never a permanent public link.

The local provider writes under `UPLOAD_DIR` and the API exposes it read-only at
`/uploads`, but the static mount refuses any path that is not under
`profile-images`. Private objects are only reachable through
`GET /api/media/file?key=...&expires=...&sig=...`, where the signature is an HMAC
over `key:expires` and is verified in constant time. The signature is bound to
the key, so it cannot be repointed at another member's object, and it expires.

## Image optimisation

Images are optimised before they are stored, by `server/src/services/image.service.ts`.
The pipeline is deliberately described honestly: this is adaptive compression by
`sharp`, not an AI model. No AI service is involved unless `AI_PROVIDER` is set.

1. The declared MIME type is checked against the actual bytes (magic-number
   sniffing). A file whose bytes do not match its declared type is rejected.
2. Dimensions and format are read from the file.
3. Metadata is dropped, which removes EXIF including any GPS location.
4. The image is resized down to a maximum dimension, preserving aspect ratio.
   Images already inside the limit are not upscaled.
5. Quality is chosen adaptively from the image's luminance standard deviation:
   busy images (more detail, more risk of visible artefacts) get a higher
   quality; smooth images get a more aggressive setting.
6. The result is encoded as WebP and written to storage, alongside a thumbnail.
7. The result is only kept if it is actually smaller than the original. If
   optimisation would not help, the original bytes are stored and the status is
   recorded as `SKIPPED`. A better-quality original is never replaced by a larger
   or visibly worse result.

The response carries a compression report: original size, stored size, percentage
saved, dimensions before and after, and the processing status. Because WebP is a
lossy format here, this is described as compression, not as lossless.

Profile photographs use a gentler quality curve than gallery images.

## Video uploads

Video quality is never reduced. The original bytes are written to storage
unchanged; there is no re-encode, no resolution change, no bitrate change and no
frame-rate change. The upload path only ever *reads* the file to extract metadata
and a poster frame.

- Metadata (duration, dimensions, frame rate, bitrate) comes from `ffprobe`.
- A poster frame is generated separately with `ffmpeg`; the original file is
  untouched.
- A SHA-256 checksum of the uploaded bytes is recorded.
- `GET /api/media/:id/integrity` re-hashes the stored object and reports whether
  it still matches, which is how "the stored video equals the original" is
  verified rather than assumed.

Large videos use a resumable upload:

1. `POST /api/media/uploads` opens a session and returns an upload id.
2. `PUT /api/media/uploads/:id/chunk?index=N` appends chunks. Chunks must arrive
   in order — an out-of-order chunk is rejected with `409`, so the assembled file
   can never be a shuffled byte sequence.
3. `POST /api/media/uploads/:id/complete` assembles the parts, verifies the total
   size, stores the result and records the asset.
4. `DELETE /api/media/uploads/:id` abandons a session and frees the parts.

Unfinished sessions carry an expiry (`MEDIA_UPLOAD_TTL_MINUTES`) so abandoned
uploads do not accumulate.

If video optimisation is ever offered, it must produce a separate asset. The
original is never replaced without explicit approval.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/media/images` | Validate, optimise, store an image |
| `POST` | `/api/media/videos` | Store a video unchanged |
| `POST` | `/api/media/uploads` | Open a resumable video upload |
| `PUT` | `/api/media/uploads/:id/chunk` | Append one chunk |
| `POST` | `/api/media/uploads/:id/complete` | Assemble and store |
| `DELETE` | `/api/media/uploads/:id` | Abandon an upload |
| `GET` | `/api/media` | List the caller's own media |
| `GET` | `/api/media/:id` | Metadata plus a fetchable URL |
| `GET` | `/api/media/:id/integrity` | Re-hash a stored video and compare |
| `GET` | `/api/media/:id/download` | Stream the object to its owner |
| `PATCH` | `/api/media/:id` | Change visibility |
| `DELETE` | `/api/media/:id` | Delete an asset and its stored bytes |
| `GET` | `/api/media/file` | Signed-URL delivery (the signature is the credential) |

Favourites:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/favorites` | The caller's own favourites |
| `POST` | `/api/favorites/:username` | Add (idempotent) |
| `DELETE` | `/api/favorites/:username` | Remove |
| `GET` | `/api/favorites/:username` | Whether the caller has saved this member |

Favourites are private: the list endpoint only ever returns the caller's own
saves. Self-favourites are rejected.

The assistant:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/ai/conversations` | The caller's own conversations |
| `POST` | `/api/ai/conversations` | Create a conversation |
| `GET` | `/api/ai/conversations/:id` | A conversation and its messages |
| `POST` | `/api/ai/conversations/:id/messages` | Send a message |
| `DELETE` | `/api/ai/conversations/:id` | Delete a conversation |

Conversations are scoped to their owner. When no model provider is configured,
sending a message saves it and returns `501 AI_NOT_CONFIGURED` with an explicit
message. It does not fabricate a reply.

## Authorization model

Every media route is behind `requireAuth`. Ownership is checked on the server
for every read, update and delete; a client-supplied id is never trusted. Accessing another member's asset
returns the same `404` as a missing one, so the API does not reveal whether an id
exists. A member can only read a conversation they participate in, and only their
own notifications, favourites and AI history.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `STORAGE_PROVIDER` | `local` | `local` writes to disk; `s3` is not yet implemented and returns 501 |
| `UPLOAD_DIR` | `./uploads` | Root for locally stored objects |
| `MAX_UPLOAD_BYTES` | 5 MB | Avatars and message attachments |
| `MAX_IMAGE_UPLOAD_BYTES` | 15 MB | Images |
| `MAX_VIDEO_UPLOAD_BYTES` | 200 MB | Videos |
| `MEDIA_SIGNED_URL_TTL_SECONDS` | 900 | Signed-URL lifetime |
| `MEDIA_UPLOAD_TTL_MINUTES` | 120 | Abandoned resumable-upload lifetime |
| `AI_PROVIDER` | `none` | `none` or `groq` (only Groq is implemented) |
| `AI_API_KEY` | empty | Required only when a provider is set |
| `AI_MODEL` | `openai/gpt-oss-120b` | Groq model id; see console.groq.com/docs/models |

Uploads are rate-limited per user. Signed-URL secrets are derived server-side and
never sent to the browser.
