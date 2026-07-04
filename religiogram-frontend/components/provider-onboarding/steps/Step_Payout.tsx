'use client';

/**
 * Step — Payout Setup (final step, shared across all flows).
 *
 * Tab toggle: "UPI" (default, faster/recommended) | "Bank Account".
 *
 *   UPI tab → single field (UPI ID like name@bank).
 *   Bank tab → account number x2 (must match), IFSC, optional bank/beneficiary.
 *
 * Flow on Continue:
 *   1. POST /provider/onboarding/:id/bank      → returns `masked`
 *   2. POST /provider/onboarding/:id/submit    → flips state → pending_review
 *   3. router.push('/provider-onboarding/submitted')
 *
 * The masked result is shown inline as confirmation BEFORE we navigate, so
 * the user sees what got saved if /submit fails (e.g. missing PAN).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import SkipVerificationButton from '@/components/provider-onboarding/SkipVerificationButton';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';
import type { FlowConfig } from './FlowConfig';

type Method = 'upi' | 'bank';

const UPI_REGEX = /^[\w.\-]+@[\w]+$/;

interface Props {
  flow: FlowConfig;
  /** Callback returning a redirect path if prerequisites are missing. */
  gateCheck: (data: Record<string, any>) => string | null;
}

export default function Step_Payout({ flow, gateCheck }: Props) {
  const router = useRouter();
  const { data, update, flush } = useProviderOnboarding();

  const [method, setMethod] = useState<Method>('upi');

  const [upiId, setUpiId] = useState('');

  const [accountNumber, setAccountNumber] = useState('');
  const [accountNumberConfirm, setAccountNumberConfirm] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');

  const [savedMasked, setSavedMasked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const target = gateCheck(data);
    if (target) router.replace(target);
  }, [data, router, gateCheck]);

  useEffect(() => {
    let cancelled = false;
    providerOnboardingApi.getDraft().then((d) => {
      if (cancelled) return;
      const st = d.providerStatus;
      if (st === 'pending_review' || st === 'approved' || st === 'rejected') {
        router.replace('/provider-status');
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [router]);

  const upiValid = UPI_REGEX.test(upiId.trim());

  const ifscValid =
    ifscCode.length === 11 && /^[A-Z0-9]+$/.test(ifscCode);
  const acctValid =
    /^[0-9]{8,20}$/.test(accountNumber) &&
    accountNumber === accountNumberConfirm;
  const bankValid = ifscValid && acctValid;

  const canContinue =
    !submitting && (method === 'upi' ? upiValid : bankValid);

  const onContinue = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      const body =
        method === 'upi'
          ? { upiId: upiId.trim() }
          : {
              accountNumber: accountNumber.trim(),
              ifscCode: ifscCode.trim().toUpperCase(),
              ...(bankName.trim() ? { bankName: bankName.trim() } : {}),
              ...(beneficiaryName.trim()
                ? { beneficiaryName: beneficiaryName.trim() }
                : {}),
            };

      const saved = await providerOnboardingApi.saveBank(body);
      setSavedMasked(saved.masked ?? null);
      update({ payoutMethod: method, payoutMasked: saved.masked ?? undefined });
      await flush();

      await providerOnboardingApi.submit();
      router.push('/provider-onboarding/submitted');
    } catch (e: any) {
      setErr(
        e?.message ??
          'Could not save your payout details. Please check and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WizardShell
      currentStep={flow.currentStep}
      totalSteps={flow.totalSteps}
      stepLabels={flow.stepLabels}
      routeBase={flow.routeBase}
      banner={flow.banner}
      canContinue={canContinue}
      onContinue={onContinue}
      nextLabel={submitting ? 'Submitting…' : 'Submit for review'}
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-[#F6F7FA]/40 border border-[#0F2452]/15 p-4 text-sm text-gray-700/90 space-y-2">
          <p className="font-semibold text-gray-700">How should we pay you?</p>
          <p>
            We send your earnings every week. Pick UPI for instant settlement,
            or add a bank account for direct NEFT/IMPS transfers.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Payout method"
          className="grid grid-cols-2 gap-2 p-1 bg-[#0F2452]/5 rounded-xl"
        >
          <button
            type="button"
            role="tab"
            aria-selected={method === 'upi'}
            onClick={() => {
              setMethod('upi');
              setErr(null);
            }}
            className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
              method === 'upi'
                ? 'bg-white shadow-sm text-[#0F2452]'
                : 'text-gray-700/70'
            }`}
          >
            UPI
            <span className="ml-1 text-[10px] font-medium text-[#C8920A]">
              · Recommended
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={method === 'bank'}
            onClick={() => {
              setMethod('bank');
              setErr(null);
            }}
            className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
              method === 'bank'
                ? 'bg-white shadow-sm text-[#0F2452]'
                : 'text-gray-700/70'
            }`}
          >
            Bank Account
          </button>
        </div>

        {method === 'upi' && (
          <div className="rounded-2xl border border-[#0F2452]/15 bg-white p-4 space-y-3">
            <div className="text-xs text-green-800/90 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Faster — most UPI payouts land within minutes.
            </div>
            <Field label="UPI ID" hint="Example: yourname@okhdfcbank">
              <input
                type="text"
                inputMode="email"
                autoComplete="off"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value.trim())}
                placeholder="yourname@bank"
                className="w-full px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white
                           text-[#0F2452] placeholder:text-gray-400
                           focus:outline-none focus:ring-2 focus:ring-[#C8920A]/50"
              />
              {upiId && !upiValid && (
                <p className="text-xs text-red-700 mt-1">
                  Please enter a valid UPI ID (e.g. name@bank).
                </p>
              )}
            </Field>
          </div>
        )}

        {method === 'bank' && (
          <div className="rounded-2xl border border-[#0F2452]/15 bg-white p-4 space-y-4">
            <Field label="Account Number">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={accountNumber}
                onChange={(e) =>
                  setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 20))
                }
                placeholder="8–20 digits"
                className="w-full px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white
                           text-[#0F2452] placeholder:text-gray-400 tracking-wider
                           focus:outline-none focus:ring-2 focus:ring-[#C8920A]/50"
              />
            </Field>

            <Field label="Re-enter Account Number">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={accountNumberConfirm}
                onChange={(e) =>
                  setAccountNumberConfirm(
                    e.target.value.replace(/\D/g, '').slice(0, 20),
                  )
                }
                placeholder="Confirm by typing again"
                className="w-full px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white
                           text-[#0F2452] placeholder:text-gray-400 tracking-wider
                           focus:outline-none focus:ring-2 focus:ring-[#C8920A]/50"
              />
              {accountNumberConfirm &&
                accountNumber !== accountNumberConfirm && (
                  <p className="text-xs text-red-700 mt-1">
                    Account numbers do not match.
                  </p>
                )}
            </Field>

            <Field label="IFSC Code" hint="11 characters, e.g. HDFC0001234">
              <input
                type="text"
                autoComplete="off"
                value={ifscCode}
                onChange={(e) =>
                  setIfscCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 11),
                  )
                }
                placeholder="HDFC0001234"
                className="w-full px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white
                           text-[#0F2452] placeholder:text-gray-400 uppercase tracking-wider
                           focus:outline-none focus:ring-2 focus:ring-[#C8920A]/50"
              />
              {ifscCode && !ifscValid && (
                <p className="text-xs text-red-700 mt-1">
                  IFSC must be 11 uppercase letters/digits.
                </p>
              )}
            </Field>

            <Field label="Bank Name (optional)">
              <input
                type="text"
                autoComplete="off"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="HDFC Bank"
                className="w-full px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white
                           text-[#0F2452] placeholder:text-gray-400
                           focus:outline-none focus:ring-2 focus:ring-[#C8920A]/50"
              />
            </Field>

            <Field label="Beneficiary Name (optional)" hint="Name as on the bank account">
              <input
                type="text"
                autoComplete="off"
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="Full name"
                className="w-full px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white
                           text-[#0F2452] placeholder:text-gray-400
                           focus:outline-none focus:ring-2 focus:ring-[#C8920A]/50"
              />
            </Field>
          </div>
        )}

        {savedMasked && (
          <div className="rounded-xl bg-[#C8920A]/10 border border-[#C8920A]/30 px-4 py-3 text-sm text-[#0F2452]">
            Saved as <span className="font-semibold">{savedMasked}</span>
          </div>
        )}

        {err && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {err}
          </div>
        )}

        <p className="text-xs text-gray-700/60 text-center pt-1">
          By submitting, you confirm the details above are correct and accept
          our Provider Terms.
        </p>

        <SkipVerificationButton from="payout" />
      </div>
    </WizardShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-[#0F2452] mb-1">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-xs text-gray-700/60 mt-1">{hint}</span>
      )}
    </label>
  );
}
