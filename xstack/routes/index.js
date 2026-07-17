/**
 * XStack Routes Configuration
 */

import { Router } from 'express';

const router = Router();

// API routes will be added dynamically
router.get('/', (req, res) => {
  res.json({
    message: 'Welcome to XStack Gateway',
    version: process.env.GATEWAY_VERSION || '1.0.0',
    endpoints: {
      health: '/health',
      resources: '/api/v1/resources',
      connections: '/api/v1/connections',
      marketplace: '/api/v1/marketplace',
      secrets: '/api/v1/secrets',
      gateway: '/api/v1/gateway',
      mcp: '/api/v1/mcp'
    }
  });
});

export function setupRoutes(app) {
  app.use('/', router);
  app.use('/xstack', router);
}