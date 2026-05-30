/**
 * OpenTelemetry SDK initialisation — MUST be imported before any other module,
 * especially before NestJS and reflect-metadata, so the auto-instrumentations
 * can patch Node's built-in `http` / `https` modules and axios before they are
 * first required.
 *
 * Usage in main.ts:
 *   import './tracing';          ← first line
 *   import 'reflect-metadata';   ← second line
 *
 * Environment variables consumed:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP/HTTP endpoint (default: http://localhost:4318)
 *   OTEL_SERVICE_NAME            — overrides the service name (default: religiogram-api)
 *   NODE_ENV                     — production ⇒ lower sampler rate (10 %)
 *   OTEL_DISABLED                — set to 'true' to skip all instrumentation (e.g. in unit tests)
 */

// Skip entirely if explicitly disabled (avoids test setup noise).
if (process.env.OTEL_DISABLED === 'true') {
  // Nothing to do — module loaded but SDK not started.
} else {
  // Dynamic require so TypeScript does not hoist these before the guard above.
  // In production builds these packages must be present in node_modules.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NodeSDK }                  = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter }        = require('@opentelemetry/exporter-trace-otlp-http');
  const { Resource }                 = require('@opentelemetry/resources');
  const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT }
    = require('@opentelemetry/semantic-conventions');
  const { TraceIdRatioBasedSampler, ParentBasedSampler }
    = require('@opentelemetry/sdk-trace-base');

  // PR4: KafkaJS instrumentation — adds consumer/producer spans so Kafka
  // message flows are visible in Jaeger. Without this, Kafka processing is a
  // black box: traces end at the producer and never appear in the consumer.
  // Requires: npm i @opentelemetry/instrumentation-kafkajs
  let kafkaJsInstrumentation: any = null;
  try {
    const { KafkaJsInstrumentation } = require('@opentelemetry/instrumentation-kafkajs');
    kafkaJsInstrumentation = new KafkaJsInstrumentation({
      // Propagate W3C traceparent in Kafka message headers.
      // This links producer spans (REST handler) to consumer spans (Kafka worker).
      producerHook: (_span: any, _info: any) => {},
      consumerHook: (_span: any, _info: any) => {},
    });
  } catch {
    // Package not installed — skip gracefully. Trace coverage will be reduced
    // but service will still start. Add @opentelemetry/instrumentation-kafkajs
    // to package.json to enable.
  }
  /* eslint-enable @typescript-eslint/no-var-requires */

  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'religiogram-api';
  const otlpEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
  const isProd = process.env.NODE_ENV === 'production';

  // Production: sample 10 % of root spans (children inherit parent decision).
  // Development: sample everything so local traces are complete.
  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(isProd ? 0.1 : 1.0),
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]:           serviceName,
      [SEMRESATTRS_SERVICE_VERSION]:        process.env.npm_package_version ?? '0.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
    }),
    sampler,
    traceExporter: new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
      // Keep headers minimal — add Authorization here if your collector
      // requires an API key:
      //   headers: { Authorization: `Bearer ${process.env.OTEL_COLLECTOR_TOKEN}` },
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Instrument outbound HTTP/HTTPS calls (covers both axios and node-fetch)
        // so W3C traceparent headers are propagated automatically.
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          // Suppress health-check spans — they are noisy and uninteresting.
          ignoreIncomingRequestHook: (req: { url?: string }) =>
            !!req.url && (req.url === '/health' || req.url === '/metrics'),
        },
        // NestJS uses Express under the hood.
        '@opentelemetry/instrumentation-express': { enabled: true },
        // pg — instrument every SQL query so slow queries show in traces.
        '@opentelemetry/instrumentation-pg': { enabled: true, addSqlCommenterCommentToQueries: true },
        // ioredis — spans for every Redis command.
        '@opentelemetry/instrumentation-ioredis': { enabled: true },
        // Disable noisy fs instrumentation that adds hundreds of low-value spans.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
      // PR4: Include KafkaJS instrumentation if available (see import above).
      ...(kafkaJsInstrumentation ? [kafkaJsInstrumentation] : []),
    ],
  });

  // sdk.start() is synchronous in v1.x / async in some builds — handle both.
  try {
    sdk.start();
  } catch {
    // start() returns a promise in newer SDK versions; swallow the unhandled
    // promise warning — errors will surface in SDK's internal logger.
  }

  // Flush and shut down gracefully so in-flight spans are exported before exit.
  process.on('SIGTERM', () => {
    sdk.shutdown().catch((err: Error) =>
      console.error('OTel SDK shutdown error:', err),
    );
  });
}
