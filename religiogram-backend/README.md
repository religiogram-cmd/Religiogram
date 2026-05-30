# ReligioGram — Backend Architecture

Production-grade NestJS authentication service for a scalable Indian spiritual platform.
Phone + OTP authentication, JWT (RS256) with rotation, Cognito OIDC, Redis-backed session & rate limiting.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | **NestJS 10** (TypeScript, strict mode) |
| Database | **PostgreSQL 15** (AWS RDS Multi-AZ, Mumbai) |
| Cache / Session | **Redis 7** (ElastiCache) |
| Identity | **AWS Cognito** (OIDC issuer) |
| API Edge | **AWS API Gateway** (JWT validation) |
| SMS | **MSG91 / AWS SNS** (Mumbai region) |
| Token Format | **JWT RS256** (Access + Refresh with rotation) |
| Validation | **class-validator + class-transformer** |
| Rate Limit | **@nestjs/throttler** + custom Redis guards |

---

## 📁 Folder Structure

```
src/
├── main.ts                           # Bootstrap
├── app.module.ts                     # Root module
│
├── config/
│   ├── configuration.ts              # Typed env config
│   ├── database.config.ts
│   └── redis.config.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── controllers/
│   │   └── auth.controller.ts        # /auth/send-otp, /verify-otp, /refresh, /logout
│   ├── services/
│   │   ├── auth.service.ts           # Orchestrates OTP + token issuance
│   │   └── token.service.ts          # JWT sign, verify, rotate, revoke
│   ├── guards/
│   │   ├── jwt-auth.guard.ts         # Protects routes via access token
│   │   ├── jwt-refresh.guard.ts      # For refresh endpoint only
│   │   ├── roles.guard.ts            # Role-based access control
│   │   └── otp-throttle.guard.ts     # Phone + IP rate limiting
│   ├── strategies/
│   │   ├── jwt.strategy.ts
│   │   └── jwt-refresh.strategy.ts
│   ├── decorators/
│   │   ├── public.decorator.ts       # @Public() skip JWT guard
│   │   ├── roles.decorator.ts        # @Roles('admin')
│   │   └── current-user.decorator.ts # @CurrentUser() user
│   ├── dto/
│   │   ├── send-otp.dto.ts
│   │   ├── verify-otp.dto.ts
│   │   └── refresh-token.dto.ts
│   └── interfaces/
│       ├── jwt-payload.interface.ts
│       └── auth-response.interface.ts
│
├── otp/
│   ├── otp.module.ts
│   ├── otp.service.ts                # Generate, store, verify, expire
│   ├── sms-provider.service.ts       # MSG91 / SNS adapter
│   └── interfaces/
│       └── otp-record.interface.ts
│
├── users/
│   ├── users.module.ts
│   ├── users.service.ts              # findOrCreateByPhone, updateLastLogin
│   ├── users.controller.ts           # /users/me
│   ├── entities/
│   │   └── user.entity.ts            # TypeORM User model
│   └── dto/
│       └── update-user.dto.ts
│
├── redis/
│   ├── redis.module.ts
│   └── redis.service.ts              # Central Redis client wrapper
│
└── common/
    ├── filters/
    │   └── http-exception.filter.ts  # Unified error shape
    ├── interceptors/
    │   ├── logging.interceptor.ts
    │   └── transform.interceptor.ts  # { success, data, meta }
    ├── decorators/
    │   └── api-response.decorator.ts
    └── pipes/
        └── validation.pipe.ts
```

---

## 🔐 Auth Flow — End to End

```
┌─────────────┐    POST /auth/send-otp        ┌──────────────┐
│   Mobile    │ ────────────────────────────▶ │ API Gateway  │
│    App      │     { phone: "9876543210" }   │ (Zero Trust) │
└─────────────┘                               └──────┬───────┘
                                                     │
                                                     ▼
                         ┌──────────────────────────────────────┐
                         │   NestJS Auth Controller             │
                         │   • Rate limit check (Redis)         │
                         │   • Delegate to AuthService          │
                         └───────────────┬──────────────────────┘
                                         ▼
                         ┌──────────────────────────────────────┐
                         │   OtpService                         │
                         │   1. Generate 6-digit OTP            │
                         │   2. Hash with bcrypt                │
                         │   3. Redis SET otp:{phone} EX 300    │
                         │   4. Reset attempts counter          │
                         │   5. Send via MSG91/SNS              │
                         └──────────────────────────────────────┘
                                         │
                                         ▼
                              ┌────────────────────┐
                              │   SMS to user 📱   │
                              └────────────────────┘


┌─────────────┐    POST /auth/verify-otp      ┌──────────────┐
│   Mobile    │ ────────────────────────────▶ │  NestJS      │
│    App      │  { phone, otp, deviceId }     │              │
└─────────────┘                               └──────┬───────┘
                                                     ▼
                         ┌──────────────────────────────────────┐
                         │   AuthService.verifyOtp()            │
                         │   1. Check attempt count (max 5)     │
                         │   2. Fetch hash from Redis           │
                         │   3. bcrypt.compare(otp, hash)       │
                         │   4. If valid → DELETE key           │
                         │   5. findOrCreateByPhone()           │
                         │   6. TokenService.issueTokens()      │
                         └───────────────┬──────────────────────┘
                                         ▼
                         ┌──────────────────────────────────────┐
                         │   TokenService.issueTokens()         │
                         │   • Sign access token (RS256, 15m)   │
                         │   • Sign refresh token (7d)          │
                         │   • Store refresh hash in Redis      │
                         │     Key: refresh:{userId}:{jti}      │
                         │   • Log device & IP                  │
                         └──────────────────────────────────────┘
                                         │
                                         ▼
                              ┌────────────────────┐
                              │ { access, refresh,  │
                              │   user }            │
                              └────────────────────┘
```

---

## 🔑 Token Lifecycle

**Access Token** — 15 min TTL, RS256, stateless, verified at API Gateway.
**Refresh Token** — 7 days, one-time-use, rotated on every refresh, stored as bcrypt hash in Redis.
**Revocation** — `DEL refresh:{userId}:{jti}` invalidates instantly. Admin can nuke all sessions with `DEL refresh:{userId}:*`.
**Reuse Detection** — if a used refresh token is presented again, all that user's refresh tokens are nuked (token theft signal).

---

## 🚦 Rate Limiting Strategy

| Endpoint | Limit | Key |
|---|---|---|
| `POST /auth/send-otp` | 3 / 5 min | `rl:sendotp:phone:{phone}` |
| `POST /auth/send-otp` | 10 / hour | `rl:sendotp:ip:{ip}` |
| `POST /auth/verify-otp` | 5 attempts per OTP | `otp:attempts:{phone}` |
| Global (per IP) | 100 / min | `@nestjs/throttler` |

All counters stored in Redis with sliding-window TTL.

---

## 📊 Database Schema (PostgreSQL)

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           VARCHAR(15) UNIQUE NOT NULL,
  name            VARCHAR(100),
  email           VARCHAR(255) UNIQUE,
  role            VARCHAR(20) NOT NULL DEFAULT 'seeker',  -- 'seeker' | 'advisor' | 'admin'
  avatar_url      TEXT,
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  last_login_ip   INET,
  last_device_id  VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role  ON users(role);

CREATE TABLE auth_events (                       -- audit log (DPDP Act 2023 compliance)
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type   VARCHAR(40) NOT NULL,              -- OTP_SENT | LOGIN | LOGOUT | TOKEN_REFRESH | SUSPICIOUS
  phone        VARCHAR(15),
  ip_address   INET,
  user_agent   TEXT,
  device_id    VARCHAR(100),
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_events_user ON auth_events(user_id, created_at DESC);
```

---

## 🚀 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/send-otp` | ❌ Public | Generate + send OTP. Rate limited. |
| POST | `/auth/verify-otp` | ❌ Public | Verify OTP → issue tokens. |
| POST | `/auth/refresh` | 🔁 Refresh | Rotate refresh → issue new tokens. |
| POST | `/auth/logout` | 🔒 Access | Revoke current session. |
| POST | `/auth/logout-all` | 🔒 Access | Revoke all sessions for this user. |
| GET  | `/users/me` | 🔒 Access | Fetch current user profile. |
| PATCH | `/users/me` | 🔒 Access | Update profile (name, email, avatar). |

---

## 📦 Environment Variables (.env)

```bash
NODE_ENV=production
PORT=3000
APP_NAME=religiogram-api

# Database
DATABASE_URL=postgresql://app:***@rds-mumbai.xxx.rds.amazonaws.com:5432/religiogram
DATABASE_POOL_SIZE=20

# Redis
REDIS_HOST=religiogram.xxx.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=***
REDIS_TLS=true

# JWT (RS256 keys — stored in AWS Secrets Manager)
JWT_PRIVATE_KEY=***
JWT_PUBLIC_KEY=***
JWT_ISSUER=https://auth.religiogram.com
JWT_AUDIENCE=religiogram-api
JWT_ACCESS_TTL=900            # 15 minutes
JWT_REFRESH_TTL=604800        # 7 days

# AWS Cognito
COGNITO_USER_POOL_ID=ap-south-1_xxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxx
COGNITO_REGION=ap-south-1

# SMS
SMS_PROVIDER=msg91            # msg91 | sns
MSG91_AUTH_KEY=***
MSG91_SENDER_ID=RELGRM
MSG91_TEMPLATE_ID=***

# OTP
OTP_LENGTH=6
OTP_TTL=300                   # 5 minutes
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN=30        # seconds

# Rate limits
RL_SEND_OTP_PHONE=3           # per 5 min
RL_SEND_OTP_IP=10             # per hour
```

---

## 📝 Key Files (see source)

- `src/main.ts` — bootstrap
- `src/app.module.ts` — root module wiring
- `src/auth/controllers/auth.controller.ts` — REST endpoints
- `src/auth/services/auth.service.ts` — business logic orchestrator
- `src/auth/services/token.service.ts` — JWT sign / verify / rotate / revoke
- `src/otp/otp.service.ts` — OTP generate, store, verify with Redis
- `src/auth/guards/jwt-auth.guard.ts` — route protection
- `src/auth/strategies/jwt.strategy.ts` — passport-jwt setup
- `src/users/entities/user.entity.ts` — TypeORM entity
- `src/redis/redis.service.ts` — Redis client wrapper

---

## 🔒 Security Checklist

- [x] RS256 signing (asymmetric keys, rotatable)
- [x] Refresh token rotation with reuse detection
- [x] OTP hashed with bcrypt (never stored plaintext)
- [x] Rate limiting: per-phone + per-IP + global
- [x] Attempt counters with auto-expiry
- [x] Audit logging (DPDP Act 2023)
- [x] No password = no credential stuffing attack surface
- [x] Secrets from AWS Secrets Manager (never .env in prod)
- [x] TLS enforced at API Gateway + Redis
- [x] User enumeration protection (same response for new/existing users)
- [x] Input validation via class-validator on every DTO
- [x] CORS locked to app origins
- [x] Helmet security headers
