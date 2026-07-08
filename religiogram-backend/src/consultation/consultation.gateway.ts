import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
  OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer, WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ConsultationMessage, MessageType } from './entities/consultation-message.entity';
import { ConsultationSession } from './entities/consultation-session.entity';
import { RedisService } from '../redis/redis.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/** P2-3: Token-bucket state stored per socket. */
interface SocketRateBucket {
  tokens: number;       // available tokens (capacity = WS_RATE_CAPACITY)
  lastRefill: number;   // epoch ms of last refill
}

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    role: string;
    jti: string;
    exp?: number;
    sessionAuthz?: Record<string, boolean>;
    rateBucket?: SocketRateBucket;
  };
}

interface JoinSessionPayload { sessionId: string }
interface SendMessagePayload { sessionId: string; content: string; messageType?: MessageType }
interface ResumePayload { lastEventSeq: number }

@WebSocketGateway({
  namespace: '/consultation',
  transports: ['websocket', 'polling'],
  // WS2: Limit incoming message size to 32 KB.
  // Without this the default is 1 MB — a connected client can send a single
  // 1 MB frame to spike CPU in the JSON parser or flood the event queue.
  maxHttpBufferSize: 32_000,
})
export class ConsultationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(ConsultationGateway.name);

  /**
   * P1-4: O(1) JTI → socket(s) lookup.
   * One Map entry per JTI; a user can have multiple sockets (tabs/devices)
   * sharing the same access token.  When that token is revoked every socket
   * that presented it is disconnected in a single pass.
   *
   * This replaces the previous per-socket subscribe() calls, which created a
   * new Redis subscription for every connected client.
   */
  private readonly socketsByJti = new Map<string, Set<Socket>>();

  constructor(
    @InjectRepository(ConsultationMessage)
    private readonly messageRepo: Repository<ConsultationMessage>,
    @InjectRepository(ConsultationSession)
    private readonly sessionRepo: Repository<ConsultationSession>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async afterInit(server: Server): Promise<void> {
    const rootServer: Server = (server as Server & { server?: Server }).server ?? server;

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
      pubClient.on('error', (err: Error) => this.logger.error(`Redis pub error: ${err.message}`));
      subClient.on('error', (err: Error) => this.logger.error(`Redis sub error: ${err.message}`));
      await Promise.all([pubClient.connect(), subClient.connect()]);
      rootServer.adapter(createAdapter(pubClient, subClient));
      this.logger.log('Socket.IO Redis adapter attached');
    } catch (err) {
      this.logger.error(`Failed to attach Redis adapter: ${(err as Error).message}`);
    }

    const allowedOrigins = this.config.get<string[]>('app.corsOrigins', []);
    if (allowedOrigins.length) {
      rootServer.engine?.on('initial_headers', (headers: Record<string, string>, req: { headers: Record<string, string> }) => {
        const origin = req.headers['origin'];
        if (origin && allowedOrigins.includes(origin)) {
          headers['access-control-allow-origin'] = origin;
          headers['access-control-allow-credentials'] = 'true';
        }
      });
    }

    // P1-4: Single Redis subscription for JWT revocation events.
    // All connected sockets share one subscriber; the socketsByJti Map provides
    // O(1) lookup so revocation cost is O(k) where k = sockets per JTI (usually 1).
    this.redis.subscribe('auth:jti:revoked', (msg: string) => {
      const trimmed = msg.trim();
      // Check for individual JTI revocation
      const socketsForJti = this.socketsByJti.get(trimmed);
      if (socketsForJti) {
        for (const s of socketsForJti) {
          try {
            s.emit('exception', { message: 'Unauthorized: token revoked' });
            s.disconnect(true);
          } catch { /* socket already gone */ }
        }
        this.socketsByJti.delete(trimmed);
        this.logger.log(`P1-4: revoked JTI=${trimmed} — disconnected ${socketsForJti.size} socket(s)`);
      }
      // Also handle user-scope logout-all: payload = "user:<userId>"
      if (trimmed.startsWith('user:')) {
        const userId = trimmed.slice(5);
        for (const [jti, sockets] of this.socketsByJti.entries()) {
          const sample = [...sockets][0] as AuthenticatedSocket | undefined;
          if (sample?.data?.userId === userId) {
            for (const s of sockets) {
              try {
                (s as AuthenticatedSocket).emit('exception', { message: 'Unauthorized: token revoked' });
                s.disconnect(true);
              } catch { /* socket already gone */ }
            }
            this.socketsByJti.delete(jti);
          }
        }
      }
    }).catch((err: Error) =>
      this.logger.error(`P1-4: Failed to subscribe jti revocation channel: ${err.message}`),
    );
  }

  /**
   * P2-3: Token-bucket rate limiter — 30 messages/second per socket.
   * Tokens refill at a rate of WS_RATE_CAPACITY per WS_RATE_WINDOW_MS.
   * Returns false and emits 'exception' if the limit is exceeded.
   */
  private readonly WS_RATE_CAPACITY = 30;
  private readonly WS_RATE_WINDOW_MS = 1_000;

  private checkRateLimit(client: AuthenticatedSocket): boolean {
    const now = Date.now();
    if (!client.data.rateBucket) {
      client.data.rateBucket = { tokens: this.WS_RATE_CAPACITY - 1, lastRefill: now };
      return true;
    }
    const bucket = client.data.rateBucket;
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.WS_RATE_WINDOW_MS) {
      bucket.tokens = this.WS_RATE_CAPACITY;
      bucket.lastRefill = now;
    }
    if (bucket.tokens <= 0) {
      client.emit('exception', { message: 'Rate limit exceeded — slow down', code: 429 });
      return false;
    }
    bucket.tokens--;
    return true;
  }

  private ensureLive(client: AuthenticatedSocket): boolean {
    const exp = client.data.exp;
    if (typeof exp === 'number' && Date.now() / 1000 > exp) {
      client.emit('exception', { message: 'Unauthorized: token expired' });
      client.disconnect(true);
      return false;
    }
    return true;
  }

  private async assertParticipant(client: AuthenticatedSocket, sessionId: string): Promise<void> {
    const cached = client.data.sessionAuthz?.[sessionId];
    if (cached) return;

    const [row] = await this.ds.query<{ user_id: string; provider_id: string }[]>(
      `SELECT b.user_id, b.provider_id
       FROM bookings b
       JOIN consultation_sessions s ON s.booking_id = b.id
       WHERE s.session_id = $1`,
      [sessionId],
    );
    if (!row) throw new WsException('Session not found');
    if (row.user_id !== client.data.userId && row.provider_id !== client.data.userId) {
      throw new WsException('You are not a participant of this session');
    }
    const authz = client.data.sessionAuthz ?? (client.data.sessionAuthz = {});
    authz[sessionId] = true;
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token: string | undefined =
      client.handshake?.auth?.token ||
      (client.handshake?.headers?.authorization as string | undefined)?.split(' ')[1];
    if (!token) {
      this.logger.warn(`Connection refused - no token (socketId=${client.id})`);
      client.emit('exception', { message: 'Unauthorized: no token' });
      client.disconnect(true);
      return;
    }
    try {
      const publicKey = this.config.getOrThrow<string>('jwt.publicKey');
      const issuer    = this.config.get<string>('jwt.issuer');
      const audience  = this.config.get<string>('jwt.audience');

      const payload = this.jwtService.verify<JwtPayload>(token, {
        algorithms: ['RS256'],
        publicKey, issuer, audience,
      });

      if (payload.type !== 'access') throw new Error('Not an access token');

      client.data.userId = payload.sub;
      client.data.role   = payload.role;
      client.data.jti    = payload.jti;
      client.data.exp    = payload.exp;
      this.logger.debug(`Socket connected: userId=${payload.sub} role=${payload.role} socketId=${client.id}`);

      // P1-4: Register socket in socketsByJti Map for O(1) revocation lookup.
      // The single Redis subscription in afterInit() will use this Map instead
      // of creating a new subscriber for every connection.
      if (payload.jti) {
        const set = this.socketsByJti.get(payload.jti) ?? new Set<Socket>();
        set.add(client);
        this.socketsByJti.set(payload.jti, set);
      }
    } catch (err) {
      this.logger.warn(`Connection refused - invalid token: ${(err as Error).message} (socketId=${client.id})`);
      client.emit('exception', { message: 'Unauthorized: invalid token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.debug(`Socket disconnected: userId=${client.data?.userId} socketId=${client.id}`);
    // P1-4: Remove socket from socketsByJti Map to avoid memory leak.
    const jti = client.data?.jti;
    if (jti) {
      const set = this.socketsByJti.get(jti);
      if (set) {
        set.delete(client);
        if (set.size === 0) this.socketsByJti.delete(jti);
      }
    }

    /* Ghost-busy prevention: if a PROVIDER's socket drops mid-session,
     * clear their is_busy flag so the marketplace stops showing them as
     * "Busy" indefinitely. We look up any ACTIVE session where this user
     * is the provider and flip the flag. Non-blocking; session-grace
     * eventually finalises the session via its cron sweep. */
    const userId = client.data?.userId;
    if (userId) {
      this.ds.query(
        `UPDATE providers p
         SET is_busy = false
         WHERE p.user_id = $1
           AND EXISTS (
             SELECT 1 FROM consultation_sessions s
             WHERE s.provider_id::text = p.id::text
               AND s.session_status IN ('active', 'paused', 'connecting')
           )`,
        [userId],
      ).catch((err) =>
        this.logger.warn(`is_busy clear on disconnect failed for user ${userId}: ${(err as Error).message}`),
      );
    }
  }

  @SubscribeMessage('session.join')
  async handleJoinSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinSessionPayload,
  ): Promise<void> {
    if (!this.ensureLive(client)) return;
    const { sessionId } = payload;
    if (!sessionId) throw new WsException('sessionId is required');

    await this.assertParticipant(client, sessionId);

    const room = this.sessionRoom(sessionId);
    await client.join(room);
    this.logger.debug(`userId=${client.data.userId} joined room=${room}`);
    client.emit('session.joined', { sessionId });
  }

  @SubscribeMessage('session.resume')
  async handleSessionResume(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ResumePayload,
  ): Promise<void> {
    if (!this.ensureLive(client)) return;
    const lastEventSeq = Math.max(0, Number(payload?.lastEventSeq) || 0);

    const rooms = Array.from(client.rooms).filter((r: string) => r.startsWith('session_'));

    for (const room of rooms as string[]) {
      const sessionId = room.replace('session_', '');
      const missed = await this.messageRepo
        .createQueryBuilder('m')
        .where('m.session_id = :sessionId', { sessionId })
        .andWhere('m.seq > :seq', { seq: lastEventSeq })
        .orderBy('m.seq', 'ASC')
        .limit(500)
        .getMany();

      for (const msg of missed) {
        client.emit('message.new', this.serializeMessage(msg));
      }
    }
  }

  @SubscribeMessage('message.send')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessagePayload,
  ): Promise<void> {
    if (!this.ensureLive(client)) return;
    if (!this.checkRateLimit(client)) return; // P2-3
    const { sessionId, content, messageType = MessageType.TEXT } = payload;

    if (!sessionId) throw new WsException('sessionId is required');
    if (!content?.trim()) throw new WsException('content is required');
    if (content.length > 4000) throw new WsException('message too long (max 4000 chars)');

    await this.assertParticipant(client, sessionId);
    const room = this.sessionRoom(sessionId);

    /**
     * P1-2: Use Redis INCR for monotonic message sequence numbers.
     *
     * Previously this used a `SELECT MAX(seq) FOR UPDATE` CTE which took a
     * row-level lock on the consultation_messages table under write load.
     * Redis INCR is atomic, O(1), and ~50× faster, eliminating the lock
     * entirely. The key has a 24h TTL — for an ended session the counter
     * naturally expires; a new session for the same sessionId would start
     * from the correct count if it reuses the ID (it doesn't — UUIDs).
     *
     * Key: `consultation:seq:{sessionId}`, TTL 24 h.
     */
    const seqKey = `consultation:seq:${sessionId}`;
    const seq = await this.redis.incr(seqKey);
    if (seq === 1) {
      // First message in this session — set a 24-hour safety TTL so the
      // counter doesn't accumulate indefinitely in Redis.
      await this.redis.expire(seqKey, 86400);
    }

    const rows = await this.ds.query<any[]>(
      `INSERT INTO consultation_messages
         (id, session_id, sender_id, sender_role, message_type, content, seq, is_read, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, false, now())
       RETURNING *`,
      [sessionId, client.data.userId, client.data.role, messageType, content.trim(), seq],
    );
    const saved = rows[0];

    const serialized = {
      id:          saved.id,
      sessionId:   saved.session_id,
      senderId:    saved.sender_id,
      senderRole:  saved.sender_role,
      messageType: saved.message_type,
      content:     saved.content,
      seq:         saved.seq,
      isRead:      saved.is_read,
      createdAt:   saved.created_at,
    };

    this.server.to(room).emit('message.new', serialized);
  }

  @SubscribeMessage('message.history')
  async handleGetHistory(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string; limit?: number },
  ): Promise<void> {
    if (!this.ensureLive(client)) return;
    const { sessionId, limit = 50 } = payload;
    if (!sessionId) throw new WsException('sessionId is required');
    await this.assertParticipant(client, sessionId);

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    const messages = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.session_id = :sessionId', { sessionId })
      .orderBy('m.created_at', 'DESC')
      .limit(safeLimit)
      .getMany();

    client.emit('message.history', {
      sessionId,
      messages: messages.reverse().map((m: ConsultationMessage) => this.serializeMessage(m)),
    });
  }

  @SubscribeMessage('message.read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string; messageIds: string[] },
  ): Promise<void> {
    if (!this.ensureLive(client)) return;
    const { sessionId, messageIds } = payload;
    if (!sessionId || !Array.isArray(messageIds) || !messageIds.length) return;
    await this.assertParticipant(client, sessionId);

    await this.messageRepo
      .createQueryBuilder()
      .update(ConsultationMessage)
      .set({ isRead: true })
      .where('session_id = :sessionId', { sessionId })
      .andWhere('id IN (:...ids)', { ids: messageIds })
      .andWhere('sender_id != :userId', { userId: client.data.userId })
      .execute();

    const room = this.sessionRoom(sessionId);
    this.server.to(room).emit('message.read_ack', {
      sessionId, messageIds, readBy: client.data.userId,
    });
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<void> {
    if (!this.ensureLive(client)) return;
    if (!this.checkRateLimit(client)) return; // P2-3
    if (!payload?.sessionId) return;
    if (!client.rooms.has(this.sessionRoom(payload.sessionId))) return;
    this.server.to(`session_${payload.sessionId}`).emit('typing', {
      userId: client.data.userId,
      isTyping: (payload as { sessionId: string; isTyping?: boolean }).isTyping ?? true,
    });
  }

  /* ════════════════════════════════════════════════════════════════════
   * v9 (P0-3 fix): WebRTC signalling.
   *
   * The gateway now relays SDP offers/answers and ICE candidates between the
   * two participants of a consultation session. Backend stays out of the
   * media path — it never sees video/audio bytes — it only relays signalling.
   *
   * Media transport uses public STUN by default; TURN credentials are
   * issued via REST (`GET /v1/consultation/turn-credentials`) using
   * short-lived HMAC time-bounded usernames per RFC 7065. If
   * VOICE_VIDEO_ENABLED=false the gateway rejects signalling and the
   * frontend gracefully falls back to text-only chat at a lower per-minute
   * rate (configured in pricing.service via PRICING_TEXT_ONLY_PER_MIN_PAISE).
   * This is the launch-day safeguard: NO call charges are levied for
   * non-existent video sessions.
   * ════════════════════════════════════════════════════════════════════ */

  private isVoiceVideoEnabled(): boolean {
    return this.config.get<string>('consultation.voiceVideoEnabled', 'false') === 'true';
  }

  @SubscribeMessage('call.offer')
  async handleCallOffer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string; sdp: string; type: 'offer' },
  ): Promise<void> {
    if (!this.ensureLive(client)) return;
    if (!this.isVoiceVideoEnabled()) {
      throw new WsException('Voice/video is currently disabled');
    }
    if (!payload?.sessionId || !payload?.sdp || payload?.type !== 'offer') {
      throw new WsException('Invalid offer payload');
    }
    if (payload.sdp.length > 16 * 1024) {
      throw new WsException('SDP payload too large');
    }
    await this.assertParticipant(client, payload.sessionId);
    client.to(this.sessionRoom(payload.sessionId)).emit('call.offer', {
      sessionId: payload.sessionId,
      sdp: payload.sdp,
      type: 'offer',
      fromUserId: client.data.userId,
    });
  }

  @SubscribeMessage('call.answer')
  async handleCallAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string; sdp: string; type: 'answer' },
  ): Promise<void> {
    if (!this.ensureLive(client)) return;
    if (!this.isVoiceVideoEnabled()) {
      throw new WsException('Voice/video is currently disabled');
    }
    if (!payload?.sessionId || !payload?.sdp || payload?.type !== 'answer') {
      throw new WsException('Invalid answer payload');
    }
    if (payload.sdp.length > 16 * 1024) {
      throw new WsException('SDP payload too large');
    }
    await this.assertParticipant(client, payload.sessionId);
    client.to(this.sessionRoom(payload.sessionId)).emit('call.answer', {
      sessionId: payload.sessionId,
      sdp: payload.sdp,
      type: 'answer',
      fromUserId: client.data.userId,
    });
  }

  @SubscribeMessage('call.ice')
  async handleCallIce(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string; candidate: RTCIceCandidateInit },
  ): Promise<void> {
    if (!this.ensureLive(client)) return;
    if (!this.isVoiceVideoEnabled()) return; // silent: ICE arrives during teardown too
    if (!payload?.sessionId || !payload?.candidate) return;
    await this.assertParticipant(client, payload.sessionId);
    client.to(this.sessionRoom(payload.sessionId)).emit('call.ice', {
      sessionId: payload.sessionId,
      candidate: payload.candidate,
      fromUserId: client.data.userId,
    });
  }

  @SubscribeMessage('call.end')
  async handleCallEnd(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string; reason?: string },
  ): Promise<void> {
    if (!this.ensureLive(client)) return;
    if (!payload?.sessionId) return;
    await this.assertParticipant(client, payload.sessionId);
    this.server.to(this.sessionRoom(payload.sessionId)).emit('call.ended', {
      sessionId: payload.sessionId,
      endedBy: client.data.userId,
      reason: payload.reason ?? 'user_hangup',
    });
  }

  private sessionRoom(sessionId: string): string {
    return `session_${sessionId}`;
  }

  private serializeMessage(m: ConsultationMessage) {
    return {
      id:          m.id,
      sessionId:   m.sessionId,
      senderId:    m.senderId,
      senderRole:  m.senderRole,
      messageType: m.messageType,
      content:     m.content,
      isRead:      m.isRead,
      createdAt:   m.createdAt,
    };
  }

}
