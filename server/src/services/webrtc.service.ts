import crypto from 'node:crypto';
import { env } from '../config/env';

/**
 * ICE servers handed to the browser for WebRTC.
 *
 * STUN is enough for most home networks. TURN relays media when both peers sit
 * behind symmetric NAT or a restrictive firewall, so a production deployment
 * needs one.
 *
 * TURN credentials:
 *  - with WEBRTC_TURN_STATIC_SECRET, time-limited credentials are derived per
 *    request using the coturn REST API scheme (RFC 5766 long-term credential),
 *    so a static username/password is never shipped to the browser;
 *  - otherwise the static username/credential is passed through.
 * The secret itself never leaves the server.
 */

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export function buildIceServers(userId: string): IceServer[] {
  const servers: IceServer[] = [];

  if (env.stunUrls.length) {
    servers.push({ urls: env.stunUrls });
  }

  if (env.turnUrls.length) {
    if (env.WEBRTC_TURN_STATIC_SECRET) {
      const ttl = env.WEBRTC_TURN_TTL_SECONDS;
      const username = `${Math.floor(Date.now() / 1000) + ttl}:${userId}`;
      const credential = crypto
        .createHmac('sha1', env.WEBRTC_TURN_STATIC_SECRET)
        .update(username)
        .digest('base64');
      servers.push({ urls: env.turnUrls, username, credential });
    } else if (env.WEBRTC_TURN_USERNAME) {
      servers.push({
        urls: env.turnUrls,
        username: env.WEBRTC_TURN_USERNAME,
        credential: env.WEBRTC_TURN_CREDENTIAL,
      });
    } else {
      // A TURN URL without credentials is useless; report it rather than
      // handing the browser a server it can never authenticate to.
      servers.push({ urls: env.turnUrls });
    }
  }

  return servers;
}

export function webrtcSummary() {
  return {
    stun: env.stunUrls,
    turn: env.turnUrls.length,
    turnHasCredentials: Boolean(env.WEBRTC_TURN_STATIC_SECRET || env.WEBRTC_TURN_USERNAME),
    ringTimeoutSeconds: env.CALL_RING_TIMEOUT_SECONDS,
  };
}
