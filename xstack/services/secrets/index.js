/**
 * Secrets Management Service
 */

import { v4 as uuidv4 } from 'uuid';

class SecretBroker {
  constructor() {
    this.secrets = new Map();
    this.secretTypes = new Map();
    this.temporaryCredentials = new Map();
    this.auditLog = [];
  }

  async initialize() {
    console.log('🚀 Initializing Secret Broker...');
    await this.loadSecretTypes();
    setInterval(() => this.cleanupTemporaryCredentials(), 3600000);
    console.log('✅ Secret Broker initialized');
  }

  async loadSecretTypes() {
    const types = [
      { name: 'api_keys', description: 'API keys for external services' },
      { name: 'oauth_tokens', description: 'OAuth tokens for service authentication' },
      { name: 'ssh_keys', description: 'SSH keys for secure access' },
      { name: 'certificates', description: 'SSL/TLS certificates and keys' },
      { name: 'environment_variables', description: 'Environment variables for applications' }
    ];
    for (const type of types) this.secretTypes.set(type.name, type);
    console.log(`✅ Loaded ${types.length} secret types`);
  }

  async storeSecret(secretData) {
    const secretId = secretData.id || uuidv4();
    const secretType = this.secretTypes.get(secretData.type);
    if (!secretType) throw new Error(`Secret type ${secretData.type} not found`);

    const secret = {
      id: secretId,
      type: secretData.type,
      name: secretData.name || `secret_${secretId.slice(0, 8)}`,
      description: secretData.description || '',
      encryptedData: secretData.value ? { value: secretData.value } : (secretData.data || {}),
      metadata: secretData.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAccessed: null,
      accessCount: 0
    };

    this.secrets.set(secretId, secret);
    if (!this.secretTypes.has(secretData.type)) this.secretTypes.set(secretData.type, new Set());
    this.secretTypes.get(secretData.type).add(secretId);
    this.logAudit('CREATE', secretId, secretData.type, null);
    console.log(`🔒 Stored secret: ${secretId}`);
    return { success: true, secretId, name: secret.name };
  }

  async retrieveSecret(secretId, requester = null) {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret ${secretId} not found`);
    secret.lastAccessed = new Date().toISOString();
    secret.accessCount++;
    this.logAudit('READ', secretId, secret.type, requester);
    return {
      success: true,
      secret: {
        id: secret.id,
        name: secret.name,
        type: secret.type,
        description: secret.description,
        data: secret.encryptedData,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
        lastAccessed: secret.lastAccessed,
        accessCount: secret.accessCount
      }
    };
  }

  async generateTemporaryCredentials(serviceId, secretId, duration = 3600) {
    const tempCredId = uuidv4();
    const expiresAt = new Date(Date.now() + duration * 1000);
    const secretResult = await this.retrieveSecret(secretId);
    if (!secretResult.success) throw new Error(`Failed to retrieve secret: ${secretId}`);

    const tempCreds = {
      id: tempCredId,
      serviceId,
      secretId,
      credentials: { ...secretResult.secret.data, temporary: true },
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      used: false
    };

    this.temporaryCredentials.set(tempCredId, tempCreds);
    this.logAudit('TEMP_CREDENTIALS', secretId, secretResult.secret.type, serviceId);
    console.log(`🔑 Generated temporary credentials: ${tempCredId}`);
    return {
      success: true,
      temporaryCredentials: {
        id: tempCredId,
        serviceId,
        credentials: tempCreds.credentials,
        expiresAt: tempCreds.expiresAt
      }
    };
  }

  cleanupTemporaryCredentials() {
    const now = new Date();
    for (const [id, creds] of this.temporaryCredentials.entries()) {
      if (new Date(creds.expiresAt) < now) this.temporaryCredentials.delete(id);
    }
  }

  logAudit(action, secretId, secretType, requester) {
    const auditEntry = { id: uuidv4(), action, secretId, secretType, requester, timestamp: new Date().toISOString() };
    this.auditLog.push(auditEntry);
    if (this.auditLog.length > 1000) this.auditLog.shift();
  }

  getAuditLog(limit = 100) {
    return { success: true, auditLog: this.auditLog.slice(-limit), totalEntries: this.auditLog.length };
  }

  listSecretsByType(type) {
    const secretIds = this.secretTypes.get(type) || new Set();
    const secrets = Array.from(secretIds.values()).map(id => this.secrets.get(id)).filter(Boolean);
    return {
      success: true,
      type,
      secrets: secrets.map(s => ({
        id: s.id, name: s.name, description: s.description, type: s.type,
        createdAt: s.createdAt, updatedAt: s.updatedAt, lastAccessed: s.lastAccessed, accessCount: s.accessCount
      })),
      count: secrets.length
    };
  }

  async updateSecret(secretId, updates) {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret ${secretId} not found`);
    Object.assign(secret, updates, { updatedAt: new Date().toISOString() });
    this.logAudit('UPDATE', secretId, secret.type, null);
    return { success: true, secret: { id: secret.id, name: secret.name, type: secret.type, updatedAt: secret.updatedAt } };
  }

  async deleteSecret(secretId) {
    const secret = this.secrets.get(secretId);
    if (!secret) throw new Error(`Secret ${secretId} not found`);
    this.secrets.delete(secretId);
    if (this.secretTypes.has(secret.type)) this.secretTypes.get(secret.type).delete(secretId);
    this.logAudit('DELETE', secretId, secret.type, null);
    return { success: true, message: `Secret ${secretId} deleted` };
  }

  getStats() {
    return {
      success: true,
      totalSecrets: this.secrets.size,
      secretTypes: Object.fromEntries(Array.from(this.secretTypes.entries()).map(([type, ids]) => [type, ids.size])),
      activeTempCredentials: this.temporaryCredentials.size,
      auditLogEntries: this.auditLog.length
    };
  }
}

const secretBroker = new SecretBroker();

export const initializeSecretBroker = async (app) => {
  await secretBroker.initialize();
  app.set('secretBroker', secretBroker);
  return secretBroker;
};

export default secretBroker;