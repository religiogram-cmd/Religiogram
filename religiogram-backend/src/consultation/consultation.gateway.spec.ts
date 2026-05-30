import { WsException } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConsultationGateway } from './consultation.gateway';
import { MessageType } from './entities/consultation-message.entity';

// ── helpers ───────────────────────────────────────────────────────────────────

const USER_ID     = 'user-abc';
const PROVIDER_ID = 'prov-xyz';
const SESSION_ID  = 'sess-001';

function makeGateway(overrides: Partial<{
  dsQuery: jest.Mock;
  jwtVerify: jest.Mock;
}> = {}): ConsultationGateway {
  const msgQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const msgRepo: any = {
    createQueryBuilder: jest.fn().mockReturnValue(msgQb),
  };

  const sessRepo: any = {};

  const dsQuery = overrides.dsQuery ?? jest.fn().mockResolvedValue([]);
  const ds: any = {
    query: dsQuery,
  };

  const jwtVerify = overrides.jwtVerify ?? jest.fn().mockReturnValue({
    sub:  USER_ID,
    role: 'user',
    jti:  'jti-1',
    type: 'access',
    exp:  Math.floor(Date.now() / 1000) + 3600,
  });

  const jwt: any = { verify: jwtVerify };

  const config: any = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'jwt.publicKey') return 'fake-key';
      if (key === 'redis.host') return 'localhost';
      return 'default';
    }),
    get: jest.fn().mockReturnValue(undefined),
  };

  const gw = new ConsultationGateway(msgRepo, sessRepo, ds, jwt, config);

  // Inject a mock Socket.IO server
  (gw as any).server = {
    to:   jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  return gw;
}

function fakeSocket(data: Record<string, any> = {}): any {
  return {
    id:         'socket-1',
    handshake:  { auth: { token: 'valid-token' } },
    data,
    rooms:      new Set(['socket-1']),
    emit:       jest.fn(),
    disconnect: jest.fn(),
    join:       jest.fn().mockResolvedValue(undefined),
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ConsultationGateway', () => {
  let gw: ConsultationGateway;

  beforeEach(() => {
    gw = makeGateway();
  });

  // ── handleConnection ─────────────────────────────────────────────────────

  describe('handleConnection()', () => {
    it('attaches userId, role, jti, exp to socket.data on valid token', async () => {
      const socket = fakeSocket();
      await gw.handleConnection(socket);
      expect(socket.data.userId).toBe(USER_ID);
      expect(socket.data.role).toBe('user');
      expect(socket.data.jti).toBe('jti-1');
      expect(typeof socket.data.exp).toBe('number');
    });

    it('disconnects when no token is provided', async () => {
      const socket = fakeSocket();
      socket.handshake.auth = {};
      await gw.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('emits exception with "no token" message when token is absent', async () => {
      const socket = fakeSocket();
      socket.handshake.auth = {};
      await gw.handleConnection(socket);
      expect(socket.emit).toHaveBeenCalledWith(
        'exception',
        expect.objectContaining({ message: expect.stringContaining('no token') }),
      );
    });

    it('disconnects when JWT verification fails', async () => {
      const socket = fakeSocket();
      const gw2 = makeGateway({
        jwtVerify: jest.fn().mockImplementation(() => { throw new Error('bad sig'); }),
      });
      await gw2.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects when token type is not "access"', async () => {
      const socket = fakeSocket();
      const gw2 = makeGateway({
        jwtVerify: jest.fn().mockReturnValue({ sub: 'u', role: 'user', jti: 'j', type: 'refresh', exp: 9999999999 }),
      });
      await gw2.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  // ── handleDisconnect ──────────────────────────────────────────────────────

  describe('handleDisconnect()', () => {
    it('does not throw', () => {
      const socket = fakeSocket({ userId: USER_ID });
      expect(() => gw.handleDisconnect(socket)).not.toThrow();
    });

    it('handles socket with no data gracefully', () => {
      const socket = fakeSocket();
      socket.data = undefined;
      expect(() => gw.handleDisconnect(socket)).not.toThrow();
    });
  });

  // ── handleJoinSession ─────────────────────────────────────────────────────

  describe('handleJoinSession()', () => {
    it('throws WsException when sessionId is absent', async () => {
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      await expect(
        gw.handleJoinSession(socket, { sessionId: '' }),
      ).rejects.toThrow(WsException);
    });

    it('joins the session room on success', async () => {
      const dsQuery = jest.fn().mockResolvedValue([{ user_id: USER_ID, provider_id: PROVIDER_ID }]);
      const gw2 = makeGateway({ dsQuery });
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      await gw2.handleJoinSession(socket, { sessionId: SESSION_ID });
      expect(socket.join).toHaveBeenCalledWith(`session_${SESSION_ID}`);
    });

    it('emits session.joined after joining', async () => {
      const dsQuery = jest.fn().mockResolvedValue([{ user_id: USER_ID, provider_id: PROVIDER_ID }]);
      const gw2 = makeGateway({ dsQuery });
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      await gw2.handleJoinSession(socket, { sessionId: SESSION_ID });
      expect(socket.emit).toHaveBeenCalledWith('session.joined', { sessionId: SESSION_ID });
    });

    it('throws WsException when session not found in DB', async () => {
      const dsQuery = jest.fn().mockResolvedValue([]); // no rows
      const gw2 = makeGateway({ dsQuery });
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      await expect(
        gw2.handleJoinSession(socket, { sessionId: SESSION_ID }),
      ).rejects.toThrow(WsException);
    });

    it('throws WsException when user is not a participant', async () => {
      const dsQuery = jest.fn().mockResolvedValue([{ user_id: 'other-user', provider_id: 'other-prov' }]);
      const gw2 = makeGateway({ dsQuery });
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      await expect(
        gw2.handleJoinSession(socket, { sessionId: SESSION_ID }),
      ).rejects.toThrow(WsException);
    });

    it('disconnects and returns when token is expired', async () => {
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) - 1, // expired
      });

      const result = await gw.handleJoinSession(socket, { sessionId: SESSION_ID });
      expect(result).toBeUndefined();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  // ── handleSendMessage ─────────────────────────────────────────────────────

  describe('handleSendMessage()', () => {
    it('throws WsException when sessionId is absent', async () => {
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      await expect(
        gw.handleSendMessage(socket, { sessionId: '', content: 'hello', messageType: MessageType.TEXT }),
      ).rejects.toThrow(WsException);
    });

    it('throws WsException when content is empty', async () => {
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      await expect(
        gw.handleSendMessage(socket, { sessionId: SESSION_ID, content: '   ', messageType: MessageType.TEXT }),
      ).rejects.toThrow(WsException);
    });

    it('throws WsException when content exceeds 4000 chars', async () => {
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      await expect(
        gw.handleSendMessage(socket, {
          sessionId: SESSION_ID,
          content: 'x'.repeat(4001),
          messageType: MessageType.TEXT,
        }),
      ).rejects.toThrow(WsException);
    });
  });

  // ── handleGetHistory ──────────────────────────────────────────────────────

  describe('handleGetHistory()', () => {
    it('throws WsException when sessionId is absent', async () => {
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      await expect(
        gw.handleGetHistory(socket, { sessionId: '' }),
      ).rejects.toThrow(WsException);
    });
  });

  // ── handleTyping ──────────────────────────────────────────────────────────

  describe('handleTyping()', () => {
    it('does not emit when payload has no sessionId', async () => {
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      await gw.handleTyping(socket, {} as any);
      expect((gw as any).server.to).not.toHaveBeenCalled();
    });

    it('does not emit when client not in the session room', async () => {
      const socket = fakeSocket({
        userId: USER_ID, role: 'user', jti: 'j',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      // socket.rooms only contains 'socket-1', not 'session_...'
      await gw.handleTyping(socket, { sessionId: SESSION_ID });
      expect((gw as any).server.to).not.toHaveBeenCalled();
    });
  });
});
