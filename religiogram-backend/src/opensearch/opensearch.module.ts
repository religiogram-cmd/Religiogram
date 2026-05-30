import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';
import { ProviderIndexService } from './provider-index.service';

export const OPENSEARCH_CLIENT = 'OPENSEARCH_CLIENT';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: OPENSEARCH_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Client({
          node: config.get<string>('OPENSEARCH_NODE', 'http://localhost:9200'),
          ssl: { rejectUnauthorized: false },
          requestTimeout: 5000,
        }),
    },
    ProviderIndexService,
  ],
  exports: [OPENSEARCH_CLIENT, ProviderIndexService],
})
export class OpenSearchModule {}
