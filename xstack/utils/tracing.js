/**
 * XStack Tracing Utilities
 * Decorators and helpers for Langfuse integration
 */

import { langfuseService } from '../services/langfuse/index.js';

export function Trace(options = {}) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function(...args) {
      if (!langfuseService.isTracingEnabled()) {
        return originalMethod.apply(this, args);
      }
      const className = target.constructor.name;
      const methodName = propertyKey;
      const trace = langfuseService.client.trace({
        name: options.name || `${className}.${methodName}`,
        tags: { ...options.tags, class: className, method: methodName, source: 'xstack' },
        metadata: { class: className, method: methodName, timestamp: new Date().toISOString() }
      });
      try {
        const result = await originalMethod.apply(this, args);
        trace.end({ output: { success: true } });
        return result;
      } catch (error) {
        trace.error(error);
        trace.end({ output: { success: false, error: error.message } });
        throw error;
      }
    };
    return descriptor;
  };
}

export default Trace;
