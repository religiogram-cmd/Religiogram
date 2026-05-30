import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { createHmac, randomBytes } from 'crypto';
import { PlaceDonation, DonationStatus } from './entities/place-donation.entity';
import { Temple } from '../temples/entities/temple.entity';

/* ── DTOs ────────────────────────────────────────────────────────────── */

export interface CreateDonationOrderDto {
  amountPaise: number;       // ₹1 = 100 paise; min 100
  message?: string;
  isAnonymous?: boolean;
}

export interface DonationOrderResponse {
  donationId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}

export interface VerifyDonationDto {
  donationId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface DonationStatsDto {
  totalDonations: number;        // count of captured donations
  totalAmountPaise: number;      // sum of captured amounts
  recentDonors: RecentDonorDto[];
}

export interface RecentDonorDto {
  name: string | null;           // null if anonymous
  amountPaise: number;
  message: string | null;
  donatedAt: string;
}

export interface MyDonationDto {
  id: string;
  placeId: string;
  placeName: string;
  amountPaise: number;
  status: DonationStatus;
  message: string | null;
  isAnonymous: boolean;
  createdAt: string;
}

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

const RZP_BASE = 'https://api.razorpay.com/v1';
const MIN_AMOUNT_PAISE = 100; // ₹1
const MAX_AMOUNT_PAISE = 10_000_000; // ₹1 lakh


// Razorpay webhook payload shape
interface RzpEntity { [key: string]: unknown; }
interface RzpWebhookPayload {
  payload?: { payment?: { entity?: RzpEntity }; refund?: { entity?: RzpEntity }; };
}

@Injectable()
export class PlaceDonationsService {
  private readonly logger = new Logger(PlaceDonationsService.name);

  constructor(
    @InjectRepository(PlaceDonation)
    private readonly donationRepo: Repository<PlaceDonation>,
    @InjectRepository(Temple)
    private readonly templeRepo: Repository<Temple>,
    private readonly config: ConfigService,
  ) {}

  /* ── Helpers ─────────────────────────────────────────────────────── */

  private get razorpayAuth() {
    return {
      username: this.config.getOrThrow<string>('razorpay.keyId'),
      password: this.config.getOrThrow<string>('razorpay.keySecret'),
    };
  }

  private get keyId(): string {
    return this.config.getOrThrow<string>('razorpay.keyId');
  }

  private get keySecret(): string {
    return this.config.getOrThrow<string>('razorpay.keySecret');
  }

  private hmac(data: string): string {
    return createHmac('sha256', this.keySecret).update(data).digest('hex');
  }

  /** Stable idempotency key derived from userId + placeId + amount.
   *  A new order with the same triple (retry) returns the existing Razorpay order.
   *  A different amount forces a new key → new order.
   */
  private idempotencyKey(userId: string, placeId: string, amountPaise: number): string {
    const raw = `${userId}:${placeId}:${amountPaise}`;
    return createHmac('sha256', this.keySecret).update(raw).digest('hex').slice(0, 64);
  }

  /* ── Create Razorpay order for a donation ─────────────────────────── */

  async createOrder(
    placeId: string,
    userId: string,
    dto: CreateDonationOrderDto,
  ): Promise<DonationOrderResponse> {
    if (dto.amountPaise < MIN_AMOUNT_PAISE || dto.amountPaise > MAX_AMOUNT_PAISE) {
      throw new BadRequestException(
        `Donation amount must be between ₹1 (100 paise) and ₹1,00,000`,
      );
    }

    const place = await this.templeRepo.findOne({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Place not found');

    const idempotencyKey = this.idempotencyKey(userId, placeId, dto.amountPaise);

    // Idempotent: return existing order if already created
    const existing = await this.donationRepo.findOne({ where: { idempotencyKey } });
    if (existing?.razorpayOrderId) {
      return {
        donationId:      existing.id,
        razorpayOrderId: existing.razorpayOrderId,
        amountPaise:     existing.amountPaise,
        currency:        existing.currency,
        keyId:           this.keyId,
      };
    }

    // Create Razorpay order
    let rzpOrder: RazorpayOrder;
    try {
      const { data } = await axios.post<RazorpayOrder>(
        `${RZP_BASE}/orders`,
        {
          amount:   dto.amountPaise,
          currency: 'INR',
          receipt:  `donation_${placeId.slice(0, 8)}_${randomBytes(4).toString('hex')}`,
          notes: {
            place_id:   placeId,
            place_name: place.name,
            user_id:    userId,
          },
        },
        {
          auth: this.razorpayAuth,
          headers: { 'X-Idempotency-Key': idempotencyKey },
        },
      );
      rzpOrder = data;
    } catch (err) {
      const axErr = err as AxiosError;
      this.logger.error(`Razorpay donation order failed: ${axErr.message}`, axErr.response?.data);
      throw new InternalServerErrorException('Failed to create donation order. Please try again.');
    }

    const donation = this.donationRepo.create({
      placeId,
      userId,
      amountPaise:     dto.amountPaise,
      currency:        'INR',
      status:          'created',
      razorpayOrderId: rzpOrder.id,
      message:         dto.message ?? null,
      isAnonymous:     dto.isAnonymous ?? false,
      idempotencyKey,
    });
    const saved = await this.donationRepo.save(donation);

    return {
      donationId:      saved.id,
      razorpayOrderId: rzpOrder.id,
      amountPaise:     saved.amountPaise,
      currency:        saved.currency,
      keyId:           this.keyId,
    };
  }

  /* ── Verify + capture a donation payment ────────────────────────── */

  async verifyPayment(userId: string, dto: VerifyDonationDto): Promise<{ success: boolean }> {
    const donation = await this.donationRepo.findOne({ where: { id: dto.donationId } });
    if (!donation) throw new NotFoundException('Donation not found');
    if (donation.userId !== userId) throw new UnauthorizedException('Not your donation');

    if (donation.status === 'captured') return { success: true }; // idempotent

    // Verify Razorpay signature
    const expected = this.hmac(`${donation.razorpayOrderId}|${dto.razorpayPaymentId}`);
    if (expected !== dto.razorpaySignature) {
      donation.status        = 'failed';
      donation.failureReason = 'Invalid signature';
      await this.donationRepo.save(donation);
      throw new UnauthorizedException('Invalid payment signature');
    }

    donation.razorpayPaymentId = dto.razorpayPaymentId;
    donation.razorpaySignature = dto.razorpaySignature;
    donation.status            = 'captured';
    await this.donationRepo.save(donation);

    this.logger.log(`Donation ${donation.id} captured for place ${donation.placeId}`);
    return { success: true };
  }

  /* ── Razorpay webhook for donations ──────────────────────────────── */

  async handleWebhook(placeId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    const entity = (payload as RzpWebhookPayload).payload?.payment?.entity as Record<string, unknown> | undefined;
    if (!entity) return;

    const rzpOrderId   = entity['order_id'] as string;
    const rzpPaymentId = entity['id']       as string;

    const donation = await this.donationRepo.findOne({ where: { razorpayOrderId: rzpOrderId, placeId } });
    if (!donation) return;

    if (event === 'payment.captured' && donation.status !== 'captured') {
      donation.razorpayPaymentId = rzpPaymentId;
      donation.status            = 'captured';
      donation.webhookPayload    = payload;
      await this.donationRepo.save(donation);
      this.logger.log(`Webhook: donation ${donation.id} captured`);
    } else if (event === 'payment.failed' && donation.status !== 'captured') {
      donation.status        = 'failed';
      donation.failureReason = (entity['error_description'] as string) ?? 'Payment failed';
      donation.webhookPayload = payload;
      await this.donationRepo.save(donation);
    }
  }

  /* ── Public stats for a place ─────────────────────────────────────── */

  async getStats(placeId: string): Promise<DonationStatsDto> {
    await this.requirePlace(placeId);

    const stats = await this.donationRepo
      .createQueryBuilder('d')
      .select('COUNT(*)',           'total')
      .addSelect('SUM(d.amountPaise)', 'totalAmount')
      .where('d.placeId = :placeId', { placeId })
      .andWhere('d.status = :status', { status: 'captured' })
      .getRawOne<{ total: string; totalAmount: string }>();

    // Recent non-anonymous donors (last 10)
    const recentRows = await this.donationRepo
      .createQueryBuilder('d')
      .leftJoin('d.user', 'u')
      .leftJoin('u.profile', 'p')
      .select(['d.amountPaise', 'd.message', 'd.isAnonymous', 'd.createdAt', 'p.displayName'])
      .where('d.placeId = :placeId', { placeId })
      .andWhere('d.status = :status', { status: 'captured' })
      .orderBy('d.createdAt', 'DESC')
      .take(10)
      .getRawMany<{
        d_amount_paise: string;
        d_message: string | null;
        d_is_anonymous: boolean;
        d_created_at: Date;
        p_display_name: string | null;
      }>();

    return {
      totalDonations:  Number(stats?.total ?? 0),
      totalAmountPaise: Number(stats?.totalAmount ?? 0),
      recentDonors: recentRows.map((r: any) => ({
        name:        r.d_is_anonymous ? null : (r.p_display_name ?? 'Anonymous'),
        amountPaise: Number(r.d_amount_paise),
        message:     r.d_message,
        donatedAt:   new Date(r.d_created_at).toISOString(),
      })),
    };
  }

  /* ── User's own donation history ─────────────────────────────────── */

  async listMine(userId: string, placeId?: string): Promise<MyDonationDto[]> {
    const qb = this.donationRepo
      .createQueryBuilder('d')
      .leftJoin('d.place', 'pl')
      .select(['d.id', 'd.placeId', 'd.amountPaise', 'd.status', 'd.message', 'd.isAnonymous', 'd.createdAt', 'pl.name'])
      .where('d.userId = :userId', { userId })
      .andWhere('d.status = :status', { status: 'captured' })
      .orderBy('d.createdAt', 'DESC')
      .take(50);

    if (placeId) qb.andWhere('d.placeId = :placeId', { placeId });

    const rows = await qb.getRawMany<{
      d_id: string; d_place_id: string; d_amount_paise: string;
      d_status: DonationStatus; d_message: string | null;
      d_is_anonymous: boolean; d_created_at: Date; pl_name: string;
    }>();

    return rows.map((r: any) => ({
      id:          r.d_id,
      placeId:     r.d_place_id,
      placeName:   r.pl_name,
      amountPaise: Number(r.d_amount_paise),
      status:      r.d_status,
      message:     r.d_message,
      isAnonymous: r.d_is_anonymous,
      createdAt:   new Date(r.d_created_at).toISOString(),
    }));
  }

  /* ── Internals ───────────────────────────────────────────────────── */

  private async requirePlace(id: string): Promise<void> {
    const exists = await this.templeRepo
      .createQueryBuilder('t').select('1').where('t.id = :id', { id }).getRawOne();
    if (!exists) throw new NotFoundException('Place not found');
  }
}
