import asyncio
import base64
import logging
import os
import random
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import typer
import uvicorn

log = logging.getLogger(__name__)


def _patch_open_connect_bootstrap() -> None:
    try:
        from fastapi import FastAPI
    except Exception:
        return

    original_init = FastAPI.__init__
    if getattr(original_init, '__open_connect_bootstrap_patch__', False):
        return

    def patched_init(self, *args, **kwargs):
        lifespan = kwargs.get('lifespan')
        if lifespan is not None and getattr(lifespan, '__module__', '') == 'open_webui.main':
            @asynccontextmanager
            async def wrapped_lifespan(app):
                async with lifespan(app):
                    try:
                        from open_webui.integrations import init_integrations
                        from open_webui.utils.workspace_bootstrap import bootstrap_workspace_resources

                        log.info('Open Connect startup bootstrap hook running')
                        init_integrations()
                        if not getattr(app.state, '_open_connect_workspace_bootstrap_started', False):
                            app.state._open_connect_workspace_bootstrap_started = True
                            app.state.workspace_bootstrap_task = asyncio.create_task(bootstrap_workspace_resources())
                            log.info('Open Connect workspace bootstrap task scheduled')
                    except Exception as exc:
                        log.warning('Open Connect workspace bootstrap setup failed: %s', exc)

                    yield

                    task = getattr(app.state, 'workspace_bootstrap_task', None)
                    if task is not None:
                        task.cancel()

            kwargs['lifespan'] = wrapped_lifespan
            log.info('Open Connect startup bootstrap hook applied')

        return original_init(self, *args, **kwargs)

    patched_init.__open_connect_bootstrap_patch__ = True
    FastAPI.__init__ = patched_init


_patch_open_connect_bootstrap()

app = typer.Typer()

KEY_FILE = Path.cwd() / '.webui_secret_key'
DEFAULT_SECRET_KEY_LENGTH = 24


def version_callback(value: bool) -> None:
    if value:
        from open_webui.env import VERSION

        typer.echo(f'Open WebUI version: {VERSION}')
        raise typer.Exit()


@app.command()
def main(
    version: Annotated[bool | None, typer.Option('--version', callback=version_callback)] = None,
):
    pass


@app.command()
def serve(
    host: str = '0.0.0.0',
    port: int = 8080,
):
    os.environ['FROM_INIT_PY'] = 'true'
    if os.getenv('WEBUI_SECRET_KEY') is None:
        typer.echo('Loading WEBUI_SECRET_KEY from file, not provided as an environment variable.')
        if not KEY_FILE.exists():
            key_length = int(os.getenv('WEBUI_SECRET_KEY_LENGTH', DEFAULT_SECRET_KEY_LENGTH))
            if key_length < 1:
                raise ValueError('WEBUI_SECRET_KEY_LENGTH must be a positive integer')
            typer.echo(f'Generating a new secret key and saving it to {KEY_FILE}')
            KEY_FILE.write_bytes(base64.b64encode(random.randbytes(key_length)))
        typer.echo(f'Loading WEBUI_SECRET_KEY from {KEY_FILE}')
        os.environ['WEBUI_SECRET_KEY'] = KEY_FILE.read_text()

    if os.getenv('USE_CUDA_DOCKER', 'false') == 'true':
        typer.echo('CUDA is enabled, appending LD_LIBRARY_PATH to include torch/cudnn & cublas libraries.')
        LD_LIBRARY_PATH = os.getenv('LD_LIBRARY_PATH', '').split(':')
        os.environ['LD_LIBRARY_PATH'] = ':'.join(
            LD_LIBRARY_PATH
            + [
                '/usr/local/lib/python3.11/site-packages/torch/lib',
                '/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib',
            ]
        )
        try:
            import torch

            assert torch.cuda.is_available(), 'CUDA not available'
            typer.echo('CUDA seems to be working')
        except Exception as e:
            typer.echo(
                'Error when testing CUDA but USE_CUDA_DOCKER is true. '
                'Resetting USE_CUDA_DOCKER to false and removing '
                f'LD_LIBRARY_PATH modifications: {e}'
            )
            os.environ['USE_CUDA_DOCKER'] = 'false'
            os.environ['LD_LIBRARY_PATH'] = ':'.join(LD_LIBRARY_PATH)

    import open_webui.main  # noqa: F401
    from open_webui.env import UVICORN_WORKERS  # Import the workers setting

    # On Windows, uvicorn's default loop factory hardcodes ProactorEventLoop,
    # which is incompatible with psycopg v3 async.  Setting loop='none' lets
    # asyncio.run() respect the WindowsSelectorEventLoopPolicy set in db.py.
    loop = 'none' if sys.platform == 'win32' else 'auto'

    uvicorn.run(
        'open_webui.main:app',
        host=host,
        port=port,
        forwarded_allow_ips='*',
        workers=UVICORN_WORKERS,
        loop=loop,
    )


@app.command()
def dev(
    host: str = '0.0.0.0',
    port: int = 8080,
    reload: bool = True,
):
    uvicorn.run(
        'open_webui.main:app',
        host=host,
        port=port,
        reload=reload,
        forwarded_allow_ips='*',
    )


if __name__ == '__main__':
    app()
