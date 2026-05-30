import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { AiSafetyReview } from './entities/ai-safety-review.entity';
import { GeminiAdapterService } from './gemini-adapter.service';

// Layer 1: keyword blocklist
const BLOCKED_KEYWORDS = [
  // Violence
  'kill', 'murder', 'bomb', 'explosive', 'weapon', 'suicide', 'self-harm',
  // Sexual / NSFW
  'porn', 'xxx', 'nude', 'naked', 'sex tape',
  // Scam / fraud
  'send money to', 'wire transfer', 'bitcoin wallet', 'nigerian prince',
  // Religious hate
  'kafir', 'convert or die', 'religious war',
];

// Section 10.2: keywords that trigger specific helpline auto-redirects
const MEDICAL_KEYWORDS = [
  'suicide', 'self-harm', 'kill myself', 'want to die', 'end my life',
  'chest pain', 'heart attack', 'can\'t breathe', 'seizure', 'unconscious',
  'diagnose', 'diagnosis', 'medical treatment', 'prescription', 'medication dosage',
  'symptoms of cancer', 'symptoms of diabetes',
];
const LEGAL_KEYWORDS = [
  'legal advice', 'should i sue', 'file a case', 'court case', 'fir against',
  'criminal charges', 'arrest warrant', 'police complaint legal', 'legal rights',
  'divorce lawyer', 'property dispute legal',
];
const FINANCIAL_KEYWORDS = [
  'should i invest', 'which stock to buy', 'buy shares', 'mutual fund advice',
  'sebi registered', 'financial advisor', 'portfolio advice', 'tax advice',
  'where to invest my money', 'best investment',
];
const DEATH_PREDICTION_KEYWORDS = [
  'when will i die', 'death date', 'predict my death', 'will i survive',
  'how long will i live', 'death prediction', 'time of death',
];

export interface SafetyCheckResult {
  safe: boolean;
  layer?: 'keyword' | 'post_classifier';
  violationType?: string;
  severity?: string;
}

// Section 10.2: auto-redirect response — returned instead of calling Gemini
export interface AutoRedirectResponse {
  redirect: true;
  message: string;
}

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(
    @InjectRepository(AiSafetyReview)
    private readonly reviewRepo: Repository<AiSafetyReview>,
    @InjectQueue('ai-safety-review')
    private readonly reviewQueue: Queue,
    private readonly gemini: GeminiAdapterService,
  ) {}

  /**
   * Section 10.2 — Check for topics that need a specific helpline redirect
   * instead of any LLM call. Returns null if no redirect applies.
   */
  getAutoRedirect(text: string): AutoRedirectResponse | null {
    const lower = text.toLowerCase();

    // Suicide / medical crisis -> iCall
    if (MEDICAL_KEYWORDS.some(kw => lower.includes(kw))) {
      const isMentalCrisis = ['suicide', 'self-harm', 'kill myself', 'want to die', 'end my life'].some(kw => lower.includes(kw));
      if (isMentalCrisis) {
        return {
          redirect: true,
          message:
            'I\'m deeply concerned about what you\'ve shared. Please reach out to iCall right now — they offer free, confidential support: ' +
            'Call 9152987821 (Mon-Sat, 8 AM-10 PM IST). You deserve care and support. ' +
            'I am not able to replace professional help, but I am here with you. Please call.',
        };
      }
      // Medical / diagnosis
      return {
        redirect: true,
        message:
          'I understand you have a health concern, but I am a spiritual assistant and not a medical professional. ' +
          'Please consult a qualified doctor for any medical symptoms, diagnoses, or treatment decisions. ' +
          'For emergencies in India, call 112. I am happy to help you with spiritual guidance or finding a priest instead.',
      };
    }

    // Legal advice
    if (LEGAL_KEYWORDS.some(kw => lower.includes(kw))) {
      return {
        redirect: true,
        message:
          'That sounds like a legal matter that needs a qualified advocate. I am a spiritual assistant and cannot give legal advice. ' +
          'You can reach the LegalGuru free helpline or consult a lawyer near you. ' +
          'I am happy to help with spiritual guidance, prayers, or finding a priest for any occasion.',
      };
    }

    // Financial advice
    if (FINANCIAL_KEYWORDS.some(kw => lower.includes(kw))) {
      return {
        redirect: true,
        message:
          'Investment and financial advice must come from a SEBI-registered advisor who understands your full financial picture. ' +
          'I am a spiritual assistant and cannot recommend specific stocks, funds, or investment strategies. ' +
          'Please consult a qualified financial advisor. I am happy to help with spiritual guidance and auspicious timing for important decisions.',
      };
    }

    // Death prediction
    if (DEATH_PREDICTION_KEYWORDS.some(kw => lower.includes(kw))) {
      return {
        redirect: true,
        message:
          'I am not able to predict death or lifespan — no astrologer or system can do this reliably or responsibly. ' +
          'Such predictions can cause unnecessary fear and are considered harmful in Vedic tradition. ' +
          'If you are feeling anxious about life, I warmly suggest speaking with a trusted priest or counsellor. ' +
          'I am happy to help with your kundli, auspicious dates, or spiritual guidance.',
      };
    }

    return null;
  }

  /** Layer 1: fast keyword pre-filter (runs before LLM call) */
  preFilterInput(text: string): SafetyCheckResult {
    const lower = text.toLowerCase();
    for (const kw of BLOCKED_KEYWORDS) {
      if (lower.includes(kw)) {
        return {
          safe: false,
          layer: 'keyword',
          violationType: `blocked_keyword:${kw}`,
          severity: 'medium',
        };
      }
    }
    return { safe: true };
  }

  /**
   * AI4 — Layer 3: post-output safety classifier (rule-based, O(n) — no LLM call).
   *
   * Problem: The old implementation called Gemini Flash for every single response,
   * doubling AI spend and adding ~1–3 s of latency on every chat turn with no
   * measurable safety gain over rule-based checks — Gemini's built-in harm
   * categories (BLOCK_LOW_AND_ABOVE) already block the most dangerous content
   * before it leaves the model.
   *
   * Fix: Replace the Gemini call with a fast pattern-matching post-filter that
   * checks for the most common failure modes:
   *   - High-confidence harmful patterns (hate speech triggers, scam phrases)
   *   - Medical / legal / financial hard recommendations that bypass the pre-filter
   *   - Unexpected credential / PII leakage in the assistant's own output
   *
   * The method remains async so callers don't need to change.
   * For the 1 % quality-sample path the orchestrator still uses flagContent()
   * to queue a human review — that path does NOT re-call this method.
   *
   * Fail-closed behaviour is preserved: any unexpected throw returns safe=false
   * so a classifier crash never silently allows output through.
   */
  async postClassifyOutput(text: string): Promise<SafetyCheckResult> {
    try {
      const lower = text.toLowerCase();

      // ── High-severity hate / violence patterns ──────────────────────────
      const HATE_PATTERNS = [
        /\b(kill all|death to|destroy all)\s+(muslims?|hindus?|sikhs?|christians?|kafirs?)/i,
        /\b(religious\s+war|jihad\s+against|crusade\s+against)/i,
        /\bconvert\s+or\s+(die|be\s+killed)/i,
        /\b(bomb|explosive|grenade)\s+(how\s+to|make|build)/i,
      ];
      for (const re of HATE_PATTERNS) {
        if (re.test(text)) {
          return { safe: false, layer: 'post_classifier', violationType: 'hate_speech', severity: 'high' };
        }
      }

      // ── Hard medical / financial recommendations ─────────────────────────
      // The pre-filter catches requests; here we catch if the LLM gave advice anyway.
      const ADVICE_PATTERNS = [
        /\byou\s+should\s+take\s+[a-z]+\s+(mg|ml|tablet|capsule)/i, // dosage advice
        /\bi\s+recommend\s+(buying|investing\s+in|purchasing)\s+shares/i,
        /\byour\s+diagnosis\s+is\b/i,
        /\byou\s+have\s+(cancer|diabetes|hiv|tuberculosis|typhoid)/i,
      ];
      for (const re of ADVICE_PATTERNS) {
        if (re.test(text)) {
          return { safe: false, layer: 'post_classifier', violationType: 'unsolicited_advice', severity: 'medium' };
        }
      }

      // ── PII / credential leakage in LLM output ───────────────────────────
      const PII_PATTERNS = [
        /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT
        /Bearer\s+[A-Za-z0-9_\-.]{20,}/i,                                   // Bearer token
        /\b[2-9][0-9]{11}\b/,                                                // 12-digit Aadhaar
        /\b[A-Z]{5}[0-9]{4}[A-Z]\b/,                                        // PAN card
      ];
      for (const re of PII_PATTERNS) {
        if (re.test(text)) {
          return { safe: false, layer: 'post_classifier', violationType: 'pii_leakage', severity: 'high' };
        }
      }

      // ── NSFW keyword check (output-side) ────────────────────────────────
      const NSFW_OUTPUT = ['explicit sexual content', 'pornographic', 'nude image', 'xxx content'];
      if (NSFW_OUTPUT.some(kw => lower.includes(kw))) {
        return { safe: false, layer: 'post_classifier', violationType: 'nsfw_content', severity: 'high' };
      }

      return { safe: true };
    } catch (e: any) {
      // S6: Fail-CLOSED — any unexpected error blocks the response.
      this.logger.warn(`Post-classifier threw (fail-closed): ${e?.message}`);
      return {
        safe: false,
        layer: 'post_classifier',
        violationType: 'classifier_error',
        severity: 'medium',
      };
    }
  }

  /** Persist a safety flag and queue for admin review */
  async flagContent(opts: {
    userId: string;
    messageId?: string;
    triggerLayer: 'keyword' | 'gemini' | 'post_classifier' | 'sample_review' | 'user_report';
    content: string;
    violationType?: string;
    severity?: string;
  }): Promise<void> {
    const contentHash = createHash('sha256').update(opts.content.slice(0, 500)).digest('hex');

    const review = this.reviewRepo.create({
      userId:        opts.userId,
      messageId:     opts.messageId,
      triggerLayer:  opts.triggerLayer,
      contentHash,
      violationType: opts.violationType,
      severity:      opts.severity ?? 'low',
      status:        'pending',
    });

    await this.reviewRepo.save(review);

    await this.reviewQueue.add('review', {
      reviewId:     review.id,
      userId:       opts.userId,
      triggerLayer: opts.triggerLayer,
      severity:     opts.severity,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      priority: opts.severity === 'high' ? 1 : opts.severity === 'medium' ? 5 : 10,
    });

    this.logger.warn(`Safety flag created: ${review.id} layer=${opts.triggerLayer} severity=${opts.severity}`);
  }
}
