import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventReminder, ReminderStatus } from './entities/event-reminder.entity';
import { PlaceEvent } from './entities/place-event.entity';
import { Temple } from '../temples/entities/temple.entity';

/**
 * Default lead time. "Remind me" without a picker subscribes the user
 * to receive a notification this many ms before the event starts.
 *
 * Chosen empirically:
 *   - 1 hour is long enough to stop what you're doing and make the trip
 *     for a typical same-city visit,
 *   - but not so far out that the user forgets by the time they receive it.
 *
 * A future UI will let the user pick (15 min / 1 h / 1 day / "at start").
 */
const DEFAULT_LEAD_MS = 60 * 60 * 1000;

/** Max future horizon we accept. Reminders beyond this are pointless. */
const MAX_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

/** Batch size for the dispatcher scan. */
export const REMINDER_DISPATCH_BATCH = 200;

export interface ReminderDto {
  id: string;
  eventId: string;
  userId: string;
  remindAt: string;
  status: ReminderStatus;
  createdAt: string;
}

/** Rich DTO for "my reminders" — embeds event + place for the UI. */
export interface MyReminderDto extends ReminderDto {
  event: {
    id: string;
    title: string;
    startTime: string;
    endTime: string | null;
    recurring: boolean;
  };
  place: {
    id: string;
    name: string;
    city: string;
    type: string;
  };
}

/**
 * EventRemindersService — subscribe, unsubscribe, list, and dispatch.
 *
 * The dispatcher is invoked from a BullMQ processor (see
 * EventRemindersDispatcherProcessor). It selects a small batch, flips
 * each row to `sent` or `failed`, and returns stats.
 *
 * Notification transport is pluggable: we call a NotificationDispatcher
 * port (push / email / webhook). For MVP there's a logger-backed
 * implementation; a real push backend slots in later via DI.
 */
@Injectable()
export class EventRemindersService {
  private readonly logger = new Logger(EventRemindersService.name);

  constructor(
    @InjectRepository(EventReminder)
    private readonly reminders: Repository<EventReminder>,
    @InjectRepository(PlaceEvent)
    private readonly events: Repository<PlaceEvent>,
    // Injected for dispatchDue's SELECT ... FOR UPDATE SKIP LOCKED path —
    // repo-level helpers don't expose row locking cleanly, so the
    // dispatcher runs inside a transaction via the shared DataSource.
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Subscribe. Optional `leadMinutes` lets a caller pick a different
   * lead time than the 60-minute default.
   */
  async subscribe(
    placeId: string,
    eventId: string,
    userId: string,
    leadMinutes?: number,
  ): Promise<ReminderDto> {
    const event = await this.events.findOne({ where: { id: eventId, placeId } });
    if (!event) throw new NotFoundException('Event not found');

    const leadMs =
      leadMinutes !== undefined && leadMinutes >= 0
        ? leadMinutes * 60 * 1000
        : DEFAULT_LEAD_MS;

    const start = event.startTime.getTime();
    const remindAt = new Date(start - leadMs);

    if (remindAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'This event has already started (or is too soon to be useful).',
      );
    }
    if (remindAt.getTime() - Date.now() > MAX_FUTURE_MS) {
      throw new BadRequestException('Event is too far in the future');
    }

    // Existing active reminder? Return 409 so the client treats it as
    // "you are already subscribed" instead of stacking duplicates.
    const existing = await this.reminders.findOne({
      where: { eventId, userId, status: 'scheduled' },
    });
    if (existing) {
      throw new ConflictException('You already have a reminder for this event');
    }

    const saved = await this.reminders.save(
      this.reminders.create({
        eventId,
        userId,
        remindAt,
        status: 'scheduled',
        sent: false,
      }),
    );
    this.logger.log(
      `Scheduled reminder ${saved.id} for user ${userId} at ${remindAt.toISOString()}`,
    );
    return this.toDto(saved);
  }

  /**
   * Unsubscribe — flip the active reminder to `cancelled`. Idempotent.
   *
   * Takes `placeId` explicitly so we can verify the event belongs to the
   * place in the URL. Prior version trusted the eventId alone, which let
   * a client DELETE reminders via the wrong place path without error.
   * The validation is cheap (one PK lookup) and keeps URL semantics honest.
   */
  async unsubscribe(
    placeId: string,
    eventId: string,
    userId: string,
  ): Promise<{ success: true }> {
    const event = await this.events.findOne({
      where: { id: eventId, placeId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const r = await this.reminders.findOne({
      where: { eventId, userId, status: 'scheduled' },
    });
    if (!r) return { success: true }; // already unsubscribed — idempotent

    r.status = 'cancelled';
    await this.reminders.save(r);
    return { success: true };
  }

  /**
   * "My reminders" — the user's upcoming subscriptions. Joined with
   * place_events + temples for a single round-trip.
   */
  async listMine(userId: string): Promise<MyReminderDto[]> {
    const rows = await this.reminders
      .createQueryBuilder('r')
      .leftJoin(PlaceEvent, 'e', 'e.id = r.event_id')
      .leftJoin(Temple, 'p', 'p.id = e.place_id')
      .where('r.user_id = :userId', { userId })
      .andWhere('r.status IN (:...statuses)', {
        statuses: ['scheduled', 'sent'],
      })
      .orderBy('r.remind_at', 'DESC')
      .limit(200)
      .select([
        'r.id AS "id"',
        'r.event_id AS "eventId"',
        'r.user_id AS "userId"',
        'r.remind_at AS "remindAt"',
        'r.status AS "status"',
        'r.created_at AS "createdAt"',
        'e.id AS "eEventId"',
        'e.title AS "eTitle"',
        'e.start_time AS "eStartTime"',
        'e.end_time AS "eEndTime"',
        'e.recurring AS "eRecurring"',
        'p.id AS "pPlaceId"',
        'p.name AS "pName"',
        'p.city AS "pCity"',
        'p.type AS "pType"',
      ])
      .getRawMany<{
        id: string;
        eventId: string;
        userId: string;
        remindAt: Date;
        status: ReminderStatus;
        createdAt: Date;
        eEventId: string | null;
        eTitle: string | null;
        eStartTime: Date | null;
        eEndTime: Date | null;
        eRecurring: boolean | null;
        pPlaceId: string | null;
        pName: string | null;
        pCity: string | null;
        pType: string | null;
      }>();

    return rows
      .filter((r: any) => r.eEventId && r.pPlaceId) // drop rows with dangling FKs (shouldn't happen with CASCADE)
      .map((r: any) => ({
        id: r.id,
        eventId: r.eventId,
        userId: r.userId,
        remindAt: r.remindAt.toISOString(),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        event: {
          id: r.eEventId!,
          title: r.eTitle ?? '',
          startTime: r.eStartTime!.toISOString(),
          endTime: r.eEndTime?.toISOString() ?? null,
          recurring: !!r.eRecurring,
        },
        place: {
          id: r.pPlaceId!,
          name: r.pName ?? '',
          city: r.pCity ?? '',
          type: r.pType ?? 'temple',
        },
      }));
  }

  /**
   * Dispatcher entry point (called by the BullMQ worker).
   *
   * Picks up to REMINDER_DISPATCH_BATCH reminders whose remind_at is due,
   * sends a notification per row, and marks each sent/failed.
   *
   * Concurrency safety
   *   We run concurrency=1 on the BullMQ processor, BUT in a multi-pod
   *   deployment every pod is a worker. To stay safe without pinning the
   *   dispatcher to a single pod, the SELECT runs with `FOR UPDATE SKIP
   *   LOCKED` inside a transaction — any row another pod has already
   *   claimed is silently skipped by this scan.
   *
   * Efficiency
   *   Successful rows are flipped in one UPDATE ... WHERE id = ANY($1),
   *   not one-save-per-row. Failed rows still go row-by-row because each
   *   carries a distinct `error` string; that path is the exception case.
   */
  async dispatchDue(now: Date = new Date()): Promise<{
    picked: number;
    sent: number;
    failed: number;
  }> {
    return this.dataSource.transaction(async (manager: import('typeorm').EntityManager) => {
      const repo = manager.getRepository(EventReminder);

      // `FOR UPDATE SKIP LOCKED` is the whole point: without it, two pods
      // scanning simultaneously would attempt to flip the same rows.
      const due = await repo
        .createQueryBuilder('r')
        .where('r.status = :status', { status: 'scheduled' })
        .andWhere('r.sent = false')
        .andWhere('r.remind_at <= :now', { now })
        .andWhere('r.sent_at IS NULL')
        .orderBy('r.remind_at', 'ASC')
        .limit(REMINDER_DISPATCH_BATCH)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      if (due.length === 0) return { picked: 0, sent: 0, failed: 0 };

      const sentIds: string[] = [];
      const failedRows: Array<{ id: string; error: string }> = [];
      let sent = 0;
      let failed = 0;

      for (const r of due) {
        try {
          // NotificationDispatcher would fan out to FCM/APNS/email here.
          // The MVP path is a log line — a real adapter replaces this call
          // without touching the service.
          await this.dispatchOne(r);
          sentIds.push(r.id);
          sent++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failedRows.push({ id: r.id, error: msg });
          failed++;
          this.logger.error(`Reminder ${r.id} failed to send: ${msg}`);
        }
      }

      // Batch success updates — single UPDATE instead of N saves.
      if (sentIds.length > 0) {
        await repo
          .createQueryBuilder()
          .update(EventReminder)
          .set({
            status: 'sent',
            sent: true,
            sentAt: new Date(),
            error: null,
          })
          .whereInIds(sentIds)
          .execute();
      }

      // Failed rows carry distinct error strings, so per-row updates
      // here. In practice `failed` is near zero — this is the cold path.
      for (const f of failedRows) {
        await repo
          .createQueryBuilder()
          .update(EventReminder)
          .set({ status: 'failed', error: f.error })
          .where('id = :id', { id: f.id })
          .execute();
      }

      this.logger.log(
        `Dispatched reminders: picked=${due.length} sent=${sent} failed=${failed}`,
      );
      return { picked: due.length, sent, failed };
    });
  }

  /** Default MVP transport — logs. Swap for a push/email adapter later. */
  private async dispatchOne(r: EventReminder): Promise<void> {
    this.logger.log(
      `[NOTIFY] reminder=${r.id} user=${r.userId} event=${r.eventId} remindAt=${r.remindAt.toISOString()}`,
    );
    // intentional no-op: real notification transport plugs in here
  }

  /**
   * ICS / iCalendar file content. Returned by the ICS route so the user
   * can add the event to Google/Apple/Outlook calendar.
   *
   * We build the string by hand (one-call dependency, no library needed
   * for a single VEVENT) with RFC 5545–compliant line endings and a
   * UUID-looking UID so clients dedupe correctly on re-import.
   */
  async getIcs(
    placeId: string,
    eventId: string,
  ): Promise<{ filename: string; body: string }> {
    const event = await this.events
      .createQueryBuilder('e')
      .leftJoin(Temple, 'p', 'p.id = e.place_id')
      .where('e.id = :eventId AND e.place_id = :placeId', { eventId, placeId })
      .select([
        'e.id AS "id"',
        'e.title AS "title"',
        'e.description AS "description"',
        'e.start_time AS "startTime"',
        'e.end_time AS "endTime"',
        'e.recurring AS "recurring"',
        'p.name AS "placeName"',
        'p.city AS "placeCity"',
        'p.address AS "placeAddress"',
      ])
      .getRawOne<{
        id: string;
        title: string;
        description: string | null;
        startTime: Date;
        endTime: Date | null;
        recurring: boolean;
        placeName: string;
        placeCity: string | null;
        placeAddress: string | null;
      }>();

    if (!event) throw new NotFoundException('Event not found');

    const dtStamp = this.icsFormatDate(new Date());
    const dtStart = this.icsFormatDate(event.startTime);
    const dtEnd = this.icsFormatDate(
      event.endTime ?? new Date(event.startTime.getTime() + 60 * 60 * 1000),
    );

    const location = [event.placeName, event.placeAddress, event.placeCity]
      .filter(Boolean)
      .join(', ');

    // CRLF per RFC 5545. Outlook chokes on LF-only.
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Religiogram//Places//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${event.id}@religiogram`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${this.icsEscape(event.title)}`,
      event.description
        ? `DESCRIPTION:${this.icsEscape(event.description)}`
        : '',
      location ? `LOCATION:${this.icsEscape(location)}` : '',
      event.recurring ? 'RRULE:FREQ=WEEKLY' : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean);

    return {
      filename: `${this.slug(event.title)}.ics`,
      body: lines.join('\r\n'),
    };
  }

  /* ── helpers ── */

  private icsFormatDate(d: Date): string {
    // UTC, YYYYMMDDTHHMMSSZ
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
    );
  }

  /**
   * RFC 5545 §3.3.11: escape backslash, semicolon, comma; newline → \n.
   * Not exhaustive (no folding at 75 octets) but fine for a single event
   * with short fields.
   */
  private icsEscape(s: string): string {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  private slug(s: string): string {
    return (
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'event'
    );
  }

  private toDto(r: EventReminder): ReminderDto {
    return {
      id: r.id,
      eventId: r.eventId,
      userId: r.userId,
      remindAt: r.remindAt.toISOString(),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
