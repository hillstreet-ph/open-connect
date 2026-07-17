/**
 * XStack Resources API Routes
 */

import { ResourceResolver } from '../../services/resolver/index.js';
import { RegistryIndex } from '../../services/registry/index.js';

export function setupResourcesRoutes(app) {
  const resolver = new ResourceResolver();
  const registry = new RegistryIndex();

  app.get('/api/v1/resources', async (req, res) => {
    try {
      const resources = await registry.listResources();
      res.json({
        success: true,
        data: resources,
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

  app.get('/api/v1/resources/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const resource = await resolver.resolveResource(id);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found',
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        data: resource,
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

  app.post('/api/v1/resources', async (req, res) => {
    try {
      const resourceData = req.body;
      const resource = await registry.registerResource(resourceData);
      
      res.status(201).json({
        success: true,
        data: resource,
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

  app.delete('/api/v1/resources/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await registry.unregisterResource(id);
      
      res.json({
        success: true,
        message: 'Resource removed successfully',
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