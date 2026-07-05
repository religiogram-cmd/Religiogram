import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProviderEntity, ProviderStatus, ProviderCategory } from '../service-providers/entities/provider.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { LedgerEntry, EntryType } from '../wallet/entities/ledger-entry.entity';
import { Dispute, DisputeStatus } from '../dispute/entities/dispute.entity';
import { FraudSignal } from '../fraud/entities/fraud-signal.entity';
import { User, AccountStatus } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/analytics', version: '1' })
export class AdminAnalyticsController {
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
    @InjectRepository(FraudSignal)
    private readonly fraudRepo: Repository<FraudSignal>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly ds: DataSource,
  ) {}

  @Get('kpis')
  async getKpis() {
    const [
      totalProviders,
      pendingProviders,
      approvedProviders,
      totalBookings,
      completedBookings,
      cancelledBookings,
      openDisputes,
      totalDisputes,
      resolvedDisputes,
      totalFraudSignals,
      unresolvedFraudSignals,
      totalUsers,
      seekerUsers,
      advisorUsers,
      adminUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      priestPending,
      priestApproved,
      astrologerPending,
      astrologerApproved,
      bothPending,
      bothApproved,
    ] = await Promise.all([
      this.providerRepo.count(),
      this.providerRepo.count({ where: { status: ProviderStatus.PendingReview } }),
      this.providerRepo.count({ where: { status: ProviderStatus.Approved } }),
      this.bookingRepo.count(),
      this.bookingRepo.count({ where: { status: BookingStatus.COMPLETED } }),
      this.bookingRepo.count({ where: { status: BookingStatus.CANCELLED } }),
      this.disputeRepo.count({ where: { status: DisputeStatus.RAISED } }),
      this.disputeRepo.count(),
      // "Resolved" from the admin's perspective = any terminal outcome.
      // We UNION the three resolved states in a single COUNT with a raw
      // where-in so the schema stays flexible if new states are added.
      this.disputeRepo
        .createQueryBuilder('d')
        .where('d.status IN (:...st)', {
          st: [
            DisputeStatus.RESOLVED_FOR_USER,
            DisputeStatus.RESOLVED_FOR_PROVIDER,
            DisputeStatus.CLOSED,
          ],
        })
        .getCount(),
      this.fraudRepo.count(),
      this.fraudRepo.count({ where: { isResolved: false } }),
      this.userRepo.count(),
      this.userRepo.count({ where: { role: 'seeker' } }),
      this.userRepo.count({ where: { role: 'advisor' } }),
      this.userRepo.count({ where: { role: 'admin' } }),
      this.userRepo.count({ where: { accountStatus: AccountStatus.ACTIVE } }),
      this.userRepo.count({ where: { accountStatus: AccountStatus.SUSPENDED } }),
      this.userRepo.count({ where: { accountStatus: AccountStatus.BANNED } }),
      this.providerRepo.count({ where: { providerCategory: ProviderCategory.Priest,     status: ProviderStatus.PendingReview } }),
      this.providerRepo.count({ where: { providerCategory: ProviderCategory.Priest,     status: ProviderStatus.Approved } }),
      this.providerRepo.count({ where: { providerCategory: ProviderCategory.Astrologer, status: ProviderStatus.PendingReview } }),
      this.providerRepo.count({ where: { providerCategory: ProviderCategory.Astrologer, status: ProviderStatus.Approved } }),
      this.providerRepo.count({ where: { providerCategory: ProviderCategory.Both,       status: ProviderStatus.PendingReview } }),
      this.providerRepo.count({ where: { providerCategory: ProviderCategory.Both,       status: ProviderStatus.Approved } }),
    ]);

    return {
      providers: { total: totalProviders, pending: pendingProviders, approved: approvedProviders },
      bookings:  { total: totalBookings, completed: completedBookings, cancelled: cancelledBookings },
      disputes:  {
        total:    totalDisputes,
        open:     openDisputes,
        resolved: resolvedDisputes,
      },
      fraud:     {
        total:      totalFraudSignals,
        unresolved: unresolvedFraudSignals,
      },
      users: {
        total:     totalUsers,
        seekers:   seekerUsers,
        advisors:  advisorUsers,
        admins:    adminUsers,
        active:    activeUsers,
        suspended: suspendedUsers,
        banned:    bannedUsers,
      },
      providersByCategory: {
        priest:     { pending: priestPending,     approved: priestApproved },
        astrologer: { pending: astrologerPending, approved: astrologerApproved },
        both:       { pending: bothPending,       approved: bothApproved },
      },
    };
  }

  @Get('revenue')
  async getRevenue(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const toDate   = to   ? new Date(to)   : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.ds.query<Array<{ entry_type: string; total: string }>>(
      `SELECT entry_type, SUM(amount) as total
       FROM ledger_entries
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY entry_type`,
      [fromDate, toDate],
    );

    const map: Record<string, number> = {};
    for (const row of result) {
      map[row.entry_type] = Number(row.total);
    }

    return {
      fromDate: fromDate.toISOString(),
      toDate:   toDate.toISOString(),
      credits:  map[EntryType.CREDIT]  ?? 0,
      debits:   map[EntryType.DEBIT]   ?? 0,
      holds:    map[EntryType.HOLD]    ?? 0,
      releases: map[EntryType.RELEASE] ?? 0,
    };
  }

  @Get('booking-trend')
  async getBookingTrend(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const toDate   = to   ? new Date(to)   : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const rows = await this.ds.query<Array<{ day: string; count: string; status: string }>>(
      `SELECT DATE_TRUNC('day', created_at) as day, status, COUNT(*) as count
       FROM bookings
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY day, status
       ORDER BY day ASC`,
      [fromDate, toDate],
    );

    return { fromDate: fromDate.toISOString(), toDate: toDate.toISOString(), rows };
  }

  @Get('dispute-sla')
  async getDisputeSla() {
    const now = new Date();
    const [open, overdue] = await Promise.all([
      this.disputeRepo.count({ where: { status: DisputeStatus.UNDER_INVESTIGATION } }),
      this.ds.query<Array<{ count: string }>>(
        `SELECT COUNT(*) as count FROM disputes WHERE status = 'under_investigation' AND sla_deadline < $1`,
        [now],
      ),
    ]);
    return {
      open,
      overdue: Number(overdue[0]?.count ?? 0),
      healthPct: open > 0 ? Math.round(((open - Number(overdue[0]?.count ?? 0)) / open) * 100) : 100,
    };
  }
}
