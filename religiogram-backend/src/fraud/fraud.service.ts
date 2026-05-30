import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FraudSignal, FraudSignalType } from './entities/fraud-signal.entity';
import { RedisService } from '../redis/redis.service';

const WALLET_VELOCITY_KEY  = (userId: string)              => `fraud:wallet:${userId}`;
const REVIEW_IP_KEY        = (ip: string, pId: string)     => `fraud:review:${ip}:${pId}`;
const WALLET_TTL           = 3600;  // 1 hour
const REVIEW_TTL           = 86400; // 24 hours
const WALLET_THRESHOLD     = 5;
const REVIEW_THRESHOLD     = 3;
const HIGH_RISK_THRESHOLD  = 50;

@Injectable()
export class FraudService {
  constructor(
    @InjectRepository(FraudSignal)
    private readonly signalRepo: Repository<FraudSignal>,

    private readonly redis: RedisService,
  ) {}

  // ── checkWalletVelocity ────────────────────────────────────────────────────
  async checkWalletVelocity(
    userId: string,
    ipAddress: string,
  ): Promise<{ blocked: boolean; riskScore: number }> {
    const key   = WALLET_VELOCITY_KEY(userId);
    const count = await this.redis.incr(key);

    // Only set TTL on first increment
    if (count === 1) {
      await this.redis.expire(key, WALLET_TTL);
    }

    if (count > WALLET_THRESHOLD) {
      await this.signalRepo.save(
        this.signalRepo.create({
          userId,
          signalType: FraudSignalType.WALLET_VELOCITY,
          riskScore:  90,
          details:    { rechargeCount: count, ipAddress, windowSeconds: WALLET_TTL },
          isResolved: false,
        }),
      );
      return { blocked: true, riskScore: 90 };
    }

    return { blocked: false, riskScore: Math.min(count * 10, 50) };
  }

  // ── checkReviewManipulation ────────────────────────────────────────────────
  async checkReviewManipulation(
    reviewerId: string,
    providerId: string,
    ipAddress: string,
  ): Promise<{ suppressed: boolean }> {
    const key   = REVIEW_IP_KEY(ipAddress, providerId);
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, REVIEW_TTL);
    }

    if (count >= REVIEW_THRESHOLD) {
      await this.signalRepo.save(
        this.signalRepo.create({
          userId:     reviewerId,
          signalType: FraudSignalType.REVIEW_MANIPULATION,
          riskScore:  75,
          details:    { reviewCount: count, ipAddress, providerId },
          isResolved: false,
        }),
      );
      return { suppressed: true };
    }

    return { suppressed: false };
  }

  // ── checkFakeBooking ───────────────────────────────────────────────────────
  async checkFakeBooking(
    userId: string,
    providerId: string,
    deviceId: string,
  ): Promise<{ blocked: boolean }> {
    // Check raw query: does any other userId share this deviceId + providerId combo?
    const existing = await this.signalRepo
      .createQueryBuilder('s')
      .where("s.details->>'deviceId' = :deviceId", { deviceId })
      .andWhere("s.details->>'providerId' = :providerId", { providerId })
      .andWhere('s.user_id != :userId', { userId })
      .andWhere('s.signal_type = :type', { type: FraudSignalType.FAKE_BOOKING })
      .getOne();

    if (existing) {
      await this.signalRepo.save(
        this.signalRepo.create({
          userId,
          signalType: FraudSignalType.FAKE_BOOKING,
          riskScore:  95,
          details:    { deviceId, providerId, matchedSignalId: existing.id },
          isResolved: false,
        }),
      );
      return { blocked: true };
    }

    // Record the device association for future checks
    await this.signalRepo.save(
      this.signalRepo.create({
        userId,
        signalType: FraudSignalType.SUSPICIOUS_DEVICE,
        riskScore:  20,
        details:    { deviceId, providerId },
        isResolved: false,
      }),
    );

    return { blocked: false };
  }

  // ── getSignals ─────────────────────────────────────────────────────────────
  async getSignals(userId?: string, resolved?: boolean): Promise<FraudSignal[]> {
    const where: Record<string, unknown> = {};
    if (userId !== undefined)   where['userId']     = userId;
    if (resolved !== undefined) where['isResolved'] = resolved;

    return this.signalRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  // ── resolveSignal ──────────────────────────────────────────────────────────
  async resolveSignal(id: string, adminId: string): Promise<FraudSignal> {
    const signal = await this.signalRepo.findOne({ where: { id } });
    if (!signal) throw new NotFoundException(`FraudSignal ${id} not found`);

    signal.isResolved   = true;
    signal.resolvedById = adminId;
    return this.signalRepo.save(signal);
  }

  // ── getHighRiskUsers ───────────────────────────────────────────────────────
  async getHighRiskUsers(): Promise<{ userId: string; totalScore: number }[]> {
    const rows: Array<{ userId: string; totalScore: string }> = await this.signalRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'userId')
      .addSelect('SUM(s.risk_score)', 'totalScore')
      .where('s.is_resolved = false')
      .groupBy('s.user_id')
      .having('SUM(s.risk_score) > :threshold', { threshold: HIGH_RISK_THRESHOLD })
      .orderBy('"totalScore"', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      userId:     r.userId,
      totalScore: parseInt(r.totalScore, 10),
    }));
  }
}
