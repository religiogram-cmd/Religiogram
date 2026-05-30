/**
 * PR4: BullMQ OpenTelemetry instrumentation base class.
 *
 * BullMQ has no official OTel instrumentation package (unlike KafkaJS), so we
 * manually wrap the WorkerHost.process() method with a span. Any processor that
 * extends TracedWorkerHost gets:
 *
 *   • A root span per job (name = "<queue> process <jobName>")
 *   • Span attributes: queue, job.id, job.name, job.attempt
 *   • W3C traceparent propagation: if the enqueuer stored a traceparent in
 *     job.data.__traceparent, the span is linked as a child of that context
 *   • Automatic error recording + span status on failure
 *
 * Usage:
 *   @Processor('refunds')
 *   export class RefundProcessor extends TracedWorkerHost {
 *     protected async tracedProcess(job: Job<...>): Promise<void> { ... }
 *   }
 */

import { Logger } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

// Lazy-load OTel to avoid crashing when the package is absent (test env)
let otelApi: any = null;
let otelCore: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  otelApi = require('@opentelemetry/api');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  otelCore = require('@opentelemetry/core');
} catch {
  // OTel not installed — all methods become no-ops
}

export abstract class TracedWorkerHost extends WorkerHost {
  // Deliberately not exported to NestJS DI — internal logger only
  private readonly _tracingLogger = new Logger('BullMQOTel');

  /**
   * Subclasses implement this instead of process().
   * Called inside an active OTel span when tracing is enabled.
   */
  protected abstract tracedProcess(job: Job<any>): Promise<any>;

  /** @override — subclasses must NOT re-override process(); use tracedProcess() */
  override async process(job: Job<any>): Promise<any> {
    if (!otelApi) {
      return this.tracedProcess(job);
    }

    const tracer = otelApi.trace.getTracer('bullmq');
    const queueName: string = (this as unknown as { queueName?: string }).queueName ?? job.queueName ?? 'unknown';
    const spanName = `${queueName} process ${job.name}`;

    // PR4: propagate W3C traceparent if the producer stored it in job.data.
    let parentCtx = otelApi.context.active();
    const storedTraceparent: string | undefined = (job.data as Record<string, unknown>)?.__traceparent as string | undefined;
    if (storedTraceparent && otelCore?.W3CTraceContextPropagator) {
      try {
        const carrier = { traceparent: storedTraceparent };
        const propagator = new otelCore.W3CTraceContextPropagator();
        parentCtx = propagator.extract(otelApi.context.active(), carrier,
          otelCore.defaultTextMapGetter ?? {
            get: (c: any, k: string) => c[k],
            keys: (c: any) => Object.keys(c),
          });
      } catch {
        /* non-fatal */
      }
    }

    const span = tracer.startSpan(spanName, {
      kind: otelApi.SpanKind.CONSUMER,
      attributes: {
        'messaging.system':          'bullmq',
        'messaging.destination':     queueName,
        'messaging.operation':       'process',
        'bullmq.job.id':             String(job.id ?? ''),
        'bullmq.job.name':           job.name,
        'bullmq.job.attempt_number': job.attemptsMade,
      },
    }, parentCtx);

    return otelApi.context.with(otelApi.trace.setSpan(parentCtx, span), async () => {
      try {
        const result = await this.tracedProcess(job);
        span.setStatus({ code: otelApi.SpanStatusCode.OK });
        return result;
      } catch (err: any) {
        span.setStatus({ code: otelApi.SpanStatusCode.ERROR, message: String(err?.message ?? err) });
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        span.end();
      }
    });
  }
}
