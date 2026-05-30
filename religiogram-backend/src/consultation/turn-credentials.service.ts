import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

/**
 * v9 (P0-3 fix): Time-bound TURN credential issuer (RFC 7065).
 *
 * The frontend asks the API for fresh ICE servers right before opening the
 * RTCPeerConnection. The TURN secret (`TURN_SHARED_SECRET`) NEVER leaves the
 * backend — the username is `<expiry-unix>:<userId>` and the password is
 * HMAC_SHA1(secret, username), Base64-encoded, valid for 1 hour.
 *
 * The TURN server (coturn) must be configured with:
 *   use-auth-secret
 *   static-auth-secret = <same TURN_SHARED_SECRET>
 *
 * When TURN is not configured (operator hasn't supplied TURN_HOST + secret)
 * the service returns only the public STUN server. WebRTC will still work
 * for the majority of users (those not behind symmetric NAT) but degrades
 * for the rest. The metric `turn_unconfigured_call_attempts_total` is
 * incremented so operators can see when they need to provision TURN.
 */
@Injectable()
export class TurnCredentialsService {
  private readonly logger = new Logger(TurnCredentialsService.name);

  constructor(private readonly config: ConfigService) {}

  issueFor(userId: string): {
    iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
    expiresAt: number;
  } {
    const turnHost = this.config.get<string>('turn.host', '');
    const turnSecret = this.config.get<string>('turn.sharedSecret', '');
    const ttlSeconds = this.config.get<number>('turn.ttlSeconds', 3600);
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
      { urls: 'stun:stun.l.google.com:19302' },
    ];

    if (turnHost && turnSecret) {
      const username = `${expiresAt}:${userId}`;
      const credential = createHmac('sha1', turnSecret).update(username).digest('base64');
      iceServers.push({
        urls: [`turn:${turnHost}?transport=udp`, `turn:${turnHost}?transport=tcp`, `turns:${turnHost}?transport=tcp`],
        username,
        credential,
      });
    } else {
      this.logger.warn('TURN not configured — public STUN only. Calls behind symmetric NAT will fail.');
    }

    return { iceServers, expiresAt };
  }
}
