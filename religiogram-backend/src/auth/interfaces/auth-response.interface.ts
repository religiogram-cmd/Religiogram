import { UserRole } from './jwt-payload.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;   // seconds
  refreshTokenExpiresIn: number;
  tokenType: 'Bearer';
}

export interface PublicUser {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  role: UserRole;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface AuthResponse {
  user: PublicUser;
  tokens: TokenPair;
  isNewUser: boolean;
}
