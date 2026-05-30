/**
 * Tests for components/auth/VerifyOtpScreen.tsx
 *
 * authApi / tokenStore are mocked via jest.mock factory (all jest.fn() inline).
 * useSearchParams is overridden to return a URLSearchParams with a phone param.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Module mocks ───────────────────────────────────────────────────────────────

const mockPush    = jest.fn();
const mockReplace = jest.fn();
const mockBack    = jest.fn();

// Module-level URLSearchParams instance — mutated per test
const mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter:       () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  usePathname:     jest.fn(() => '/verify-otp'),
  useSearchParams: () => mockSearchParams,
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
      verifyOtp: jest.fn(),
      sendOtp:   jest.fn(),
    },
  };
});

import VerifyOtpScreen from './VerifyOtpScreen';
import { authApi, tokenStore, ApiError } from '@/lib/api';

const verifyOtpMock = authApi.verifyOtp as jest.Mock;
const sendOtpMock   = authApi.sendOtp   as jest.Mock;
const tokenSetMock  = tokenStore.set    as jest.Mock;

// ── Helpers ────────────────────────────────────────────────────────────────────

const TEST_PHONE = '9876543210';

function renderVerify(phone = TEST_PHONE) {
  mockSearchParams.set('phone', phone);
  return render(<VerifyOtpScreen />);
}

function fillDigits(code: string) {
  const inputs = screen.getAllByRole('textbox');
  code.split('').forEach((d, i) => {
    fireEvent.change(inputs[i], { target: { value: d } });
  });
}

const GOOD_RESPONSE = {
  tokens: { accessToken: 'acc', refreshToken: 'ref' },
  isNewUser: false,
  user: { id: 'u1', role: 'seeker' },
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('VerifyOtpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders 6 OTP input boxes', () => {
    renderVerify();
    expect(screen.getAllByRole('textbox')).toHaveLength(6);
  });

  it('labels each input "OTP digit N"', () => {
    renderVerify();
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`OTP digit ${i}`)).toBeInTheDocument();
    }
  });

  it('displays the formatted phone number (+91 XXXXX XXXXX)', () => {
    renderVerify('9876543210');
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
  });

  it('renders the "Verify & Continue" button', () => {
    renderVerify();
    expect(screen.getByText('Verify & Continue')).toBeInTheDocument();
  });

  it('renders the resend section', () => {
    renderVerify();
    expect(screen.getByText(/Didn.*t receive/i)).toBeInTheDocument();
  });

  // ── Button disabled state ────────────────────────────────────────────────────

  it('Verify button is disabled when fewer than 6 digits are entered', () => {
    renderVerify();
    const btn = screen.getByText('Verify & Continue').closest('button')!;
    expect(btn).toBeDisabled();
  });

  it('Verify button remains disabled when only 5 of 6 digits are filled', () => {
    renderVerify();
    fillDigits('12345'); // one short
    const btn = screen.getByText('Verify & Continue').closest('button')!;
    expect(btn).toBeDisabled();
  });

  // ── Auto-verify ─────────────────────────────────────────────────────────────

  it('auto-calls verifyOtp when all 6 digits are entered', async () => {
    verifyOtpMock.mockResolvedValueOnce(GOOD_RESPONSE);
    renderVerify();
    fillDigits('123456');
    await waitFor(() =>
      expect(verifyOtpMock).toHaveBeenCalledWith(TEST_PHONE, '123456', expect.any(String)),
    );
  });

  it('routes to /home for a returning user on success', async () => {
    verifyOtpMock.mockResolvedValueOnce({ ...GOOD_RESPONSE, isNewUser: false });
    renderVerify();
    fillDigits('123456');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
  });

  it('routes to /profile-setup for a new user on success', async () => {
    verifyOtpMock.mockResolvedValueOnce({ ...GOOD_RESPONSE, isNewUser: true });
    renderVerify();
    fillDigits('654321');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/profile-setup'));
  });

  it('stores access + refresh tokens after success', async () => {
    verifyOtpMock.mockResolvedValueOnce(GOOD_RESPONSE);
    renderVerify();
    fillDigits('123456');
    await waitFor(() => expect(tokenSetMock).toHaveBeenCalledWith('acc', 'ref'));
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('shows error alert when verifyOtp rejects with ApiError', async () => {
    verifyOtpMock.mockRejectedValueOnce(new ApiError('INVALID_OTP', 'Invalid OTP', 400));
    renderVerify();
    fillDigits('000000');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid OTP'),
    );
  });

  it('clears all digit inputs after a failed verification', async () => {
    verifyOtpMock.mockRejectedValueOnce(new ApiError('INVALID_OTP', 'Invalid OTP', 400));
    renderVerify();
    fillDigits('000000');
    await waitFor(() => screen.getByRole('alert'));
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    inputs.forEach((inp) => expect(inp.value).toBe(''));
  });

  it('shows generic error for non-ApiError rejections', async () => {
    verifyOtpMock.mockRejectedValueOnce(new Error('network down'));
    renderVerify();
    fillDigits('111111');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i),
    );
  });

  // ── Paste ────────────────────────────────────────────────────────────────────

  it('fills all 6 boxes when a 6-digit code is pasted into the first input', () => {
    verifyOtpMock.mockReturnValue(new Promise(() => {}));
    renderVerify();
    const firstInput = screen.getAllByRole('textbox')[0];
    fireEvent.paste(firstInput, {
      clipboardData: { getData: () => '987654' },
    });
    const values = (screen.getAllByRole('textbox') as HTMLInputElement[]).map((i) => i.value);
    expect(values.join('')).toBe('987654');
  });

  // ── Resend cooldown ──────────────────────────────────────────────────────────

  it('shows "Resend in Xs" during the initial 30s cooldown', () => {
    renderVerify();
    expect(screen.getByText(/Resend in \d+s/)).toBeInTheDocument();
  });

  it('shows "Resend OTP" button after the 30s cooldown expires', async () => {
    renderVerify();
    act(() => { jest.advanceTimersByTime(31_000); });
    await waitFor(() =>
      expect(screen.getByText('Resend OTP')).toBeInTheDocument(),
    );
  });

  it('calls authApi.sendOtp when Resend OTP is clicked after cooldown', async () => {
    sendOtpMock.mockResolvedValueOnce({ message: 'sent', expiresIn: 60, resendAfter: 30 });
    renderVerify();
    act(() => { jest.advanceTimersByTime(31_000); });
    await waitFor(() => screen.getByText('Resend OTP'));
    fireEvent.click(screen.getByText('Resend OTP'));
    await waitFor(() =>
      expect(sendOtpMock).toHaveBeenCalledWith(TEST_PHONE, expect.any(String)),
    );
  });

  // ── Back button ──────────────────────────────────────────────────────────────

  it('calls router.back() when the back arrow button is clicked', () => {
    renderVerify();
    fireEvent.click(screen.getByLabelText('Go back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
