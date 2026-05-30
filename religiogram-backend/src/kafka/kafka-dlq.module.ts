import { Global, Module } from '@nestjs/common';
import { KafkaDlqService } from './kafka-dlq.service';

@Global()
@Module({
  providers: [KafkaDlqService],
  exports:   [KafkaDlqService],
})
export class KafkaDlqModule {}
