# Docker Workflow Installation -- Open Connect

## Overview

The workflow file at deploy/docker-workflows/open-connect-docker.yml is a complete
GitHub Actions workflow that builds, tests, and publishes the Open Connect control-plane
Docker image to Docker Hub.

## Installation

Copy the workflow to the active GitHub Actions path:

    cp deploy/docker-workflows/open-connect-docker.yml .github/workflows/control-plane-docker.yml
    git add .github/workflows/control-plane-docker.yml
    git commit -m "infra: Install Control Plane Docker Build and Publish workflow"
    git push

## Required secrets

DOCKERHUB_USERNAME -- Docker Hub username
DOCKERHUB_TOKEN   -- Docker Hub access token

## Required environment

Create a GitHub environment named container-publish in the repository settings.

## What it does

1. Build -- Builds the Docker image from ./control-plane/Dockerfile
2. Smoke test -- Starts the container and checks the health endpoint
3. Pytest -- Runs tests if pyproject.toml is present
4. Publish -- Tags and pushes to Docker Hub as hillstreetph/open-connect

## Triggers

- Push to main (paths: control-plane/**)
- Pull requests (paths: control-plane/**)
- Tags matching v*
- GitHub releases
- Manual workflow_dispatch

## Image tags

- Release: :v1.2.3, :v1.2, :v1, :latest
- Main branch: :main-sha7, :main, :latest
