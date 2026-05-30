import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationSubmission } from './entities/verification-submission.entity';
import { Provider } from '../service-providers/entities/provider.entity';
import { VerificationDocument } from './entities/verification-document.entity';
import { AdminReviewNote } from './entities/admin-review-note.entity';
import { VerificationReviewQueue } from './entities/verification-review-queue.entity';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VerificationSubmission,
      VerificationDocument,
      AdminReviewNote,
      VerificationReviewQueue,, Provider]),
    UsersModule,
  ],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
