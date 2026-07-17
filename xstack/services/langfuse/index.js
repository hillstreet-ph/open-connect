/**
 * XStack Langfuse Integration
 * AI Engineering Platform for Tracing, Observability, and Evaluation
 * 
 * Integrates Langfuse for:
 * - LLM Application Tracing
 * - Prompt Management
 * - Evaluation & Monitoring
 * - Session Tracking
 * - Cost & Latency Analysis
 */

import { Langfuse } from 'langfuse';

// Initialize Langfuse client
const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || 'https://us.cloud.langfuse.com',
  debug: process.env.NODE_ENV === 'development'
});

/**
 * Langfuse Service for XStack
 * Provides tracing, observability, and evaluation capabilities
 */
export class LangfuseService {
  constructor() {
    this.client = langfuse;
    this.tracingEnabled = process.env.LANGFUSE_TRACING_ENABLED !== 'false';
    this.evaluationEnabled = process.env.LANGFUSE_EVALUATION_ENABLED !== 'false';
  }

  isConfigured() {
    return !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
  }

  isTracingEnabled() {
    return this.tracingEnabled && this.isConfigured();
  }

  isEvaluationEnabled() {
    return this.evaluationEnabled && this.isConfigured();
  }

  async createTrace(options) {
    if (!this.isTracingEnabled()) {
      return { trace: null, span: null, isEnabled: false };
    }
    const { name, userId, sessionId, version, tags = {}, metadata = {} } = options;
    try {
      const trace = this.client.trace({
        name,
        userId,
        sessionId,
        version,
        tags: { ...tags, source: 'xstack' },
        metadata: { ...metadata, environment: process.env.NODE_ENV }
      });
      return { trace, span: null, isEnabled: true };
    } catch (error) {
      console.error('Langfuse trace creation error:', error.message);
      return { trace: null, span: null, isEnabled: false, error: error.message };
    }
  }