---
name: openrouter-models
description: Access and manage AI models through OpenRouter gateway with comprehensive model catalog, routing, and optimization capabilities.
triggers:
  - /models
  - /openrouter
  - /list-models
  - /model-info
---

# OpenRouter Models Skill

Access the complete OpenRouter model catalog, manage model routing, and optimize AI model usage through the OpenRouter gateway.

## Capabilities

### Model Discovery
- List all available models from connected providers
- Filter models by provider, capability, or pricing
- Get detailed model information and specifications
- Discover free and paid models automatically

### Model Routing
- Automatic routing to free models first
- Fallback to paid models when free limits are reached
- Intelligent model selection based on task requirements
- Multi-provider load balancing

### Model Optimization
- Automatic model rotation when rate limits are hit
- Parallel model execution for faster results
- Cost-aware model selection
- Performance-based model ranking

## Usage

### List All Models
```
/models list
```

### Get Model Information
```
/model-info <model-id>
```

### Route to Best Model
```
/openrouter route --task <task-description>
```

### Use Free Models Only
```
/openrouter free-only
```

## Integration

This skill integrates with all connected AI providers through OpenRouter, including:
- OpenAI (GPT-4, GPT-3.5, etc.)
- Anthropic (Claude models)
- Google (Gemini models)
- Mistral
- Meta (Llama models)
- And all other OpenRouter-supported providers

## Automatic Features

- **Free First**: Always tries free models before paid ones
- **Auto Rotation**: Automatically rotates models when limits are hit
- **Multi-Model**: Uses multiple models in parallel for faster execution
- **Professional Setup**: All models have access to tools, skills, and functions
