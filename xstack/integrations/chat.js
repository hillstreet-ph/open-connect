/**
 * XStack Chat Integration
 * Handles chat command routing and execution
 */

import { getCommand } from '../config/commands.js';
import { ResourceResolver } from '../services/resolver/index.js';
import { RegistryIndex } from '../services/registry/index.js';
import { ConnectionManager } from '../services/connections/index.js';
import { SecretBroker } from '../services/secrets/index.js';

export class ChatIntegration {
  constructor() {
    this.resolver = new ResourceResolver();
    this.registry = new RegistryIndex();
    this.connectionManager = new ConnectionManager();
    this.secretBroker = new SecretBroker();
  }

  /**
   * Process chat command
   * @param {string} command - The command to process
   * @param {object} context - Additional context (user, session, etc.)
   * @returns {Promise<object>} - Command result
   */
  async processCommand(command, context = {}) {
    const cmd = getCommand(command);
    
    if (!cmd) {
      return {
        success: false,
        error: `Unknown command: ${command}`,
        availableCommands: Object.keys(getCommand).filter(k => !k.startsWith('/xstack'))
      };
    }

    switch (cmd.action) {
      case 'open_page':
        return this.handleOpenPage(cmd, context);
      case 'api_call':
        return this.handleApiCall(cmd, context);
      default:
        return {
          success: false,
          error: `Unknown action: ${cmd.action}`
        };
    }
  }

  /**
   * Handle open page command
   */
  async handleOpenPage(cmd, context) {
    // In a real implementation, this would redirect the user or open a UI page
    return {
      success: true,
      action: 'open_page',
      target: cmd.target,
      name: cmd.name,
      description: cmd.description
    };
  }

  /**
   * Handle API call command
   */
  async handleApiCall(cmd, context) {
    // Implementation would make API calls to various services
    return {
      success: true,
      action: 'api_call',
      endpoint: cmd.endpoint,
      message: `API call to ${cmd.endpoint} executed`
    };
  }

  /**
   * List all available commands
   */
  listCommands() {
    const commands = getCommand();
    const commandList = [];
    
    for (const [cmd, config] of Object.entries(commands)) {
      if (cmd.startsWith('/')) {
        commandList.push({
          command: cmd,
          name: config.name,
          description: config.description,
          category: config.category
        });
      }
    }
    
    return commandList;
  }

  /**
   * Get command help
   */
  getHelp(command = null) {
    const commands = getCommand();
    
    if (command) {
      const cmd = commands[command];
      if (!cmd) {
        return { success: false, error: `Command not found: ${command}` };
      }
      return {
        success: true,
        command,
        name: cmd.name,
        description: cmd.description,
        usage: command,
        category: cmd.category
      };
    }
    
    // Return all commands grouped by category
    const help = {
      success: true,
      categories: {}
    };
    
    for (const [cmd, config] of Object.entries(commands)) {
      if (cmd.startsWith('/')) {
        if (!help.categories[config.category]) {
          help.categories[config.category] = [];
        }
        help.categories[config.category].push({
          command: cmd,
          name: config.name,
          description: config.description
        });
      }
    }
    
    return help;
  }
}

export default new ChatIntegration();