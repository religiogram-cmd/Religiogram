/**
 * P2-5: SocialGateway — WebSocket push for community DMs.
 *
 * Previously CommunityScreen polled GET /dms/:userId every 3 seconds.
 * This gateway subscribes to the Redis channel `dm:{recipientId}` and
 * pushes `dm.message` events to connected clients in real-time.
 *
 * Namespace: /social
 * Authentication: same JWT handshake as consultation gateway.
 */
import {
  ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect,
  OnGatewayInit, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { RedisService } from '../redis/redis.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

interface AuthenticatedSocket extends Socket {
  data: { userId: string; jti: string; exp?: number };
}

export const DM_REDIS_CHANNEL = (recipientId: string) => `dm:${recipientId}`;

@WebSocketGateway({
  namespace: '/social',
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 16_000,
})
export class SocialGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(SocialGateway.name);

  /** socketId → userId for fan-out */
  private readonly userSockets = new Map<string, Set<Socket>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async afterInit(server: Server): Promise<void> {
    // Wire Socket.IO Redis adapter for cross-pod delivery (same pattern as ConsultationGateway).
    const host     = this.config.getOrThrow<string>('redis.host');
    const port     = this.config.get<number>('redis.port', 6379);
    const password = this.config.get<string | undefined>('redis.password');
    const tls      = this.config.get<boolean>('redis.tls', false);

    const redisUrl = password
      ? `redis://:${encodeURIComponent(password)}@${host}:${port}`
      : `redis://${host}:${port}`;
    const socketOpts = tls ? { socket: { tls: true } } : {};

    try {
      const pubClient = createClient({ url: redisUrl, ...(socketOpts as object) } as Parameters<typeof createClient>[0]);
      const subClient = pubClient.duplicate();
      pubClient.on('error', (err: Error) => this.logger.error(`Social WS Redis pub error: ${err.message}`));
      subClient.on('error', (err: Error) => this.logger.error(`Social WS Redis sub error: ${err.message}`));
      await Promise.all([pubClient.connect(), subClient.connect()]);
      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('SocialGateway: Socket.IO Redis adapter attached');
    } catch (err) {
      this.logger.error(`SocialGateway: Failed to attach Redis adapter: ${(err as Error).message}`);
    }

    // psubscribe remains as a direct-push path for sockets tracked on this pod.
    this.redis
      .psubscribe('dm:*', (msg: string, channel: string) => {
        try {
          const recipientId = channel.replace(/^dm:/, '');
          const sockets = this.userSockets.get(recipientId);
          if (!sockets) return;
          const payload = JSON.parse(msg);
          for (const s of sockets) {
            (s as Socket).emit('dm.message', payload);
          }
        } catch { /* malformed message — ignore */ }
      })
      .catch((err: Error) => this.logger.error(`SocialGateway dm psubscribe failed: ${err.message}`));

    // Subscribe to feed updates → emit `post.new` to follower's sockets
    this.redis
      .psubscribe('feed:*', (msg: string, channel: string) => {
        try {
          const userId = channel.replace(/^feed:/, '');
          const sockets = this.userSockets.get(userId);
          if (!sockets) return;
          const payload = JSON.parse(msg);
          for (const s of sockets) {
            (s as Socket).emit('post.new', payload);
          }
        } catch { /* malformed — ignore */ }
      })
      .catch((err: Error) => this.logger.error(`SocialGateway feed psubscribe failed: ${err.message}`));
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token: string | undefined =
      client.handshake?.auth?.token ||
      (client.handshake?.headers?.authorization as string | undefined)?.split(' ')[1];
    if (!token) { client.disconnect(true); return; }
    try {
      // Match TokenService::signAccessToken which uses HS256 + privateKey.
      // Previously verified RS256+publicKey → every social socket rejected.
      const secret = this.config.getOrThrow<string>('jwt.privateKey');
      const payload = this.jwtService.verify<JwtPayload>(token, {
        algorithms: ['HS256'],
        secret,
      });
      if (payload.type !== 'access') throw new Error('Not an access token');
      // Check token is not revoked via minIat (logout-all protection)
      const minIatKey = `user:${payload.sub}:minIat`;
      const minIatStr = await this.redis.getClient().get(minIatKey);
      if (minIatStr) {
        const minIat = parseInt(minIatStr, 10);
        if ((payload.iat ?? 0) < minIat) {
          client.emit('error', { message: 'Token revoked — please reconnect' });
          client.disconnect(true);
          return;
        }
      }
      client.data.userId = payload.sub;
      client.data.jti    = payload.jti;
      client.data.exp    = payload.exp;

      const set = this.userSockets.get(payload.sub) ?? new Set<Socket>();
      set.add(client);
      this.userSockets.set(payload.sub, set);
      this.logger.debug(`Social WS connected userId=${payload.sub}`);
    } catch (err) {
      this.logger.warn(`Social WS auth failed: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const userId = client.data?.userId;
    if (userId) {
      const set = this.userSockets.get(userId);
      if (set) {
        set.delete(client);
        if (set.size === 0) this.userSockets.delete(userId);
      }
    }
  }
}
