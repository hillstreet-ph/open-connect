/**
 * XStack Connections API Routes
 */

import { ConnectionManager } from '../../services/connections/index.js';

export function setupConnectionsRoutes(app) {
  const connectionManager = new ConnectionManager();

  app.get('/api/v1/connections', async (req, res) => {
    try {
      const connections = await connectionManager.listConnections();
      res.json({
        success: true,
        data: connections,
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

  app.get('/api/v1/connections/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const connection = await connectionManager.getConnection(id);
      
      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        data: connection,
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

  app.post('/api/v1/connections', async (req, res) => {
    try {
      const connectionData = req.body;
      const connection = await connectionManager.createConnection(connectionData);
      
      res.status(201).json({
        success: true,
        data: connection,
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

  app.put('/api/v1/connections/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const connectionData = req.body;
      const connection = await connectionManager.updateConnection(id, connectionData);
      
      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        data: connection,
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

  app.delete('/api/v1/connections/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await connectionManager.deleteConnection(id);
      
      res.json({
        success: true,
        message: 'Connection removed successfully',
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

  app.post('/api/v1/connections/:id/test', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await connectionManager.testConnection(id);
      
      res.json({
        success: true,
        data: result,
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