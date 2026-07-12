from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

from open_webui.models.auths import Auths
from open_webui.models.functions import Functions, FunctionForm, FunctionMeta
from open_webui.models.skills import Skills, SkillForm, SkillMeta
from open_webui.models.tools import Tools, ToolForm, ToolMeta
from open_webui.models.users import Users
from open_webui.utils.auth import get_password_hash
from open_webui.utils.plugin import load_function_module_by_id, load_tool_module_by_id, replace_imports
from open_webui.utils.tools import get_tool_specs

log = logging.getLogger(__name__)

WORKSPACE_PLUGINS_DIR = Path('/app/backend/open_webui/plugins')
WORKSPACE_PIPELINES_DIR = Path('/app/backend/open_webui/pipelines')
PUBLIC_READ_GRANT = {'principal_type': 'user', 'principal_id': '*', 'permission': 'read'}
LEGACY_BOOTSTRAP_OWNER_EMAIL = 'open-connect-bootstrap@open-connect.local'
BOOTSTRAP_OWNER_NAME = os.getenv('OPEN_CONNECT_BOOTSTRAP_OWNER_NAME', 'Open Connect')
BOOTSTRAP_OWNER_EMAIL = os.getenv('OPEN_CONNECT_BOOTSTRAP_OWNER_EMAIL', LEGACY_BOOTSTRAP_OWNER_EMAIL)
BOOTSTRAP_OWNER_PASSWORD = os.getenv('OPEN_CONNECT_BOOTSTRAP_OWNER_PASSWORD')


async def _wait_for_workspace_owner(poll_interval: int = 10) -> Any:
    """Return the configured workspace owner or fall back to the first user."""
    try:
        configured_owner = await Users.get_user_by_email(BOOTSTRAP_OWNER_EMAIL)
        if configured_owner:
            if BOOTSTRAP_OWNER_PASSWORD:
                updated = await Auths.ensure_user_credentials_by_id(
                    configured_owner.id,
                    email=BOOTSTRAP_OWNER_EMAIL,
                    password=BOOTSTRAP_OWNER_PASSWORD,
                    name=BOOTSTRAP_OWNER_NAME,
                    role='admin',
                )
                if updated:
                    return updated
            return configured_owner
    except Exception as exc:
        log.debug('Workspace bootstrap is checking the configured owner: %s', exc)

    if BOOTSTRAP_OWNER_PASSWORD:
        try:
            legacy_owner = await Users.get_user_by_email(LEGACY_BOOTSTRAP_OWNER_EMAIL)
            if legacy_owner:
                updated = await Auths.ensure_user_credentials_by_id(
                    legacy_owner.id,
                    email=BOOTSTRAP_OWNER_EMAIL,
                    password=BOOTSTRAP_OWNER_PASSWORD,
                    name=BOOTSTRAP_OWNER_NAME,
                    role='admin',
                )
                if updated:
                    return updated
        except Exception as exc:
            log.debug('Workspace bootstrap is checking the legacy owner account: %s', exc)

    try:
        owner = await Users.get_first_user()
        if owner:
            if BOOTSTRAP_OWNER_PASSWORD and owner.email == LEGACY_BOOTSTRAP_OWNER_EMAIL:
                updated = await Auths.ensure_user_credentials_by_id(
                    owner.id,
                    email=BOOTSTRAP_OWNER_EMAIL,
                    password=BOOTSTRAP_OWNER_PASSWORD,
                    name=BOOTSTRAP_OWNER_NAME,
                    role='admin',
                )
                if updated:
                    return updated
            return owner
    except Exception as exc:
        log.debug('Workspace bootstrap is waiting for the first user: %s', exc)

    if BOOTSTRAP_OWNER_PASSWORD:
        log.info('No workspace user found; creating the configured bootstrap owner...')
        try:
            bootstrap_owner = await Auths.insert_new_auth(
                email=BOOTSTRAP_OWNER_EMAIL,
                password=await get_password_hash(BOOTSTRAP_OWNER_PASSWORD),
                name=BOOTSTRAP_OWNER_NAME,
                role='admin',
            )
            if bootstrap_owner:
                return bootstrap_owner
        except Exception as exc:
            log.warning('Failed to create configured bootstrap owner: %s', exc)

    log.info('No configured bootstrap password found; waiting for the first workspace user before bootstrapping skills and functions...')
    while True:
        try:
            owner = await Users.get_first_user()
            if owner:
                return owner
        except Exception as exc:
            log.debug('Workspace bootstrap is waiting for the first user: %s', exc)
        await asyncio.sleep(poll_interval)


def _iter_workspace_function_files() -> list[Path]:
    files: list[Path] = []
    if WORKSPACE_PLUGINS_DIR.exists():
        files.extend(sorted(WORKSPACE_PLUGINS_DIR.glob('*.py')))
    if WORKSPACE_PIPELINES_DIR.exists():
        files.extend(sorted(WORKSPACE_PIPELINES_DIR.glob('*.py')))
    return files


async def _sync_skills(owner_id: str) -> int:
    from open_webui.integrations import get_skill_manager

    skill_manager = get_skill_manager()
    synced = 0

    for skill in sorted(skill_manager.list_skills(enabled_only=False), key=lambda item: item.id):
        content = skill_manager.get_skill_prompt(skill.id).strip()
        if not content:
            continue

        existing = await Skills.get_skill_by_id(skill.id)
        payload = {
            'id': skill.id,
            'name': skill.name,
            'description': skill.description or '',
            'content': content,
            'meta': SkillMeta(tags=skill.tags or []).model_dump(),
            'is_active': skill.enabled,
            'access_grants': [PUBLIC_READ_GRANT],
        }

        if existing is None:
            created = await Skills.insert_new_skill(owner_id, SkillForm(**payload))
            if created:
                synced += 1
            continue

        await Skills.update_skill_by_id(skill.id, {k: v for k, v in payload.items() if k != 'id'})
        synced += 1

    return synced


async def _sync_functions(owner_id: str) -> int:
    synced = 0

    for function_path in _iter_workspace_function_files():
        function_id = function_path.stem.lower()
        try:
            content = replace_imports(function_path.read_text())
            if not any(marker in content for marker in ('class Pipe', 'class Filter', 'class Action', 'class Event')):
                continue
            _function_module, function_type, frontmatter = await load_function_module_by_id(
                function_id,
                content=content,
            )
        except Exception as exc:
            log.debug('Skipping workspace function %s: %s', function_path.name, exc)
            continue

        frontmatter = frontmatter or {}
        function_name = frontmatter.get('name') or frontmatter.get('title') or function_id
        function_meta = FunctionMeta(
            description=frontmatter.get('description') or '',
            manifest=frontmatter,
        )

        existing = await Functions.get_function_by_id(function_id)
        payload = {
            'name': function_name,
            'content': content,
            'meta': function_meta.model_dump(),
        }

        if existing is None:
            created = await Functions.insert_new_function(
                owner_id,
                function_type,
                FunctionForm(id=function_id, name=function_name, content=content, meta=function_meta),
            )
            if created:
                await Functions.update_function_by_id(
                    function_id,
                    {
                        'is_active': bool(frontmatter.get('active', True)),
                        'is_global': bool(frontmatter.get('global', False)),
                    },
                )
                synced += 1
            continue

        await Functions.update_function_by_id(
            function_id,
            {
                **payload,
                'type': function_type,
                'is_active': bool(frontmatter.get('active', True)),
                'is_global': bool(frontmatter.get('global', False)),
            },
        )
        synced += 1

    return synced


async def _sync_tools(owner_id: str) -> int:
    synced = 0

    for tool_path in _iter_workspace_function_files():
        tool_id = tool_path.stem.lower()
        try:
            content = replace_imports(tool_path.read_text())
            if 'class Tools' not in content:
                continue
            tool_module, frontmatter = await load_tool_module_by_id(tool_id, content=content)
        except Exception as exc:
            log.debug('Skipping workspace tool %s: %s', tool_path.name, exc)
            continue

        frontmatter = frontmatter or {}
        tool_name = frontmatter.get('name') or frontmatter.get('title') or tool_id
        tool_meta = ToolMeta(
            description=frontmatter.get('description') or '',
            manifest=frontmatter,
            has_user_valves=hasattr(tool_module, 'UserValves'),
        )
        specs = get_tool_specs(tool_module)
        existing = await Tools.get_tool_by_id(tool_id)
        payload = {
            'name': tool_name,
            'content': content,
            'meta': tool_meta.model_dump(),
            'specs': specs,
            'access_grants': [PUBLIC_READ_GRANT],
        }

        if existing is None:
            created = await Tools.insert_new_tool(
                owner_id,
                ToolForm(id=tool_id, name=tool_name, content=content, meta=tool_meta, access_grants=[PUBLIC_READ_GRANT]),
                specs,
            )
            if created:
                synced += 1
            continue

        await Tools.update_tool_by_id(tool_id, payload)
        synced += 1

    return synced


async def bootstrap_workspace_resources(poll_interval: int = 10) -> dict[str, int]:
    """Seed the workspace with the repository's built-in skills, tools, and functions."""
    from open_webui.integrations import init_integrations

    init_integrations()
    owner = await _wait_for_workspace_owner(poll_interval=poll_interval)

    skills_synced = await _sync_skills(owner.id)
    tools_synced = await _sync_tools(owner.id)
    functions_synced = await _sync_functions(owner.id)

    log.info(
        'Workspace bootstrap complete: skills=%s tools=%s functions=%s',
        skills_synced,
        tools_synced,
        functions_synced,
    )

    return {
        'skills_synced': skills_synced,
        'tools_synced': tools_synced,
        'functions_synced': functions_synced,
    }
