# Open-Connect MCP Server

ChatGPT Apps MCP server for Composio Open-Connect control from ChatGPT Work and Codex. Streamable HTTP /mcp, OAuth 2.1 metadata, full-write gated by confirmation.

This MCP server integrates with [hillstreet-ph/open-connect](https://github.com/hillstreet-ph/open-connect) platform, providing access to:
- **Composio**: 1500+ SaaS toolkits and integrations
- **Open-Connect**: HillStreet's AI Resource Gateway and Marketplace
- **AI Gateway**: Unified AI model access
- **Model Gateway**: OpenRouter and LiteLLM support

## Features

- **Streamable HTTP /mcp**: Full MCP protocol support
- **OAuth 2.1 metadata**: Complete OAuth 2.1 configuration
- **Full-write gated by confirmation**: Safe write operations
- **Composio integration**: Access 1500+ pre-built connectors
- **AI Gateway integration**: Unified AI services
- **Model Gateway**: Support for OpenRouter, LiteLLM, and OpenAI
- **Credential management**: Secure credential storage and validation
- **Connection management**: Manage app connections
- **Workflow automation**: Create and execute workflows

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/hillstreet-ph/open-connect.git
cd open-connect/mcp-server
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required credentials:
- `COMPOSIO_API_KEY`: Your Composio API Key from [composio.dev](https://composio.dev)
- `COMPOSIO_DEVELOPER_TOKEN`: Your Developer Personal Token from Composio
- `AI_GATEWAY_API_KEY`: Your AI Gateway API Key from Open-Connect

Optional credentials:
- `OPEN_CONNECT_API_KEY`: Your Open-Connect platform API key
- `OPENROUTER_API_KEY`: OpenRouter API Key
- `LITELLM_MASTER_KEY`: LiteLLM Master Key
- `OPENAI_API_KEY`: OpenAI API Key

### 4. Start the server

```bash
python main.py
```

The server will start on `http://localhost:8000`

### 5. Connect to ChatGPT

In ChatGPT:
1. Go to **Settings** > **Plugins** > **MCP**
2. Click **"Add server"**
3. Enter:
   - **Name**: Open-Connect MCP
   - **Type**: Streamable HTTP
   - **URL**: `http://localhost:8000/mcp`
4. Click **Save**

### 6. Authenticate

Use the `open_connect_authenticate` tool in ChatGPT to authenticate:

```
@open_connect_authenticate api_key="your_api_key" developer_token="your_dev_token"
```

## Docker Deployment

### Using Docker Compose

```bash
docker-compose up -d
```

### Using Docker directly

```bash
docker build -t open-connect-mcp .
docker run -d -p 8000:8000 --name open-connect-mcp open-connect-mcp
```

## Available Tools

### Composio Tools
- `composio_execute_tool`: Execute any Composio tool
- `composio_list_toolkits`: List available toolkits
- `composio_list_connections`: List active connections
- `composio_initiate_connection`: Create new connection
- `composio_create_plan`: Generate workflow plans
- `composio_search_tools`: Search for tools
- `composio_sync_accounts`: Sync accounts with Open-Connect

### Open-Connect Tools
- `open_connect_authenticate`: Authenticate with Open-Connect
- `open_connect_health_check`: Check system health
- `open_connect_list_resources`: List available resources

### AI Gateway Tools
- `ai_gateway_execute`: Execute AI Gateway calls
- `ai_gateway_list_models`: List available models

### Model Gateway Tools
- `model_gateway_chat`: Send chat completions
- `model_gateway_list_providers`: List AI providers

### Credential Management
- `credential_list`: List saved credentials (metadata only)
- `credential_get`: Get credential metadata
- `credential_validate`: Validate credentials

### Connection Management
- `connection_list`: List all connections
- `connection_create`: Create new connection
- `connection_test`: Test connection

### Workflow Tools
- `workflow_create`: Create workflow
- `workflow_execute`: Execute workflow

### System Tools
- `system_info`: Get system information
- `system_health`: Check system health

## Available Resources

- `urn:open-connect:oauth-metadata`: OAuth 2.1 configuration
- `urn:open-connect:server-info`: Server information
- `urn:open-connect:api-docs`: Complete API documentation
- `urn:open-connect:credential-contract`: Credential contract

## API Endpoints

- `GET /`: Root endpoint
- `GET /health`: Health check
- `POST /mcp`: MCP protocol endpoint
- `GET /setup`: Setup guide
- `GET /oauth/metadata`: OAuth 2.1 metadata

## Security

- All sensitive data is encrypted at rest and in transit
- OAuth tokens and API keys are never exposed in responses
- Full-write actions require explicit confirmation
- Follows least-privilege access principles
- SOC 2 Type II compliant

## Credential Contract

The MCP server follows the Open-Connect credential contract:

```json
{
  "bindings": {
    "COMPOSIO_API_KEY": "credential://composio/open-connect",
    "COMPOSIO_DEVELOPER_TOKEN": "credential://composio/developer",
    "AI_GATEWAY_API_KEY": "credential://open-connect/ai-gateway",
    "OPEN_CONNECT_API_KEY": "credential://open-connect/mcp"
  }
}
```

## Integration with Open-Connect

This MCP server is designed to work seamlessly with the [Open-Connect](https://open-connect.site) platform:

- **AI Resource Gateway**: Access AI skills, MCP servers, tools, plugins, agents, prompts, and guides
- **Marketplace**: Discover and use pre-built integrations
- **MCP/API Gateway**: Unified access to multiple APIs
- **Model Gateway**: Access 100+ LLM APIs through a single interface
- **Access Control Plane**: Manage authentication and authorization

## Examples

### List available toolkits

```
@composio_list_toolkits limit=10
```

### Execute a tool

```
@composio_execute_tool tool_slug="github_create_issue" parameters={"title": "New Issue", "body": "Issue description"}
```

### Create a workflow plan

```
@composio_create_plan goal="Create a marketing campaign" context={"target_audience": "developers"}
```

### List AI models

```
@ai_gateway_list_models provider="openai"
```

### Send chat completion

```
@model_gateway_chat model="gpt-6-astra" messages=[{"role": "user", "content": "Hello, how are you?"}]
```

## Troubleshooting

### Authentication errors

Make sure you have:
1. Set all required environment variables in `.env`
2. Used the correct API keys and tokens
3. Restarted the server after changing configuration

### Connection issues

- Check that the server is running: `curl http://localhost:8000/health`
- Verify the MCP endpoint: `curl -X POST http://localhost:8000/mcp -H "Content-Type: application/json" -d '{"type": "list_tools"}'`
- Check logs for errors

### Missing tools

If tools are missing, ensure:
- You have authenticated with valid credentials
- Your API keys have the required permissions
- The Composio API is accessible

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## License

This project is part of the [Open-Connect](https://github.com/hillstreet-ph/open-connect) platform and follows its licensing terms.

## Support

For issues and questions:
- GitHub: https://github.com/hillstreet-ph/open-connect
- Documentation: https://open-connect.site
- Composio: https://composio.dev

## Changelog

### v1.0.0
- Initial release
- Full MCP protocol support
- Composio integration
- AI Gateway integration
- Model Gateway support
- Credential management
- Connection management
- Workflow automation
