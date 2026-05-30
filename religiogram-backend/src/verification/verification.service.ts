import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  VerificationSubmission,
  VerificationStatus,
} from './entities/verification-submission.entity';
import { Provider } from '../service-providers/entities/provider.entity';
import {
  VerificationDocument,
  DocType,
} from './entities/verification-document.entity';
import { AdminReviewNote } from './entities/admin-review-note.entity';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @InjectRepository(VerificationSubmission)
    private readonly submissionRepo: Repository<VerificationSubmission>,
    @InjectRepository(VerificationDocument)
    private readonly docRepo: Repository<VerificationDocument>,
    @InjectRepository(AdminReviewNote)
    private readonly noteRepo: Repository<AdminReviewNote>,
    @InjectRepository(Provider)
    private readonly providerRepo: Repository<Provider>,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
  ) {}

  async createSubmission(providerId: string): Promise<VerificationSubmission> {
    const existing = await this.submissionRepo.findOne({
      where: { providerId, status: VerificationStatus.DRAFT },
    });
    if (existing) return existing;

    const submission = this.submissionRepo.create({
      providerId,
      status: VerificationStatus.DRAFT,
      version: 1,
    });
    return this.submissionRepo.save(submission);
  }

  async addDocument(
    submissionId: string,
    callerId: string,
    docType: DocType,
    s3Key: string,
    s3Bucket: string,
    contentHash: string,
  ): Promise<VerificationDocument> {
    const submission = await this.getSubmission(submissionId);
    // Ownership check — only the provider who created this submission can add documents
    if (submission.providerId !== callerId) {
      throw new ForbiddenException('You do not own this verification submission');
    }
    if (
      submission.status !== VerificationStatus.DRAFT &&
      submission.status !== VerificationStatus.MORE_INFO
    ) {
      throw new BadRequestException(
        'Documents can only be added to DRAFT or MORE_INFO_NEEDED submissions',
      );
    }

    const doc = this.docRepo.create({
      submissionId,
      type: docType,
      s3Key,
      s3Bucket,
      contentHash,
      uploadedAt: new Date(),
      isVerified: false,
    });
    return this.docRepo.save(doc);
  }

  async submit(
    submissionId: string,
    providerId: string,
  ): Promise<VerificationSubmission> {
    const submission = await this.getSubmission(submissionId);
    if (submission.providerId !== providerId) {
      throw new ForbiddenException('Not your submission');
    }
    if (
      submission.status !== VerificationStatus.DRAFT &&
      submission.status !== VerificationStatus.MORE_INFO
    ) {
      throw new BadRequestException(
        'Only DRAFT or MORE_INFO_NEEDED submissions can be submitted',
      );
    }

    // Enforce minimum required document types before submission
    const requiredTypes: DocType[] = [DocType.AADHAAR, DocType.PHOTO];
    const uploadedTypes = (submission.documents ?? []).map((d) => d.type);
    const missing = requiredTypes.filter((t) => !uploadedTypes.includes(t));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required documents: ${missing.join(', ')}. Please upload all required documents before submitting.`,
      );
    }

    submission.status = VerificationStatus.SUBMITTED;
    submission.submittedAt = new Date();
    return this.submissionRepo.save(submission);
  }

  async getSubmission(submissionId: string): Promise<VerificationSubmission> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ['documents', 'notes'],
    });
    if (!submission) {
      throw new NotFoundException(
        `Submission ${submissionId} not found`,
      );
    }
    return submission;
  }

  async getByProvider(
    providerId: string,
  ): Promise<VerificationSubmission[]> {
    return this.submissionRepo.find({
      where: { providerId },
      relations: ['documents', 'notes'],
      order: { createdAt: 'DESC' },
    });
  }

  async approve(
    submissionId: string,
    adminId: string,
  ): Promise<VerificationSubmission> {
    const submission = await this.getSubmission(submissionId);
    if (
      submission.status !== VerificationStatus.SUBMITTED &&
      submission.status !== VerificationStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        'Only SUBMITTED or UNDER_REVIEW submissions can be approved',
      );
    }

    submission.status = VerificationStatus.APPROVED;
    submission.reviewedAt = new Date();
    submission.reviewerId = adminId;
    const saved = await this.submissionRepo.save(submission);
    // Update provider's isVerified flag so they appear in discovery
    await this.providerRepo.update(
      { id: submission.providerId },
      { isVerified: true, verificationStatus: 'VERIFIED' },
    ).catch((err) => this.logger.error('Failed to update provider isVerified', err));
    // Fire-and-forget KYC approval email
    this.usersService.findById(submission.providerId).then((user) => {
      if (user?.email) {
        this.emailService
          .sendKycStatus(user.email, { userName: user.name ?? user.email, status: 'approved' })
          .catch(() => {});
      }
    }).catch((err) => this.logger.error('KYC approve email lookup failed', err));
    return saved;
  }

  async reject(
    submissionId: string,
    adminId: string,
    reason: string,
  ): Promise<VerificationSubmission> {
    const submission = await this.getSubmission(submissionId);
    if (
      submission.status !== VerificationStatus.SUBMITTED &&
      submission.status !== VerificationStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        'Only SUBMITTED or UNDER_REVIEW submissions can be rejected',
      );
    }

    submission.status = VerificationStatus.REJECTED;
    submission.reviewedAt = new Date();
    submission.reviewerId = adminId;
    submission.rejectionReason = reason;
    const saved = await this.submissionRepo.save(submission);
    // Fire-and-forget KYC rejection email
    this.usersService.findById(submission.providerId).then((user) => {
      if (user?.email) {
        this.emailService
          .sendKycStatus(user.email, { userName: user.name ?? user.email, status: 'rejected', rejectionReason: reason })
          .catch(() => {});
      }
    }).catch((err) => this.logger.error('KYC reject email lookup failed', err));
    return saved;
  }

  async requestMoreInfo(
    submissionId: string,
    adminId: string,
    note: string,
  ): Promise<VerificationSubmission> {
    const submission = await this.getSubmission(submissionId);
    if (
      submission.status !== VerificationStatus.SUBMITTED &&
      submission.status !== VerificationStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        'Only SUBMITTED or UNDER_REVIEW submissions can be queried for more info',
      );
    }

    await this.addNote(submissionId, adminId, note);
    submission.status = VerificationStatus.MORE_INFO;
    submission.reviewerId = adminId;
    return this.submissionRepo.save(submission);
  }

  async addNote(
    submissionId: string,
    authorId: string,
    text: string,
  ): Promise<AdminReviewNote> {
    const note = this.noteRepo.create({ submissionId, adminId: authorId, note: text });
    return this.noteRepo.save(note);
  }

    async getPendingQueue(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<VerificationSubmission>> {
    const [data, total] = await this.submissionRepo.findAndCount({
      where: {
        status: In([
          VerificationStatus.SUBMITTED,
          VerificationStatus.UNDER_REVIEW,
        ]),
      },
      order: { submittedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['documents'],
    });
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
