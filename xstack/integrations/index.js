/**
 * XStack Integrations Hub
 * Central integration management
 */

import { ChatIntegration } from './chat.js';

export class IntegrationHub {
  constructor() {
    this.chat = new ChatIntegration();
    this.integrations = {
      chat: this.chat
    };
  }

  /**
   * Initialize all integrations
   */
  async initialize() {
    console.log('Initializing XStack integrations...');
    
    // Initialize each integration
    for (const [name, integration] of Object.entries(this.integrations)) {
      try {
        if (typeof integration.initialize === 'function') {
          await integration.initialize();
        }
        console.log(`✅ Integration initialized: ${name}`);
      } catch (error) {
        console.error(`❌ Failed to initialize integration ${name}:`, error.message);
      }
    }
    
    console.log('XStack integrations initialized successfully');
  }

  /**
   * Process integration request
   * @param {string} integrationName - Name of the integration
   * @param {string} method - Method to call
   * @param {object} args - Arguments for the method
   */
  async process(integrationName, method, args = {}) {
    const integration = this.integrations[integrationName];
    
    if (!integration) {
      throw new Error(`Integration not found: ${integrationName}`);
    }
    
    if (typeof integration[method] !== 'function') {
      throw new Error(`Method not found: ${method} on integration ${integrationName}`);
    }
    
    return integration[method](...Object.values(args));
  }

  /**
   * Get integration
   */
  getIntegration(name) {
    return this.integrations[name];
  }

  /**
   * List all integrations
   */
  listIntegrations() {
    return Object.keys(this.integrations);
  }
}

export default new IntegrationHub();