import {
  Controller,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  RawBodyRequest,
  UseGuards,
  InternalServerErrorException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserThrottle, UserThrottleGuard } from '../common/guards/user-throttle.guard';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { PaymentsService } from './payments.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

/**
 * v6 (recovery): payments.controller.ts was truncated in the v3 zip you
 * supplied. Reconstructed from the audited contract.
 */
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /payments/order
   * Creates a Razorpay order for an existing PENDING booking.
   */
  @Post('order')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(UserThrottleGuard)
  @UserThrottle(3, 60, 'create-payment-order')
  createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.createOrder(dto, user.id);
  }

  /**
   * POST /payments/verify
   * Verifies the Razorpay signature returned by the frontend.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyPayment(
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.verifyPayment(dto, user.id);
  }

  /**
   * POST /payments/webhook
   * @Public — Razorpay calls this without a JWT. Signature verification is
   * done inside the service using the X-Razorpay-Signature header and
   * RAZORPAY_WEBHOOK_SECRET. Requires raw body (rawBody:true in main.ts).
   */
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new InternalServerErrorException(
        'Server is misconfigured: rawBody capture is required for webhook verification',
      );
    }
    await this.paymentsService.handleWebhook(rawBody, signature);
    return { received: true };
  }

  /**
   * POST /payments/refund/:bookingId
   * Issues a full refund for the booking. Admin/advisor only.
   */
  @Post('refund/:bookingId')
  @Roles('admin', 'advisor')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  refundPayment(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.paymentsService.refundPayment(bookingId);
  }
}
