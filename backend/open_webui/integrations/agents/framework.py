"""
Agent Framework for Open Connect
Unified interface for various AI agent platforms
"""

import json
import logging
import asyncio
from typing import Any, Dict, List, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod
from pathlib import Path

log = logging.getLogger(__name__)


class AgentType(str, Enum):
    """Supported agent types"""
    OPENAI = "openai"
    LANGGRAPH = "langgraph"
    CREWAI = "crewai"
    AUTOGENOUS = "autogenous"
    CLAUDE_CODE = "claude_code"
    OPENCLAW = "openclaw"
    HERMES = "hermes"
    CUSTOM = "custom"


@dataclass
class AgentConfig:
    """Configuration for an agent"""
    name: str
    agent_type: AgentType
    model: str = "gpt-4"
    instructions: str = ""
    tools: List[str] = field(default_factory=list)
    system_prompt: str = ""
    max_retries: int = 3
    timeout: int = 300
    metadata: Dict[str, Any] = field(default_factory=dict)


class BaseAgent(ABC):
    """Abstract base class for agents"""
    
    def __init__(self, config: AgentConfig):
        self.config = config
        self.name = config.name
        self.agent_type = config.agent_type
    
    @abstractmethod
    async def run(self, task: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Run the agent with a task"""
        pass
    
    @abstractmethod
    async def stop(self):
        """Stop the agent"""
        pass
    
    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """Get agent status"""
        pass


class ManifestAgent(BaseAgent):
    """Fallback agent that stores manifest metadata when no runtime connector exists."

    async def run(self, task: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        return {
            'status': 'success',
            'output': f'{self.name} is registered from the workspace manifest.',
            'agent': self.name,
            'type': self.agent_type.value,
        }

    async def stop(self):
        return None

    def get_status(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'type': self.agent_type.value,
            'initialized': True,
            'model': self.config.model,
        }


class OpenAIAgent(BaseAgent):
    """OpenAI Agents SDK integration"""
    
    def __init__(self, config: AgentConfig):
        super().__init__(config)
        self.runner = None
        self.agent = None
    
    async def initialize(self):
        """Initialize OpenAI agent"""
        try:
            # Import OpenAI Agents SDK
            from agents import Agent, Runner
            
            # Create agent
            self.agent = Agent(
                name=self.config.name,
                instructions=self.config.instructions or self.config.system_prompt,
                model=self.config.model,
            )
            
            log.info(f"OpenAI agent '{self.name}' initialized")
        except ImportError:
            log.error("OpenAI Agents SDK not installed. Run: pip install openai-agents")
        except Exception as e:
            log.error(f"Failed to initialize OpenAI agent: {e}")
    
    async def run(self, task: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        if not self.agent:
            await self.initialize()
        
        try:
            from agents import Runner
            
            result = Runner.run_sync(
                self.agent,
                task,
                max_turns=self.config.max_retries
            )
            
            return {
                "status": "success",
                "output": result.final_output,
                "agent": self.name,
                "type": self.agent_type.value
            }
        except Exception as e:
            log.error(f"Agent run error: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    async def stop(self):
        self.agent = None
        self.runner = None
    
    def get_status(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.agent_type.value,
            "initialized": self.agent is not None,
            "model": self.config.model
        }


class LangGraphAgent(BaseAgent):
    """LangGraph agent integration"""
    
    def __init__(self, config: AgentConfig):
        super().__init__(config)
        self.graph = None
        self.compiled = None
    
    async def initialize(self):
        """Initialize LangGraph agent"""
        try:
            from langgraph.graph import StateGraph, END
            from typing import Annotated
            from langgraph.graph import add_messages
            
            # Create basic state graph
            class State(dict):
                messages: List[str] = []
            
            def should_continue(state):
                messages = state["messages"]
                return "end" if len(messages) >= 3 else "continue"
            
            self.graph = StateGraph(State)
            self.graph.add_node("agent", self._agent_node)
            self.graph.set_entry_point("agent")
            self.graph.add_edge("agent", END)
            
            self.compiled = self.graph.compile()
            log.info(f"LangGraph agent '{self.name}' initialized")
        except ImportError:
            log.error("LangGraph not installed. Run: pip install langgraph")
        except Exception as e:
            log.error(f"Failed to initialize LangGraph agent: {e}")
    
    async def _agent_node(self, state):
        """Agent node function"""
        return {"messages": state.get("messages", [])}
    
    async def run(self, task: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        if not self.compiled:
            await self.initialize()
        
        try:
            result = await self.compiled.ainvoke(
                {"messages": [task]},
                config={"configurable": {"thread_id": self.name}}
            )
            
            return {
                "status": "success",
                "output": result.get("messages", []),
                "agent": self.name,
                "type": self.agent_type.value
            }
        except Exception as e:
            log.error(f"LangGraph agent error: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    async def stop(self):
        self.graph = None
        self.compiled = None
    
    def get_status(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.agent_type.value,
            "initialized": self.compiled is not None
        }


class OpenClawConnector:
    """OpenClaw agent connector"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("OPENCLAW_API_KEY")
        self.base_url = "https://api.openclaw.ai/v1"
    
    async def send_message(self, message: str, agent_id: str = "default") -> Dict[str, Any]:
        """Send message to OpenClaw agent"""
        try:
            import aiohttp
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/chat",
                    json={"message": message, "agent_id": agent_id},
                    headers={"Authorization": f"Bearer {self.api_key}"}
                ) as resp:
                    return await resp.json()
        except Exception as e:
            log.error(f"OpenClaw error: {e}")
            return {"error": str(e)}
    
    async def list_agents(self) -> List[Dict[str, Any]]:
        """List available OpenClaw agents"""
        try:
            import aiohttp
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/agents",
                    headers={"Authorization": f"Bearer {self.api_key}"}
                ) as resp:
                    data = await resp.json()
                    return data.get("agents", [])
        except Exception as e:
            log.error(f"OpenClaw list agents error: {e}")
            return []


class SwarmDockConnector:
    """SwarmDock AI agent connector"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("SWARMDOCK_API_KEY")
        self.base_url = "https://api.swarmdock.ai/v1"
    
    async def create_agent(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Create a SwarmDock agent"""
        try:
            import aiohttp
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/agents",
                    json=config,
                    headers={"Authorization": f"Bearer {self.api_key}"}
                ) as resp:
                    return await resp.json()
        except Exception as e:
            log.error(f"SwarmDock create agent error: {e}")
            return {"error": str(e)}
    
    async def run_agent(self, agent_id: str, task: str) -> Dict[str, Any]:
        """Run a SwarmDock agent task"""
        try:
            import aiohttp
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/agents/{agent_id}/run",
                    json={"task": task},
                    headers={"Authorization": f"Bearer {self.api_key}"}
                ) as resp:
                    return await resp.json()
        except Exception as e:
            log.error(f"SwarmDock run agent error: {e}")
            return {"error": str(e)}


class AgentHub:
    """Central hub for managing all agents"""
    
    def __init__(self):
        self.agents: Dict[str, BaseAgent] = {}
        self.connectors: Dict[str, Any] = {}
        self.agent_manifest: dict[str, Any] = {}
        self.connector_manifest: dict[str, Any] = {}
        self.manifest_dir = Path('/app/backend/open_webui/integrations')
        self._register_connectors()
    
    def _register_connectors(self):
        """Register platform connectors"""
        self.connectors['openclaw'] = OpenClawConnector()
        self.connectors['swarmdock'] = SwarmDockConnector()
    
    def _build_agent(self, agent_data: Dict[str, Any]) -> BaseAgent:
        agent_type_value = str(agent_data.get('type', 'custom')).lower()
        try:
            agent_type = AgentType(agent_type_value)
        except ValueError:
            agent_type = AgentType.CUSTOM

        config = AgentConfig(
            name=agent_data.get('name') or agent_data.get('id') or 'Unnamed Agent',
            agent_type=agent_type,
            model=agent_data.get('model', 'gpt-4'),
            instructions=agent_data.get('instructions', ''),
            tools=agent_data.get('tools', []) or [],
            system_prompt=agent_data.get('system_prompt', ''),
            max_retries=int(agent_data.get('max_retries', 3) or 3),
            timeout=int(agent_data.get('timeout', 300) or 300),
            metadata={k: v for k, v in agent_data.items() if k not in {'id', 'name', 'type', 'model', 'instructions', 'tools', 'system_prompt', 'max_retries', 'timeout'}},
        )

        if agent_type == AgentType.OPENAI:
            return OpenAIAgent(config)
        if agent_type == AgentType.LANGGRAPH:
            return LangGraphAgent(config)
        return ManifestAgent(config)
    
    def register_agent(self, agent: BaseAgent):
        """Register an agent"""
        self.agents[agent.name] = agent
        log.info(f"Registered agent: {agent.name}")
    
    def get_agent(self, name: str) -> Optional[BaseAgent]:
        """Get an agent by name"""
        return self.agents.get(name)
    
    def list_agents(self) -> List[Dict[str, Any]]:
        """List all registered agents"""
        return [
            agent.get_status()
            for agent in self.agents.values()
        ]
    
    def load_connector_manifest(self, manifest_path: Path | None = None) -> dict[str, Any]:
        """Load the persisted connector manifest into memory."""
        manifest_path = manifest_path or (self.manifest_dir / '.connectors.json')
        if not manifest_path.exists():
            self.connector_manifest = {}
            return self.connector_manifest

        try:
            self.connector_manifest = json.loads(manifest_path.read_text())
        except Exception as exc:
            log.warning('Failed to load connector manifest %s: %s', manifest_path, exc)
            self.connector_manifest = {}
        return self.connector_manifest

    def load_default_agents(self, manifest_path: Path | None = None) -> List[Dict[str, Any]]:
        """Load agents from the repository manifest and register them."""
        manifest_path = manifest_path or (self.manifest_dir / '.agents.json')
        self.agent_manifest = {}
        if not manifest_path.exists():
            return []

        try:
            self.agent_manifest = json.loads(manifest_path.read_text())
        except Exception as exc:
            log.warning('Failed to load agent manifest %s: %s', manifest_path, exc)
            self.agent_manifest = {}
            return []

        registered: List[Dict[str, Any]] = []
        for agent_data in self.agent_manifest.get('agents', []):
            try:
                agent = self._build_agent(agent_data)
                self.register_agent(agent)
                registered.append(agent_data)
            except Exception as exc:
                log.warning('Skipping agent manifest entry %s: %s', agent_data.get('name') or agent_data.get('id'), exc)
        return registered
    
    async def run_agent(
        self,
        name: str,
        task: str,
        context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Run a registered agent"""
        agent = self.get_agent(name)
        if not agent:
            return {"error": f"Agent '{name}' not found"}
        return await agent.run(task, context)
    
    async def stop_all(self):
        """Stop all agents"""
        for agent in self.agents.values():
            await agent.stop()


# Global agent hub
_agent_hub: Optional[AgentHub] = None


def get_agent_hub() -> AgentHub:
    """Get the global agent hub"""
    global _agent_hub
    if _agent_hub is None:
        _agent_hub = AgentHub()
    return _agent_hub
