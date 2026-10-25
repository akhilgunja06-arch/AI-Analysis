# Deployment

SkillSpring has two deployable pieces: the API (`server/`) and the static front
end build (`web/`). PostgreSQL is the only stateful dependency.

The API does not serve the front-end build. It serves `/api`, `/uploads` and
`/health`, and attaches Socket.IO. A reverse proxy should serve the static build
and forward those three paths plus `/socket.io` to the API.

## Build

```bash
# API
cd server
npm ci
npm run prisma:generate
npm run build            # emits server/dist

# Front end
cd ../web
npm ci
npm run build            # emits web/dist
```

## Environment

Create `server/.env` from `server/.env.example`. Production requires at least:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your PostgreSQL connection string |
| `ACCESS_TOKEN_SECRET` | `openssl rand -hex 48` |
| `PASSWORD_PEPPER` | A long random string |
| `CORS_ORIGINS` | The exact public origin of the front end |
| `COOKIE_SECURE` | `true` (the app must be served over HTTPS) |
| `COOKIE_DOMAIN` | Your domain |
| `API_PUBLIC_URL` | The public URL of the API, used in email links |

The server validates this at startup and refuses to run in production with a weak
or default secret, no pepper, insecure cookies, or a `localhost` origin in
`CORS_ORIGINS`. It prints which values are wrong and exits.

For the front end, set `web/.env` before building:

```
VITE_API_URL="https://your-domain.example/api"
VITE_SOCKET_URL="https://your-domain.example"
```

These are public values. Do not put secrets in front-end environment variables;
anything prefixed `VITE_` is compiled into the bundle and visible to every user.

## Database

Apply migrations before starting the new API version:

```bash
cd server
npm run prisma:deploy
```

`prisma:deploy` only applies migrations that already exist; it never generates or
drops anything. Do not run `prisma:migrate` or `db:reset` against production.

Take a backup first. The migrations are additive, but a backup is cheap insurance.

## Run

```bash
cd server
npm start                # node dist/index.js
```

Run the API behind a process manager so it restarts on failure. Two operational
notes:

- The reminder scheduler runs inside the API process. Running more than one
  instance will send duplicate reminders. Run a single instance, or move the
  scheduler to a separate worker first.
- Rate limiting uses in-memory storage, so limits are per instance. Behind
  multiple instances, use a shared store or a rate limiter at the proxy.

## Reverse proxy

The API sets `trust proxy` so client IPs are read from `X-Forwarded-For`. Your
proxy should set that header.

```nginx
server {
    listen 443 ssl;
    server_name your-domain.example;

    root /var/www/skillspring;   # contents of web/dist

    # The SPA uses client-side routing; unknown paths must return index.html.
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
    }

    # Socket.IO needs the upgrade headers.
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Health check

`GET /health` returns the service status and is suitable for a load balancer or
uptime monitor. It does not require authentication.

## Uploads

With `STORAGE_PROVIDER=local`, uploads are written to `UPLOAD_DIR` and served from
`/uploads`. That directory must be writable by the API process and persisted
across deploys, or avatars and attachments will disappear on the next release.
For multi-instance or ephemeral deployments, use `STORAGE_PROVIDER=s3` with
S3-compatible storage instead.

## Email

Password reset and email verification only deliver when an email provider is
configured. With the default `EMAIL_PROVIDER=console`, links are written to the
log instead. Set `EMAIL_PROVIDER=smtp` and the `SMTP_*` values to send real mail,
and confirm `API_PUBLIC_URL` matches your public URL so the links in those emails
resolve.

## Pre-launch checklist

- [ ] `ACCESS_TOKEN_SECRET` and `PASSWORD_PEPPER` are unique to this deployment.
- [ ] `CORS_ORIGINS` lists only your real origins.
- [ ] The app is served over HTTPS and `COOKIE_SECURE=true`.
- [ ] Demo accounts from the seed are removed, or their passwords rotated.
      The seed is for local development only.
- [ ] `npm test` passes in `server/` and `web/`.
- [ ] Migrations applied and a database backup taken.
- [ ] Email delivery tested end to end if you rely on it.
- [ ] `UPLOAD_DIR` is persisted, or S3 storage is configured.
- [ ] A single API instance runs, or the reminder scheduler has been moved out.

## Post-deploy smoke test

```bash
curl -fsS https://your-domain.example/health
curl -fsS https://your-domain.example/api/openapi.json > /dev/null && echo "API ok"
```

Then sign in and confirm the dashboard loads, an exchange workspace opens, and a
message sends. These three exercise the database, the exchange state machine and
the realtime channel.

## Rolling back

The API is a stateless process: redeploy the previous build. Migrations are
forward-only, so a rollback that spans a schema change needs the matching
database restore.
