/**
 * XStack Marketplace API Routes
 */

import { RegistryIndex } from '../../services/registry/index.js';

export function setupMarketplaceRoutes(app) {
  const registry = new RegistryIndex();

  // GET /api/v1/marketplace - List marketplace resources
  app.get('/api/v1/marketplace', async (req, res) => {
    try {
      const { category, type, search } = req.query;
      const resources = await registry.searchMarketplace({ category, type, search });
      
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

  // GET /api/v1/marketplace/categories - List all categories
  app.get('/api/v1/marketplace/categories', async (req, res) => {
    try {
      const categories = await registry.listMarketplaceCategories();
      
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

  // GET /api/v1/marketplace/:id - Get marketplace resource details
  app.get('/api/v1/marketplace/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const resource = await registry.getMarketplaceResource(id);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          error: 'Marketplace resource not found',
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

  // POST /api/v1/marketplace/:id/install - Install marketplace resource
  app.post('/api/v1/marketplace/:id/install', async (req, res) => {
    try {
      const { id } = req.params;
      const { config } = req.body;
      const result = await registry.installMarketplaceResource(id, config);
      
      res.status(201).json({
        success: true,
        data: result,
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
}