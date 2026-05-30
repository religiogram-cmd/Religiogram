import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { UserFile } from './entities/user-file.entity';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { VIRUS_SCAN_QUEUE } from './processors/virus-scan.processor';
import { VirusScanProcessor } from './processors/virus-scan.processor';
import { FileHardeningService } from './file-hardening.service';
import { UploadsCleanerProcessor } from './uploads-cleaner.processor';
import { UploadsCleanerScheduler } from './uploads-cleaner.scheduler';

/**
 * v6 (recovery): uploads.module.ts was truncated in the v3 zip.
 * Reconstructed from sibling-file imports.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserFile]),
    BullModule.registerQueue({ name: VIRUS_SCAN_QUEUE }),
  ],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    FileHardeningService,
    VirusScanProcessor,
    UploadsCleanerProcessor,
    UploadsCleanerScheduler,
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
