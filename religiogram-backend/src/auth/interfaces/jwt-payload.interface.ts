export type UserRole = 'seeker' | 'advisor' | 'admin';

export interface JwtPayload {
  sub: string;           // user id (UUID)
  phone: string;
  role: UserRole;
  type: 'access' | 'refresh';
  jti: string;           // unique token ID — used for revocation
  deviceId?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface AuthenticatedUser {
  id: string;
  phone: string;
  role: UserRole;
  jti: string;
  deviceId?: string;
}
