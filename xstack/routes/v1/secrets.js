/**
 * XStack Secrets API Routes
 */

import { SecretBroker } from '../../services/secrets/index.js';

export function setupSecretsRoutes(app) {
  const secretBroker = new SecretBroker();

  // GET /api/v1/secrets - List all secrets (metadata only)
  app.get('/api/v1/secrets', async (req, res) => {
    try {
      const secrets = await secretBroker.listSecrets();
      res.json({
        success: true,
        data: secrets,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET /api/v1/secrets/:id - Get secret metadata
  app.get('/api/v1/secrets/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const secret = await secretBroker.getSecretMetadata(id);
      
      if (!secret) {
        return res.status(404).json({
          success: false,
          error: 'Secret not found',
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        data: secret,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // POST /api/v1/secrets - Create new secret
  app.post('/api/v1/secrets', async (req, res) => {
    try {
      const { name, value, category, description } = req.body;
      const secret = await secretBroker.createSecret({ name, value, category, description });
      
      res.status(201).json({
        success: true,
        data: secret,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // PUT /api/v1/secrets/:id - Update secret
  app.put('/api/v1/secrets/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { value, description } = req.body;
      const secret = await secretBroker.updateSecret(id, { value, description });
      
      if (!secret) {
        return res.status(404).json({
          success: false,
          error: 'Secret not found',
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        data: secret,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // DELETE /api/v1/secrets/:id - Remove secret
  app.delete('/api/v1/secrets/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await secretBroker.deleteSecret(id);
      
      res.json({
        success: true,
        message: 'Secret removed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET /api/v1/secrets/categories - List secret categories
  app.get('/api/v1/secrets/categories', async (req, res) => {
    try {
      const categories = await secretBroker.listCategories();
      
      res.json({
        success: true,
        data: categories,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}