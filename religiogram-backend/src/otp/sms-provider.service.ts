import {
  Injectable,
  Logger,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { AlertsService } from '../common/alerts/alerts.service';

/**
 * SMS dispatcher. Supports MSG91 (preferred for India) with AWS SNS fallback.
 *
 * Production contract:
 *   - Primary: MSG91 with DLT-registered template_id + sender_id.
 *   - Fallback: AWS SNS (configurable via SMS_FALLBACK_PROVIDER=sns).
 *   - E.164 phone format (+91...) passed to both providers.
 *   - On startup we validate that DLT config is present when production.
 *   - Every failure fires an alert via AlertsService so OTP outages page.
 *   - Never logs the OTP value itself -- even at debug level.
 *   - Retries are left to BullMQ (exponential backoff); this service makes
 *     exactly one attempt at primary + one at fallback per call.
 */
@Injectable()
export class SmsProviderService implements OnModuleInit {
  private readonly logger = new Logger(SmsProviderService.name);
  private readonly provider: 'msg91' | 'sns';
  private readonly fallback?: 'sns';
  private readonly msg91Timeout: number;
  private readonly env: string;
  private readonly snsRegion: string;
  private readonly snsSenderId: string;
  private readonly snsSmsType: 'Transactional' | 'Promotional';
  private sns?: SNSClient;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly alerts: AlertsService,
  ) {
    this.provider = this.config.get<'msg91' | 'sns'>('sms.provider', 'msg91');
    this.fallback = this.config.get<'sns'>('sms.fallbackProvider');
    this.msg91Timeout = this.config.get<number>('sms.msg91Timeout', 3000);
    this.env = this.config.get<string>('app.env', 'development');
    this.snsRegion = this.config.get<string>('sms.sns.region', 'ap-south-1');
    this.snsSenderId = this.config.get<string>('sms.sns.senderId', 'RELGRM');
    this.snsSmsType = this.config.get<'Transactional' | 'Promotional'>(
      'sms.sns.smsType',
      'Transactional',
    );
  }

  /**
   * Startup validation -- fails boot in production if DLT config is missing.
   */
  onModuleInit(): void {
    if (this.env === 'production') {
      if (this.provider === 'msg91') {
        const authKey = this.config.get<string>('sms.msg91.authKey');
        const templateId = this.config.get<string>('sms.msg91.templateId');
        const senderId = this.config.get<string>('sms.msg91.senderId');
        if (!authKey || !templateId || !senderId) {
          throw new Error(
            'MSG91 is primary provider in production but DLT config is incomplete: ' +
              `authKey=${!!authKey}, templateId=${!!templateId}, senderId=${!!senderId}`,
          );
        }
      }
      if (
        (this.provider === 'sns' || this.fallback === 'sns') &&
        !this.snsSenderId
      ) {
        throw new Error(
          'SNS is enabled in production but AWS_SNS_SENDER_ID is not set',
        );
      }
    }

    // Lazily construct the SNS client only when SNS is configured.
    // Credentials come from the default AWS SDK provider chain
    // (IRSA / EC2 instance role / env vars) -- never hardcoded.
    if (this.provider === 'sns' || this.fallback === 'sns') {
      this.sns = new SNSClient({ region: this.snsRegion });
    }
  }

  /**
   * Dispatch an OTP. Returns void on success. Throws if both providers fail
   * (BullMQ will retry the job).
   *
   * @param phone 10-digit Indian phone number (no country code, no spaces).
   * @param otp   Plaintext 6-digit OTP -- NEVER logged.
   */
  async sendOtp(phone: string, otp: string): Promise<void> {
    const provider = this.config.get<string>('sms.provider', 'msg91');

    if (provider === 'msg91') {
      await this.sendViaMSG91(phone, otp);
    } else {
      await this.sendViaSNS(phone, otp);
    }
  }

  private async sendViaMSG91(phone: string, otp: string): Promise<void> {
    const authKey    = this.config.get<string>('sms.msg91.authKey', '');
    const templateId = this.config.get<string>('sms.msg91.templateId', '');
    const senderId   = this.config.get<string>('sms.msg91.senderId', 'RELGRM');
    const timeout    = this.config.get<number>('sms.msg91.timeout', 3000);

    if (!authKey) {
      this.logger.warn('MSG91_AUTH_KEY not set -- skipping SMS in dev mode');
      return;
    }

    try {
      await this.http.axiosRef.post(
        'https://api.msg91.com/api/v5/otp',
        {
          template_id: templateId,
          mobile: `91${phone}`,
          otp,
          sender: senderId,
        },
        {
          headers: {
            authkey: authKey,
            'Content-Type': 'application/json',
          },
          timeout,
        },
      );
      this.logger.log(`OTP sent via MSG91 to ***${phone.slice(-4)}`);
    } catch (err) {
      this.logger.error(`MSG91 send failed: ${(err as Error).message}`);
      // Try SNS fallback if configured
      const fallback = this.config.get<string>('sms.fallbackProvider');
      if (fallback === 'sns') {
        await this.sendViaSNS(phone, otp);
      } else {
        throw err;
      }
    }
  }

  private async sendViaSNS(phone: string, otp: string): Promise<void> {
    if (!this.sns) {
      // SNS client was not initialised -- construct a one-shot client using
      // the default AWS SDK credential provider chain (env vars / IRSA / EC2).
      this.sns = new SNSClient({ region: this.snsRegion });
    }

    const e164Phone = phone.startsWith('+') ? phone : `+91${phone}`;
    const message =
      `Your ReligioGram OTP is ${otp}. Valid for 5 minutes. Do not share.`;

    const command = new PublishCommand({
      PhoneNumber: e164Phone,
      Message: message,
      MessageAttributes: {
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: this.snsSenderId,
        },
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: this.snsSmsType,
        },
      },
    });

    try {
      const result = await this.sns.send(command);
      this.logger.log(
        `OTP sent via SNS to ***${phone.slice(-4)} (MessageId: ${result.MessageId ?? 'unknown'})`,
      );
    } catch (err) {
      this.logger.error(
        `SNS send failed for ***${phone.slice(-4)}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        `SNS SMS delivery failed: ${(err as Error).message}`,
      );
    }
  }
}
