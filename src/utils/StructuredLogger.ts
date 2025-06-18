export interface StructuredLogEvent {
  timestamp: string; // ISO8601Timestamp
  level: "info" | "warn" | "error" | "debug";
  agentClass: string;
  agentId: string;
  traceId: string;
  eventType: string;
  message: string;
  data?: object;
}

export interface AiServiceMetrics {
  service: 'workers-ai' | 'vectorize' | 'ai-gateway';
  model?: string;
  operation: string;
  latencyMs: number;
  tokenCount?: number;
  estimatedCost?: number;
  success: boolean;
  errorCode?: string;
}

export class StructuredLogger {
  private agentClass: string;
  private agentId: string;
  private traceId: string;

  constructor(agentClass: string, agentId: string, traceId?: string) {
    this.agentClass = agentClass;
    this.agentId = agentId;
    this.traceId = traceId || StructuredLogger.generateTraceId();
  }

  private log(level: StructuredLogEvent['level'], eventType: string, message: string, data?: object) {
    const logEvent: StructuredLogEvent = {
      timestamp: new Date().toISOString(),
      level,
      agentClass: this.agentClass,
      agentId: this.agentId,
      traceId: this.traceId,
      eventType,
      message,
      ...(data && { data })
    };

    console.log(JSON.stringify(logEvent));
  }

  info(eventType: string, message: string, data?: object) {
    this.log('info', eventType, message, data);
  }

  warn(eventType: string, message: string, data?: object) {
    this.log('warn', eventType, message, data);
  }

  error(eventType: string, message: string, data?: object) {
    this.log('error', eventType, message, data);
  }

  debug(eventType: string, message: string, data?: object) {
    this.log('debug', eventType, message, data);
  }

  logAiServiceCall(metrics: AiServiceMetrics) {
    const eventType = `ai.${metrics.service}.${metrics.operation}`;
    const level = metrics.success ? 'info' : 'error';
    const message = `${metrics.service} ${metrics.operation} ${metrics.success ? 'completed' : 'failed'}`;
    
    const data: Record<string, any> = {
      service: metrics.service,
      operation: metrics.operation,
      latencyMs: metrics.latencyMs,
      success: metrics.success
    };

    if (metrics.model) data.model = metrics.model;
    if (metrics.tokenCount) data.tokenCount = metrics.tokenCount;
    if (metrics.estimatedCost) data.estimatedCost = metrics.estimatedCost;
    if (metrics.errorCode) data.errorCode = metrics.errorCode;

    this.log(level, eventType, message, data);
  }

  withTraceId(traceId: string): StructuredLogger {
    return new StructuredLogger(this.agentClass, this.agentId, traceId);
  }

  static generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static estimateWorkerAiCost(model: string, tokenCount: number): number {
    const pricing: Record<string, number> = {
      '@cf/meta/llama-2-7b-chat-int8': 0.0001,
      '@cf/huggingface/distilbert-sst-2-int8': 0.00005,
      '@cf/baai/bge-base-en-v1.5': 0.00002
    };

    const pricePerToken = pricing[model] || 0.0001;
    return tokenCount * pricePerToken;
  }

  static estimateVectorizeCost(operation: string, vectorCount: number): number {
    const pricing = {
      insert: 0.000001,
      query: 0.000001,
      delete: 0.0000005
    };

    const pricePerVector = pricing[operation as keyof typeof pricing] || 0.000001;
    return vectorCount * pricePerVector;
  }

  static estimateAiGatewayCost(model: string, tokenCount: number): number {
    const pricing: Record<string, number> = {
      'gpt-3.5-turbo': 0.002,
      'gpt-4': 0.03,
      'claude-3-sonnet': 0.015,
      'claude-3-haiku': 0.0025
    };

    const pricePerToken = pricing[model] || 0.002;
    return tokenCount * pricePerToken;
  }
}