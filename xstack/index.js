#!/usr/bin/env node

/**
 * XStack Main Entry Point
 * AI Resource Manager for Open-Connect
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { setupRoutes } from './routes/index.js';
import { setupLogging } from './utils/logging/index.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Setup middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Setup logging
setupLogging(app);

// Setup routes
setupRoutes(app);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.GATEWAY_VERSION || '1.0.0'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, HOST, () => {
  console.log(`✅ XStack Gateway running on http://${HOST}:${PORT}`);
  console.log(`🌐 MCP Gateway available at mcp://gateway`);
});

export { app, server, io };