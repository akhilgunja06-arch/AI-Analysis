# WebRTC calling setup

SkillSpring supports one-to-one audio and video calls between members. Media
travels directly between the two browsers; the server only relays signalling.

## How a call works

```
Caller                    API + Socket.IO                   Callee
  |  POST /api/calls          |                              |
  |-------------------------->|  CallSession RINGING         |
  |                           |--- call:incoming ----------->|
  |                           |<-- POST /api/calls/:id/accept|
  |                           |--- call:accepted ----------->|
  |  socket call:offer        |                              |
  |-------------------------->|--- call:offer -------------->|
  |  socket call:answer       |<-- call:answer ---------------|
  |  socket call:ice (both directions, trickled)             |
  |<=========== direct media over SRTP ======================>|
  |  socket call:hangup       |--- call:hangup ------------->|
```

`web/src/hooks/usePeerConnection.ts` owns the `RTCPeerConnection`. There is no
simulated stream and no poster image: if `getUserMedia` is denied or the peer
connection fails, the interface says so.

## Authorisation

Every signalling frame is relayed by **call id**, never by a user id the client
supplies. Before relaying, the server confirms the sender is the caller or callee
of that call. A member who is not a participant cannot:

- read the call record (`404`),
- accept or reject it (`404`),
- inject an offer, answer or ICE candidate into it.

The call record itself is created by `POST /api/calls`, which requires an
authenticated, verified member and a real, existing recipient username.

## ICE configuration

The browser needs STUN to discover its public address, and TURN to relay media
when a direct path is blocked.

```bash
WEBRTC_STUN_URLS="stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"
WEBRTC_TURN_URLS=""
WEBRTC_TURN_USERNAME=""
WEBRTC_TURN_CREDENTIAL=""
WEBRTC_TURN_STATIC_SECRET=""
WEBRTC_TURN_TTL_SECONDS=3600
CALL_RING_TIMEOUT_SECONDS=45
```

`GET /api/calls/ice` returns the ICE server list to an authenticated member. TURN
credentials are minted server-side into a short-lived credential when
`WEBRTC_TURN_STATIC_SECRET` is set, so long-lived secrets never reach the browser.

### STUN only (development, most home networks)

The default. Two browsers on the same machine or the same home network connect
directly. The `/calls` page warns that strict networks may fail — that warning is
accurate, and it is shown instead of letting a call appear to connect.

### Adding TURN (required for reliable calls in production)

Many corporate, campus and mobile networks block the UDP paths a direct
connection needs. Without TURN those calls fail. Options:

1. **Hosted TURN** — Metered, Twilio Network Traversal, Cloudflare Calls and
   similar provide credentials and a URL:
   ```bash
   WEBRTC_TURN_URLS="turn:global.turn.example.com:3478?transport=udp,turns:global.turn.example.com:5349?transport=tcp"
   WEBRTC_TURN_USERNAME="your-username"
   WEBRTC_TURN_CREDENTIAL="your-credential"
   ```
2. **Self-hosted coturn** with time-limited credentials:
   ```bash
   WEBRTC_TURN_URLS="turn:turn.yourdomain.com:3478?transport=udp,turns:turn.yourdomain.com:5349?transport=tcp"
   WEBRTC_TURN_STATIC_SECRET="the-same-static-auth-secret-as-coturn"
   WEBRTC_TURN_TTL_SECONDS=3600
   ```
   In `turnserver.conf` set `use-auth-secret`, `static-auth-secret` and
   `realm`. Open 3478/udp, 3478/tcp and 5349/tcp, plus the relay port range.

After configuring, `GET /api/support/status` reports `webrtc.turn` greater than
zero. The warning disappears from `/calls` only when TURN is actually present.

## HTTPS is mandatory

`getUserMedia` only works on `https://` origins or `http://localhost`. A plain
HTTP deployment on any other hostname will have its camera and microphone
requests refused by the browser. Terminate TLS at your proxy and set
`COOKIE_SECURE=true` and `API_PUBLIC_URL` to the HTTPS URL.

## What the interface offers

- Start an audio or video call from `/calls`, a member profile, or a message
  thread.
- Incoming call panel with accept and reject.
- Mute and unmute the microphone.
- Turn the camera on and off, and switch camera where the browser supports it.
- Live call duration and connection state.
- End call from either side; both sides clean up tracks and close the peer
  connection.
- An unanswered call is marked missed after `CALL_RING_TIMEOUT_SECONDS`.

## Recording

Calls are never recorded. There is no recording code path, so consent handling is
not needed. If recording is ever added, it must require explicit consent from
both participants before any capture begins.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Permission denied" | Browser blocked camera/microphone. Check site permissions and that the page is HTTPS. |
| Call stays "connecting", then fails | No direct path and no TURN. Configure TURN. |
| One-way audio | Symmetric NAT or a firewall dropping RTP; TURN usually fixes it. |
| Incoming call never arrives | Socket not connected. Check the browser console for the socket handshake and that `/socket.io` is proxied. |
| Video works, audio does not | Wrong input device selected in the OS, or muted at the system level. |

## Limits of this implementation

- One-to-one calls only. There are no group calls.
- The signalling relay is in-process. A multi-instance deployment needs a
  Socket.IO adapter (for example the Redis adapter) so both members reach the
  same instance.
- There is no call recording, no screen sharing and no virtual background.
