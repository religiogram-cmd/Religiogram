import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, EntityManager, MoreThanOrEqual } from 'typeorm';
import { AvailabilitySlot } from './entities/availability-slot.entity';
import { AvailabilityOverride } from './entities/availability-override.entity';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(AvailabilitySlot)
    private readonly slotsRepo: Repository<AvailabilitySlot>,
    @InjectRepository(AvailabilityOverride)
    private readonly overridesRepo: Repository<AvailabilityOverride>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Replace all weekly slots for a provider atomically.
   */
  async setWeeklySlots(
    providerId: string,
    slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  ): Promise<AvailabilitySlot[]> {
    return this.dataSource.transaction(async (em: import('typeorm').EntityManager) => {
      await em.delete(AvailabilitySlot, { providerId });
      const entities = slots.map((s) =>
        em.create(AvailabilitySlot, {
          providerId,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          isActive: true,
        }),
      );
      return em.save(AvailabilitySlot, entities);
    });
  }

  /**
   * Add or upsert a date override (blocked day or custom note).
   */
  async addOverride(
    providerId: string,
    date: string,
    isBlocked: boolean,
    reason?: string,
  ): Promise<AvailabilityOverride> {
    // Race-safe upsert: do the delete + insert inside a single transaction
    // with an advisory lock on (provider, date) so two concurrent admin saves
    // can't both insert.
    return this.dataSource.transaction(async (em: import('typeorm').EntityManager) => {
      await em.query(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        [`${providerId}:${date}`],
      );
      await em.delete(AvailabilityOverride, { providerId, date });
      const override = em.create(AvailabilityOverride, {
        providerId,
        date,
        isBlocked,
        reason: reason ?? null,
      });
      return em.save(override);
    });
  }

  /**
   * Return available time slots for a provider on a given date.
   * Respects overrides (blocked date returns empty slots list).
   */
  async getAvailableSlots(
    providerId: string,
    date: string,
  ): Promise<{ slots: string[]; isBlocked: boolean }> {
    // Check override
    const override = await this.overridesRepo.findOne({
      where: { providerId, date },
    });
    if (override?.isBlocked) {
      return { slots: [], isBlocked: true };
    }

    // Determine day of week (0=Sun...6=Sat)
    const d = new Date(date + 'T00:00:00Z');
    const dayOfWeek = d.getUTCDay();

    const activeSlots = await this.slotsRepo.find({
      where: { providerId, dayOfWeek, isActive: true },
      order: { startTime: 'ASC' },
    });

    // Build 30-minute time buckets between each slot's start/end
    const timeSlots: string[] = [];
    for (const slot of activeSlots) {
      const [startH, startM] = slot.startTime.split(':').map(Number);
      const [endH, endM] = slot.endTime.split(':').map(Number);
      let current = startH * 60 + startM;
      const endMins = endH * 60 + endM;
      while (current < endMins) {
        const h = Math.floor(current / 60).toString().padStart(2, '0');
        const m = (current % 60).toString().padStart(2, '0');
        timeSlots.push(`${h}:${m}`);
        current += 30;
      }
    }

    return { slots: timeSlots, isBlocked: false };
  }

  /**
   * Check if a provider has any confirmed booking conflicting with the
   * proposed [scheduledAt, scheduledAt + durationMinutes) window.
   * Returns true if a conflict exists.
   */
  async checkConflict(
    providerId: string,
    scheduledAt: Date,
    durationMinutes: number,
  ): Promise<boolean> {
    const slotEnd = new Date(scheduledAt.getTime() + durationMinutes * 60_000);

    const count = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'cnt')
      .from('bookings', 'b')
      .where('b.provider_id = :providerId', { providerId })
      .andWhere("b.status NOT IN ('cancelled','refunded','payment_failed')")
      .andWhere('b.scheduled_at < :slotEnd', { slotEnd })
      .andWhere(
        "b.scheduled_at + (b.duration_minutes * interval '1 minute') > :scheduledAt",
        { scheduledAt },
      )
      .getRawOne<{ cnt: string }>();

    return parseInt(count?.cnt ?? '0', 10) > 0;
  }

  /**
   * Return the full schedule (slots + overrides) for a provider.
   */
  async getMySchedule(
    providerId: string,
  ): Promise<{ slots: AvailabilitySlot[]; overrides: AvailabilityOverride[] }> {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const [slots, overrides] = await Promise.all([
      this.slotsRepo.find({
        where: { providerId },
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
        take: 500, // cap to prevent memory exhaustion
      }),
      this.overridesRepo.find({
        where: {
          providerId,
          date: MoreThanOrEqual(todayStr), // only future overrides
        },
        order: { date: 'ASC' },
        take: 365, // max 1 year of future overrides
      }),
    ]);
    return { slots, overrides };
  }
}
