import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
    | { functionCall?: any }
    | { functionResponse?: any }
  >;
}

export interface GeminiStreamChunk {
  event: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
  token?: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  callId?: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface GeminiTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}


/** Minimal typed shim for the dynamically-imported @google/generative-ai package. */
interface GeminiSdkModule {
  GoogleGenerativeAI: new (apiKey: string) => {
    getGenerativeModel(config: Record<string, unknown>): GeminiModel;
  };
  HarmCategory: Record<string, string>;
  HarmBlockThreshold: Record<string, string>;
}

interface GeminiModel {
  startChat(opts: Record<string, unknown>): GeminiChat;
  generateContent(prompt: string, opts?: Record<string, unknown>): Promise<{ response: { text(): string } }>;
}

interface GeminiChat {
  sendMessageStream(parts: unknown[], opts?: Record<string, unknown>): Promise<{
    stream: AsyncIterable<GeminiChunk>;
    response: Promise<{ usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }>;
  }>;
}

interface GeminiChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }>;
    };
  }>;
}

/**
 * Wraps @google/generative-ai SDK.
 * Flash model = default; Pro model = deep astrology / vision routing.
 */
@Injectable()
export class GeminiAdapterService {
  private readonly logger = new Logger(GeminiAdapterService.name);
  private readonly flashModel: string;
  private readonly proModel: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey    = config.get<string>('GEMINI_API_KEY', '');
    this.flashModel = config.get<string>('GEMINI_FLASH_MODEL', 'gemini-2.5-flash');
    this.proModel   = config.get<string>('GEMINI_PRO_MODEL',   'gemini-2.5-pro');
  }

  /** Returns a readable stream of GeminiStreamChunk objects */
  async *streamChat(opts: {
    messages: GeminiMessage[];
    systemPrompt?: string;
    tools?: GeminiTool[];
    usePro?: boolean;
    safetyThreshold?: 'BLOCK_LOW_AND_ABOVE' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_NONE';
    maxTokens?: number;
  }): AsyncGenerator<GeminiStreamChunk> {
    const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = await import('@google/generative-ai') as unknown as GeminiSdkModule;
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const modelName = opts.usePro ? this.proModel : this.flashModel;
    const threshold = opts.safetyThreshold ?? 'BLOCK_LOW_AND_ABOVE';

    const safetySettings = [
      HarmCategory.HARM_CATEGORY_HARASSMENT,
      HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    ].map(category => ({ category, threshold: HarmBlockThreshold[threshold] }));

    const modelConfig: Record<string, unknown> = {
      model: modelName,
      safetySettings,
    };

    if (opts.systemPrompt) {
      modelConfig.systemInstruction = opts.systemPrompt;
    }

    if (opts.tools && opts.tools.length > 0) {
      modelConfig.tools = [{
        functionDeclarations: opts.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];
    }

    const model = genAI.getGenerativeModel(modelConfig);

    // Split messages into history (all but last) + current
    const history = opts.messages.slice(0, -1);
    const lastMsg = opts.messages[opts.messages.length - 1];

    const chat = model.startChat({
      history,
      ...(opts.maxTokens ? { generationConfig: { maxOutputTokens: opts.maxTokens } } : {}),
    });

    // AI2: Wrap the streaming call with a 25-second AbortSignal timeout.
    // Without this, a stalled Gemini stream (e.g. network partition mid-response)
    // can pin the Node.js event loop indefinitely — the SDK default keepalive
    // is ~10 minutes. 25s covers the p99 streaming latency for Flash.
    const streamAbort = AbortSignal.timeout(25_000);
    try {
      const result = await chat.sendMessageStream(lastMsg.parts, { signal: streamAbort });
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of result.stream) {
        const candidate = chunk.candidates?.[0];
        if (!candidate) continue;

        for (const part of (candidate.content?.parts ?? [])) {
          const p = part as { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } };
          if (p.text) {
            yield { event: 'token', token: p.text };
          } else if (p.functionCall) {
            const fc = p.functionCall;
            yield {
              event: 'tool_call',
              toolName: fc.name,
              toolArgs: (fc.args ?? {}) as Record<string, unknown>,
              callId: fc.name + '_' + Date.now(),
            };
          }
        }
      }

      const response = await result.response;
      const usage = response.usageMetadata;
      if (usage) {
        inputTokens  = usage.promptTokenCount ?? 0;
        outputTokens = usage.candidatesTokenCount ?? 0;
      }

      yield { event: 'done', usage: { inputTokens, outputTokens } };
    } catch (err: unknown) {
      const e = err as { message?: string };
      this.logger.error('Gemini stream error', e?.message);
      // Check if safety-blocked
      if (e?.message?.includes('SAFETY') || e?.message?.includes('safety')) {
        yield { event: 'error', error: 'safety_blocked' };
      } else {
        yield { event: 'error', error: e?.message ?? 'unknown' };
      }
    }
  }

  /** Single-shot completion (for classifiers, summarisers) — no streaming */
  async complete(opts: {
    prompt: string;
    usePro?: boolean;
    maxTokens?: number;
  }): Promise<string> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai') as unknown as GeminiSdkModule;
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const modelName = opts.usePro ? this.proModel : this.flashModel;
    const model = genAI.getGenerativeModel({ model: modelName });
    // AI2: Wrap single-shot calls with a 5-second AbortSignal timeout.
    // Classifiers and summarisers are expected to be fast; 5 s is generous.
    const completeAbort = AbortSignal.timeout(5_000);
    try {
      const result = await model.generateContent(
        opts.prompt,
        {
          ...(opts.maxTokens ? { generationConfig: { maxOutputTokens: opts.maxTokens } } : {}),
          signal: completeAbort,
        },
      );
      return result.response.text() ?? '';
    } catch (err: unknown) {
      this.logger.error('Gemini complete error', (err as { message?: string })?.message);
      return '';
    }
  }
}
