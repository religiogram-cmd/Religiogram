import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateInviteBookingDto } from './dto/create-invite-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { BookingStatus } from './entities/booking.entity';
import { UserThrottle, UserThrottleGuard } from '../common/guards/user-throttle.guard';

class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Body for POST /v1/bookings/preview — server-side price quote. */
class PreviewBookingDto {
  @IsUUID('4')
  serviceId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;
}

@ApiTags('bookings')
@ApiBearerAuth()
@Controller({ path: 'bookings', version: '1' })
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * POST /bookings
   * Creates a booking. Available to all authenticated users.
   * An idempotency key is generated server-side; retried requests with the
   * same payload will receive the existing booking (via DB unique constraint).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(UserThrottleGuard)
  @UserThrottle(10, 60, 'create-booking')   // max 10 bookings/min per user
  @ApiOperation({ summary: 'Create a booking for a provider service slot' })
  @ApiBody({ type: CreateBookingDto })
  @ApiResponse({ status: 201, description: 'Booking created and slot held in wallet' })
  @ApiResponse({ status: 400, description: 'Invalid input or slot not available' })
  @ApiResponse({ status: 402, description: 'Insufficient wallet balance' })
  @ApiResponse({ status: 409, description: 'Slot already taken (race conflict)' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (10/min)' })
  create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.createBooking(dto, user);
  }

  /**
   * POST /bookings/preview
   *
   * Returns the server-computed price for a prospective booking so the
   * client can show "you will pay ₹X" before the user commits. Pure read,
   * no DB writes, no wallet holds.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Server-side price preview for a prospective booking' })
  @ApiBody({ type: PreviewBookingDto })
  @ApiResponse({ status: 200, description: 'Returns computed total + fee split' })
  preview(@Body() dto: PreviewBookingDto) {
    return this.bookingsService.previewPrice({
      serviceId: dto.serviceId,
      scheduledAt: dto.scheduledAt,
      durationMinutes: dto.durationMinutes,
    });
  }

  /**
   * POST /bookings/invite
   *
   * Free-form "Invite a Priest / Imam / Granthi / Pandit for an event" flow.
   * Unlike POST /bookings, this does NOT require a catalog serviceId — the
   * customer types the ceremony name themselves.
   *
   * The flow is two-legged:
   *   - status: 'draft'   → create a draft booking, return its id. Frontend
   *                         uses this to show shortlisted priests.
   *   - status: 'confirm' → user has picked a priest (priestId in body) and
   *                         is ready to pay. The booking flips to
   *                         PENDING_PAYMENT and a Razorpay order can be
   *                         created against it via POST /v1/payments/order.
   *
   * No rate limit beyond the global throttler — invite bookings are not a
   * high-volume abuse vector (each one creates a real human interaction).
   */
  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(UserThrottleGuard)
  @UserThrottle(10, 60, 'create-invite-booking')
  @ApiOperation({ summary: 'Create or confirm a free-form invite-a-priest booking' })
  @ApiBody({ type: CreateInviteBookingDto })
  @ApiResponse({ status: 201, description: 'Invite booking created (draft or PENDING_PAYMENT)' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (10/min)' })
  createInvite(
    @Body() dto: CreateInviteBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.createInviteBooking(dto, user);
  }

  /**
   * GET /bookings/my?cursor=<base64>&limit=20&status=pending&from=ISO&to=ISO
   * Cursor-based paginated list of the calling user's own bookings.
   * Optional: from/to ISO date strings for date-range filtering (DPDP compliance).
   */
  @Get('my')
  @ApiOperation({ summary: 'List caller\'s bookings (cursor-paginated)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from previous page' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 100)' })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date range start' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date range end' })
  @ApiResponse({ status: 200, description: 'Paginated booking list with nextCursor' })
  getMyBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('status') status?: BookingStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.bookingsService.getMyBookings(user.id, cursor, limit, status, from, to);
  }

  /**
   * GET /bookings/my/export.csv?from=ISO&to=ISO&status=completed
   * P3: DPDP Act right-to-access — returns all bookings in range as CSV.
   * Capped at 10 000 rows. Set Content-Disposition: attachment so browsers download.
   */
  @Get('my/export.csv')
  @ApiOperation({ summary: 'Export caller\'s bookings as CSV (DPDP right-to-access, max 10 000 rows)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiResponse({ status: 200, description: 'CSV file download', content: { 'text/csv': {} } })
  async exportMyBookingsCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: BookingStatus,
  ) {
    const csv = await this.bookingsService.exportMyBookingsCsv(user.id, from, to, status);
    const filename = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    });
    res.send(csv);
  }

  /**
   * GET /bookings/provider?cursor=<base64>&limit=20&status=confirmed
   * Cursor-based paginated list of bookings for the authenticated provider.
   * Requires the 'advisor' role.
   */
  @Get('provider')
  @Roles('advisor')
  @ApiOperation({ summary: 'List bookings received by the authenticated provider (cursor-paginated)' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiResponse({ status: 200, description: 'Paginated booking list' })
  @ApiResponse({ status: 403, description: 'Not an advisor' })
  getProviderBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('status') status?: BookingStatus,
  ) {
    return this.bookingsService.getProviderBookings(user.id, cursor, limit, status);
  }

  /**
   * GET /bookings/:id
   * Retrieves a single booking. Accessible by the booking owner or admin.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single booking by ID (owner or admin only)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking detail' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.getBookingById(id, user);
  }

  /**
   * PATCH /bookings/:id
   * Cancel (any authenticated owner) or complete (advisor/admin).
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update booking status (cancel by owner; complete by advisor/admin)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: UpdateBookingDto })
  @ApiResponse({ status: 200, description: 'Booking updated' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 403, description: 'Not authorised for this transition' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.updateBooking(id, dto, user);
  }

  /**
   * POST /bookings/:id/cancel
   * Explicit cancellation endpoint.
   *
   * Why a separate endpoint instead of PATCH :id?
   *   • Semantically unambiguous — no body-field guessing
   *   • Allows a dedicated per-user throttle independent of other PATCH ops
   *   • Cleaner audit trail: "cancel" vs "update status to cancelled"
   *
   * Rate limited to 3 cancellations per hour to prevent cancel-abuse
   * (e.g. booking-then-cancel to hold slots, or rapid cancel-rebook farming).
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserThrottleGuard)
  @UserThrottle(3, 3600, 'cancel-booking')
  @ApiOperation({ summary: 'Cancel a booking (rate-limited: 3/hour)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ schema: { properties: { reason: { type: 'string', maxLength: 500 } } } })
  @ApiResponse({ status: 200, description: 'Booking cancelled and refund processed' })
  @ApiResponse({ status: 400, description: 'Cannot cancel in current state' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (3/hour)' })
  cancelBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.cancelBooking(
      id,
      user.id,
      user.role,
      dto.reason ?? 'user_request',
    );
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Mark booking as started (provider GPS check-in)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ schema: { properties: { lat: { type: 'number' }, lng: { type: 'number' } } } })
  @ApiResponse({ status: 200, description: 'Booking started' })
  @ApiResponse({ status: 403, description: 'Not the assigned provider' })
  startBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { lat?: number; lng?: number },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.startBooking(id, user, dto.lat, dto.lng);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark booking as completed (provider or admin)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking completed and payout scheduled' })
  @ApiResponse({ status: 403, description: 'Not the assigned provider or admin' })
  completeBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.completeBooking(id, user.id);
  }
}
