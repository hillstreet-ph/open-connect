/**
 * XStack MCP Gateway API Routes
 */

import { MCPRouter } from '../../services/mcp/index.js';

export function setupMCPRoutes(app) {
  const mcpRouter = new MCPRouter();

  // GET /api/v1/mcp - List all MCP endpoints
  app.get('/api/v1/mcp', async (req, res) => {
    try {
      const endpoints = await mcpRouter.listEndpoints();
      res.json({
        success: true,
        data: endpoints,
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

  // GET /api/v1/mcp/:endpoint - Get MCP endpoint details
  app.get('/api/v1/mcp/:endpoint', async (req, res) => {
    try {
      const { endpoint } = req.params;
      const details = await mcpRouter.getEndpointDetails(endpoint);
      
      if (!details) {
        return res.status(404).json({
          success: false,
          error: 'MCP endpoint not found',
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        data: details,
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

  // POST /api/v1/mcp/:endpoint - Send MCP request
  app.post('/api/v1/mcp/:endpoint', async (req, res) => {
    try {
      const { endpoint } = req.params;
      const { method, params, id } = req.body;
      
      const response = await mcpRouter.sendRequest(endpoint, { method, params, id });
      
      res.json({
        success: true,
        data: response,
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

  // POST /api/v1/mcp/register - Register new MCP endpoint
  app.post('/api/v1/mcp/register', async (req, res) => {
    try {
      const endpointData = req.body;
      const result = await mcpRouter.registerEndpoint(endpointData);
      
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

  // DELETE /api/v1/mcp/:endpoint - Remove MCP endpoint
  app.delete('/api/v1/mcp/:endpoint', async (req, res) => {
    try {
      const { endpoint } = req.params;
      await mcpRouter.unregisterEndpoint(endpoint);
      
      res.json({
        success: true,
        message: 'MCP endpoint removed successfully',
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