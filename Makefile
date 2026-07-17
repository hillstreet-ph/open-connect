# XStack Open-Connect Makefile
# Comprehensive build and deployment automation

.PHONY: help install dev test lint format build docker docker-railway deploy deploy-railway clean

# Environment
NODE_ENV ?= development
PORT ?= 3000

# Colors
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m

# Help
help: ## Show this help message
	@echo "XStack Open-Connect - Build & Deployment Commands"
	@echo "==============================================="
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[0;32m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# Install dependencies
install: ## Install all dependencies
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	cd xstack && npm install
	@echo "$(GREEN)Dependencies installed successfully!$(NC)"

# Development setup
dev: install ## Start development server
	@echo "$(YELLOW)Starting development server...$(NC)"
	cd xstack && npm run dev

# Run tests
test: ## Run all tests
	@echo "$(YELLOW)Running tests...$(NC)"
	cd xstack && npm test

# Run linter
lint: ## Run ESLint
	@echo "$(YELLOW)Running linter...$(NC)"
	cd xstack && npm run lint

# Format code
format: ## Format code with Prettier
	@echo "$(YELLOW)Formatting code...$(NC)"
	cd xstack && npm run format

# Build production bundle
build: ## Build production bundle
	@echo "$(YELLOW)Building production bundle...$(NC)"
	cd xstack && npm run build
	@echo "$(GREEN)Build completed successfully!$(NC)"

# Docker build
docker: ## Build Docker image
	@echo "$(YELLOW)Building Docker image...$(NC)"
	docker build -t orghide/open-connect:xstack -f Dockerfile .
	@echo "$(GREEN)Docker image built successfully!$(NC)"

# Docker build for Railway
docker-railway: ## Build Docker image for Railway
	@echo "$(YELLOW)Building Railway Docker image...$(NC)"
	docker build -t orghide/open-connect:xstack-railway -f Dockerfile.railway .
	@echo "$(GREEN)Railway Docker image built successfully!$(NC)"

# Deploy to Railway (requires railway CLI)
deploy-railway: docker-railway ## Deploy to Railway
	@echo "$(YELLOW)Deploying to Railway...$(NC)"
	railway up --detach
	@echo "$(GREEN)Deployment initiated! Check Railway dashboard for progress.$(NC)"

# General deploy target
deploy: build ## Deploy the application
	@echo "$(YELLOW)Deploying application...$(NC)"
	@echo "Use 'make deploy-railway' for Railway deployment"
	@echo "$(GREEN)Build completed. Ready for deployment!$(NC)"

# Clean
clean: ## Clean build artifacts
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	cd xstack && rm -rf dist node_modules
	docker rmi orghide/open-connect:xstack orghide/open-connect:xstack-railway 2>/dev/null || true
	@echo "$(GREEN)Cleanup completed!$(NC)"

# Setup environment
setup-env: ## Create .env file from example
	@echo "$(YELLOW)Setting up environment...$(NC)"
	cp .env.example .env
	@echo "$(GREEN)Environment file created from .env.example$(NC)"
	@echo "Please edit .env with your actual configuration values"

# Database migrations
migrate: ## Run database migrations
	@echo "$(YELLOW)Running database migrations...$(NC)"
	cd xstack && npm run migrate
	@echo "$(GREEN)Migrations completed!$(NC)"

# Seed database
seed: ## Seed database with initial data
	@echo "$(YELLOW)Seeding database...$(NC)"
	cd xstack && npm run seed
	@echo "$(GREEN)Database seeded!$(NC)"

# Health check
health: ## Check application health
	@echo "$(YELLOW)Checking application health...$(NC)"
	curl -f http://localhost:$(PORT)/health || echo "$(RED)Health check failed$(NC)"
	@echo "$(GREEN)Health check completed!$(NC)"

# View logs
logs: ## View application logs
	@echo "$(YELLOW)Viewing application logs...$(NC)"
	docker logs open-connect-xstack 2>/dev/null || echo "No running container found"
