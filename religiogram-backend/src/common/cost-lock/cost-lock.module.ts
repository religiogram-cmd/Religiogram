import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CostLockService } from './cost-lock.service';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [RedisModule, HttpModule],
  providers: [CostLockService],
  exports:   [CostLockService],
})
export class CostLockModule {}
