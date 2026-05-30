/**
 * Tests for components/auth/AuthScreen.tsx
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Module mocks ───────────────────────────────────────────────────────────────

const mockPush    = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter:       () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  usePathname:     jest.fn(() => '/'),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => {
  class ApiError extends Error {
    code: string; status: number; retryAfter?: number;
    constructor(code: string, message: string, status: number, retryAfter?: number) {
      super(message); this.name = 'ApiError'; this.code = code;
      this.status = status; this.retryAfter = retryAfter;
    }
  }
  return {
    ApiError,
    tokenStore: { set: jest.fn(), clear: jest.fn(), access: null, refresh: null },
    authApi: {
      sendOtp:    jest.fn(),
      emailLogin: jest.fn(),
      register:   jest.fn(),
      googleUrl:  jest.fn(() => 'https://api.example.com/auth/google'),
    },
  };
});

jest.mock('@/components/ui/RGLogo', () => ({
  RGLogo: () => <span data-testid="rg-logo" />,
}));

import AuthScreen from './AuthScreen';
import { authApi, tokenStore, ApiError } from '@/lib/api';

const sendOtpMock    = authApi.sendOtp    as jest.Mock;
const emailLoginMock = authApi.emailLogin as jest.Mock;
const registerMock   = authApi.register   as jest.Mock;

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderAuth(props: { onSuccess?: () => void } = {}) {
  return render(<AuthScreen {...props} />);
}

const VALID_PHONE = '9876543210';
const VALID_EMAIL = 'user@example.com';
const VALID_PASS  = 'password123';

const FAKE_AUTH_RESPONSE = {
  tokens: { accessToken: 'acc', refreshToken: 'ref' },
  isNewUser: false,
  user: { id: 'u1', role: 'seeker' },
};

/**
 * Both the email sub-tab and the submit <span> contain "Sign In".
 * Pick the one that belongs to the submit button (the <span>, last match).
 */
function getEmailSubmitBtn(): HTMLElement {
  // getAllByText returns [subTabButton, signInSpan]
  const matches = screen.getAllByText('Sign In');
  const span = matches.find(el => el.tagName === 'SPAN')!;
  return span.closest('button')!;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (authApi.googleUrl as jest.Mock).mockReturnValue('https://api.example.com/auth/google');
  });

  // ── Initial render ──────────────────────────────────────────────────────────

  it('renders with the Mobile OTP tab active by default', () => {
    renderAuth();
    expect(screen.getByText('Mobile OTP')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('10-digit mobile number')).toBeInTheDocument();
  });

  it('renders both tab buttons: Mobile OTP and Email', () => {
    renderAuth();
    expect(screen.getByText('Mobile OTP')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders the Send OTP button on the phone tab', () => {
    renderAuth();
    expect(screen.getByText('Send OTP')).toBeInTheDocument();
  });

  it('renders the RGLogo component', () => {
    renderAuth();
    expect(screen.getByTestId('rg-logo')).toBeInTheDocument();
  });

  it('shows the ReligioGram brand name', () => {
    renderAuth();
    expect(screen.getByText('ReligioGram')).toBeInTheDocument();
  });

  it('renders Terms and Privacy Policy links', () => {
    renderAuth();
    expect(screen.getByText('Terms')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  it('renders the Continue with Google link', () => {
    renderAuth();
    const link = screen.getByText(/Continue with Google/i).closest('a')!;
    expect(link).toHaveAttribute('href', 'https://api.example.com/auth/google');
  });

  it('renders DevPanel in non-production (NODE_ENV=test)', () => {
    renderAuth();
    expect(screen.getByText('Dev Testing')).toBeInTheDocument();
  });

  // ── Phone tab validation ────────────────────────────────────────────────────

  it('shows validation error when phone is empty and Send OTP clicked', async () => {
    renderAuth();
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() =>
      expect(screen.getByText(/valid 10-digit/i)).toBeInTheDocument(),
    );
    expect(sendOtpMock).not.toHaveBeenCalled();
  });

  it('shows validation error for a phone starting with digit 0', async () => {
    renderAuth();
    fireEvent.change(
      screen.getByPlaceholderText('10-digit mobile number'),
      { target: { value: '0123456789' } },
    );
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() =>
      expect(screen.getByText(/valid 10-digit/i)).toBeInTheDocument(),
    );
    expect(sendOtpMock).not.toHaveBeenCalled();
  });

  it('calls authApi.sendOtp with the phone number on valid submission', async () => {
    sendOtpMock.mockResolvedValueOnce({ message: 'sent', expiresIn: 60, resendAfter: 30 });
    renderAuth();
    fireEvent.change(
      screen.getByPlaceholderText('10-digit mobile number'),
      { target: { value: VALID_PHONE } },
    );
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() =>
      expect(sendOtpMock).toHaveBeenCalledWith(VALID_PHONE, expect.any(String)),
    );
  });

  it('navigates to /verify-otp after successful sendOtp', async () => {
    sendOtpMock.mockResolvedValueOnce({ message: 'sent', expiresIn: 60, resendAfter: 30 });
    renderAuth();
    fireEvent.change(
      screen.getByPlaceholderText('10-digit mobile number'),
      { target: { value: VALID_PHONE } },
    );
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/verify-otp')),
    );
  });

  it('shows an API error message when sendOtp rejects', async () => {
    sendOtpMock.mockRejectedValueOnce(new ApiError('RATE_LIMIT', 'Too many requests', 429));
    renderAuth();
    fireEvent.change(
      screen.getByPlaceholderText('10-digit mobile number'),
      { target: { value: VALID_PHONE } },
    );
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() =>
      expect(screen.getByText('Too many requests')).toBeInTheDocument(),
    );
  });

  // ── Email tab ───────────────────────────────────────────────────────────────

  it('switches to the email tab when the Email button is clicked', () => {
    renderAuth();
    fireEvent.click(screen.getByText('Email'));
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });

  it('shows Sign In and Sign Up sub-tabs in email mode', () => {
    renderAuth();
    fireEvent.click(screen.getByText('Email'));
    // Use getAllByText since both the sub-tab button and the submit button span say "Sign In"
    expect(screen.getAllByText('Sign In').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('shows password input when email tab is active', () => {
    renderAuth();
    fireEvent.click(screen.getByText('Email'));
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  });

  it('shows invalid-email error when a non-email address is submitted', async () => {
    renderAuth();
    fireEvent.click(screen.getByText('Email'));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'notanemail' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: VALID_PASS } });
    fireEvent.click(getEmailSubmitBtn());
    await waitFor(() =>
      expect(screen.getByText(/valid email/i)).toBeInTheDocument(),
    );
    expect(emailLoginMock).not.toHaveBeenCalled();
  });

  it('shows password-too-short error when password has fewer than 6 chars', async () => {
    renderAuth();
    fireEvent.click(screen.getByText('Email'));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: '123' } });
    fireEvent.click(getEmailSubmitBtn());
    await waitFor(() =>
      expect(screen.getByText(/at least 6/i)).toBeInTheDocument(),
    );
    expect(emailLoginMock).not.toHaveBeenCalled();
  });

  it('calls emailLogin on valid sign-in submission', async () => {
    emailLoginMock.mockResolvedValueOnce(FAKE_AUTH_RESPONSE);
    localStorage.setItem('rg_permissions_done', 'true');
    renderAuth();
    fireEvent.click(screen.getByText('Email'));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: VALID_PASS } });
    fireEvent.click(getEmailSubmitBtn());
    await waitFor(() =>
      expect(emailLoginMock).toHaveBeenCalledWith(VALID_EMAIL, VALID_PASS),
    );
  });

  it('calls register (not emailLogin) when in Sign Up mode', async () => {
    registerMock.mockResolvedValueOnce({ ...FAKE_AUTH_RESPONSE, isNewUser: true });
    localStorage.setItem('rg_permissions_done', 'true');
    renderAuth();
    fireEvent.click(screen.getByText('Email'));
    fireEvent.click(screen.getByText('Sign Up'));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByPlaceholderText('Create a password (min. 6 chars)'), { target: { value: VALID_PASS } });
    fireEvent.click(screen.getByText('Create Account').closest('button')!);
    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith(VALID_EMAIL, VALID_PASS),
    );
    expect(emailLoginMock).not.toHaveBeenCalled();
  });

  it('calls onSuccess prop (instead of routing) after successful email sign-in', async () => {
    const onSuccess = jest.fn();
    emailLoginMock.mockResolvedValueOnce(FAKE_AUTH_RESPONSE);
    renderAuth({ onSuccess });
    fireEvent.click(screen.getByText('Email'));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: VALID_PASS } });
    fireEvent.click(getEmailSubmitBtn());
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows API error message when emailLogin rejects', async () => {
    emailLoginMock.mockRejectedValueOnce(new ApiError('INVALID_CREDS', 'Invalid email or password', 401));
    renderAuth();
    fireEvent.click(screen.getByText('Email'));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: VALID_PASS } });
    fireEvent.click(getEmailSubmitBtn());
    await waitFor(() =>
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument(),
    );
  });
});
