import {
  BadRequestException, Body, Controller, ForbiddenException, Get,
  HttpCode, HttpStatus, Post, Query, Request, Res, UseGuards,
} from "@nestjs/common";
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { IsInt, IsPositive, Max, Min } from "class-validator";
import { WalletService } from "./wallet.service";
import { RechargeWalletDto } from "./dto/recharge-wallet.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PaymentsService } from "../payments/payments.service";
import { PaymentStatus } from "../payments/entities/payment.entity";
import { ConfigService } from "@nestjs/config";
import { UserThrottle, UserThrottleGuard } from "../common/guards/user-throttle.guard";

/** Min \u201910 top-up, max \u201950,000 per transaction */
class TopUpOrderDto {
  @IsInt()
  @IsPositive()
  @Min(1_000)     // \u201910 in paise
  @Max(5_000_000) // \u201950,000 in paise
  amountPaise!: number;
}

@ApiTags("Wallet")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'wallet', version: '1' })
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Get("balance")
  @ApiOperation({ summary: "Get wallet balance" })
  getBalance(@Request() req: any) {
    return this.wallet.getBalance(req.user.sub);
  }

  /**
   * POST /wallet/topup/order
   * Create a Razorpay order for a wallet top-up.
   * Returns { razorpayOrderId, amountPaise, currency, keyId } — passed directly
   * to the Razorpay checkout SDK on the frontend.
   *
   * Min \u201910 / max \u201950,000 per transaction.
   * After successful payment the frontend calls POST /wallet/recharge with
   * the captured paymentId to actually credit the wallet.
   */
  @Post("topup/order")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(UserThrottleGuard)
  @UserThrottle(5, 60, 'wallet-topup-order')  // 5 orders / min per user
  @ApiOperation({ summary: "Create Razorpay order for wallet top-up" })
  async createTopUpOrder(@Request() req: any, @Body() dto: TopUpOrderDto) {
    const userId = req.user.sub as string;
    return this.payments.createTopUpOrder(userId, dto.amountPaise);
  }

  @Post("recharge")
  @UseGuards(UserThrottleGuard)
  @UserThrottle(10, 60, 'wallet-recharge')   // 10 confirmations / min per user
  @ApiOperation({ summary: "Credit wallet after a verified Razorpay capture" })
  async recharge(@Request() req: any, @Body() dto: RechargeWalletDto) {
    const userId = req.user.sub as string;

    const payment = await this.payments.findByPaymentId(dto.paymentId);
    if (!payment) throw new BadRequestException("Unknown payment id");
    if (payment.userId !== userId) throw new ForbiddenException("Payment does not belong to you");
    if (payment.status !== PaymentStatus.CAPTURED) {
      throw new BadRequestException(`Payment is not captured (status=${payment.status})`);
    }

    // P2-6: trust-zero — ignore any client-supplied amount.
    // The authoritative amount is the Razorpay-captured figure stored in
    // payment.amountPaise; we never let the client dictate how much to credit.
    const creditPaise = payment.amountPaise;

    return this.wallet.credit(userId, {
      amount: creditPaise,
      referenceId: dto.paymentId,
      referenceType: "payment",
      idempotencyKey: `recharge-${dto.paymentId}`,
      description: `Wallet recharge ₹${(creditPaise / 100).toFixed(2)}`,
    });
  }

  @Get("transactions")
  @ApiOperation({ summary: "Cursor-paginated ledger history" })
  transactions(
    @Request() req: any,
    @Query("cursor") cursor?: string,
    @Query("limit") limit = "20",
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.wallet.getTransactions(req.user.sub, cursor, +limit, from, to);
  }

  /**
   * GET /wallet/transactions/export.csv?from=ISO&to=ISO
   * P3: DPDP Act right-to-access — full ledger history as CSV download.
   * Capped at 10 000 rows. Useful for user data-portability requests.
   */
  @Get("transactions/export.csv")
  @ApiOperation({ summary: "Export ledger history as CSV (DPDP compliance)" })
  async exportTransactionsCsv(
    @Request() req: any,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const csv = await this.wallet.exportTransactionsCsv(req.user.sub, from, to);
    const filename = `wallet-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    });
    res.send(csv);
  }
}
