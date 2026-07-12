"""
Open WebUI Pipe Integration
Allows connecting external agents via OpenAI-compatible API
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional
from fastapi import HTTPException

log = logging.getLogger(__name__)


class Pipe:
    """
    Open WebUI Pipe - Base class for connecting external models/agents
    Inherited from open-webui/src/lib/components/PreviousResponse.svelte
    """
    
    class Valves:
        """Model configuration"""
        def __init__(self):
            self.OPENAI_API_KEY: str = ""
            self.OPENAI_API_BASE_URL: str = "https://api.openai.com/v1"
            self.MODEL: str = "gpt-4"
            self.SYSTEM_PROMPT: str = "You are a helpful AI assistant."
            self.TEMPERATURE: float = 0.7
            self.MAX_TOKENS: int = 2048
    
    def __init__(self):
        self.name = "Base Pipe"
        self.valves = self.Valves()
    
    async def inlet(self, body: Dict[str, Any]) -> Dict[str, Any]:
        """
        Pre-process request before sending to model
        """
        return body
    
    async def outlet(self, body: Dict[str, Any], response: str) -> str:
        """
        Post-process response from model
        """
        return response


class OpenAIPipe(Pipe):
    """
    OpenAI Compatible API Pipe
    Connect any OpenAI-compatible API as a model
    """
    
    def __init__(self):
        super().__init__()
        self.name = "OpenAI Compatible"
        self.valves = self.Valves()
        self.valves.OPENAI_API_BASE_URL = os.getenv(
            "OPENAI_API_BASE_URL",
            "https://api.openai.com/v1"
        )
        self.valves.OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
        self.valves.MODEL = os.getenv("OPENAI_MODEL", "gpt-4")
    
    async def inlet(self, body: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare request for OpenAI API"""
        # Add system prompt if not present
        messages = body.get("messages", [])
        
        # Inject system message if configured
        if self.valves.SYSTEM_PROMPT:
            has_system = any(
                m.get("role") == "system" for m in messages
            )
            if not has_system:
                messages.insert(0, {
                    "role": "system",
                    "content": self.valves.SYSTEM_PROMPT
                })
        
        body["messages"] = messages
        body["model"] = self.valves.MODEL
        
        return body
    
    async def pipe(
        self,
        body: Dict[str, Any],
        __user__: Dict[str, Any] = None,
        __AI__: Any = None,
        __context__: Dict[str, Any] = None
    ) -> str:
        """
        Main pipe function - receives messages and returns response
        """
        try:
            import aiohttp
            
            # Prepare request
            body = await self.inlet(body)
            
            # Make API call
            url = f"{self.valves.OPENAI_API_BASE_URL}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.valves.OPENAI_API_KEY}",
                "Content-Type": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=body,
                    headers=headers
                ) as resp:
                    if resp.status != 200:
                        error = await resp.text()
                        raise HTTPException(
                            status_code=resp.status,
                            detail=error
                        )
                    
                    data = await resp.json()
                    
                    # Extract response
                    if data.get("choices"):
                        return data["choices"][0]["message"]["content"]
                    
                    return ""
        except Exception as e:
            log.error(f"OpenAI pipe error: {e}")
            raise HTTPException(status_code=500, detail=str(e))


class AgentPipe(Pipe):
    """
    Agent Pipe - Connect autonomous agents
    Supports OpenClaw, SwarmDock, and other agent platforms
    """
    
    class Valves(Pipe.Valves):
        def __init__(self):
            super().__init__()
            self.AGENT_TYPE: str = "openai"  # openai, langgraph, crewai, openclaw, swarmdock
            self.AGENT_ID: str = ""
            self.AGENT_API_KEY: str = ""
            self.AGENT_API_URL: str = ""
            self.MAX_STEPS: int = 10
    
    def __init__(self):
        super().__init__()
        self.name = "Agent Pipe"
        self.valves = self.Valves()
    
    async def pipe(
        self,
        body: Dict[str, Any],
        __user__: Dict[str, Any] = None,
        __AI__: Any = None,
        __context__: Dict[str, Any] = None
    ) -> str:
        """Process request through agent"""
        messages = body.get("messages", [])
        last_message = messages[-1].get("content", "") if messages else ""
        
        if self.valves.AGENT_TYPE == "openai":
            return await self._run_openai_agent(last_message)
        elif self.valves.AGENT_TYPE == "openclaw":
            return await self._run_openclaw_agent(last_message)
        elif self.valves.AGENT_TYPE == "swarmdock":
            return await self._run_swarmdock_agent(last_message)
        else:
            return f"Agent type '{self.valves.AGENT_TYPE}' not supported"
    
    async def _run_openai_agent(self, task: str) -> str:
        """Run OpenAI agent"""
        try:
            from agents import Agent, Runner
            
            agent = Agent(
                name="OpenConnect Agent",
                instructions=self.valves.SYSTEM_PROMPT,
                model=self.valves.MODEL,
            )
            
            result = Runner.run_sync(agent, task)
            return result.final_output
        except Exception as e:
            log.error(f"OpenAI agent error: {e}")
            return f"Agent error: {str(e)}"
    
    async def _run_openclaw_agent(self, task: str) -> str:
        """Run OpenClaw agent"""
        try:
            import aiohttp
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.valves.AGENT_API_URL or "https://api.openclaw.ai/v1/chat",
                    json={"message": task, "agent_id": self.valves.AGENT_ID},
                    headers={"Authorization": f"Bearer {self.valves.AGENT_API_KEY}"}
                ) as resp:
                    data = await resp.json()
                    return data.get("response", "")
        except Exception as e:
            log.error(f"OpenClaw agent error: {e}")
            return f"Agent error: {str(e)}"
    
    async def _run_swarmdock_agent(self, task: str) -> str:
        """Run SwarmDock agent"""
        try:
            import aiohttp
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.valves.AGENT_API_URL or "https://api.swarmdock.ai/v1/run",
                    json={"task": task, "agent_id": self.valves.AGENT_ID},
                    headers={"Authorization": f"Bearer {self.valves.AGENT_API_KEY}"}
                ) as resp:
                    data = await resp.json()
                    return data.get("result", "")
        except Exception as e:
            log.error(f"SwarmDock agent error: {e}")
            return f"Agent error: {str(e)}"


class MCPPipe(Pipe):
    """
    MCP (Model Context Protocol) Pipe
    Connect MCP servers as tools for the model
    """
    
    class Valves(Pipe.Valves):
        def __init__(self):
            super().__init__()
            self.MCP_SERVER_URL: str = ""
            self.TOOLS_ENABLED: str = "web_search,calculator,file_system"
    
    def __init__(self):
        super().__init__()
        self.name = "MCP Pipe"
        self.valves = self.Valves()
    
    async def pipe(
        self,
        body: Dict[str, Any],
        __user__: Dict[str, Any] = None,
        __AI__: Any = None,
        __context__: Dict[str, Any] = None
    ) -> str:
        """Process request through MCP"""
        try:
            from open_webui.integrations.mcp import get_mcp_server
            
            mcp = get_mcp_server()
            tools = await mcp.list_tools()
            
            # Process with tools
            # This would integrate with the main AI call
            return f"MCP enabled with {len(tools)} tools"
        except Exception as e:
            log.error(f"MCP pipe error: {e}")
            return f"MCP error: {str(e)}"


# Registry of available pipes
PIPES = {
    "openai": OpenAIPipe,
    "agent": AgentPipe,
    "mcp": MCPPipe,
}


def get_pipe(pipe_type: str = "openai") -> Pipe:
    """Get a pipe instance by type"""
    pipe_class = PIPES.get(pipe_type, OpenAIPipe)
    return pipe_class()
