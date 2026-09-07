/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// TanStack Router route tree — ops + projects/$projectId

import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as AuthenticatedRouteRouteImport } from './routes/_authenticated/route'
import { Route as AuthRouteImport } from './routes/auth'
import { Route as LoginRouteImport } from './routes/login'
import { Route as ConnectionsRouteImport } from './routes/connections'
import { Route as ExploreRouteImport } from './routes/explore'
import { Route as IntegrationsRouteImport } from './routes/integrations'
import { Route as McpRouteImport } from './routes/mcp'
import { Route as ModelsRouteImport } from './routes/models'
import { Route as ResourcesRouteImport } from './routes/resources'
import { Route as AuthenticatedAdminRouteImport } from './routes/_authenticated/admin'
import { Route as AuthenticatedAgentsRouteImport } from './routes/_authenticated/agents'
import { Route as AuthenticatedApiKeysRouteImport } from './routes/_authenticated/api-keys'
import { Route as AuthenticatedDashboardRouteImport } from './routes/_authenticated/dashboard'
import { Route as AuthenticatedGuidesRouteImport } from './routes/_authenticated/guides'
import { Route as AuthenticatedOrgsRouteImport } from './routes/_authenticated/orgs'
import { Route as AuthenticatedRolesRouteImport } from './routes/_authenticated/roles'
import { Route as AuthenticatedSecretsRouteImport } from './routes/_authenticated/secrets'
import { Route as AuthenticatedSettingsRouteImport } from './routes/_authenticated/settings'
import { Route as AuthenticatedStudioRouteImport } from './routes/_authenticated/studio'
import { Route as AuthenticatedToolkitsRouteImport } from './routes/_authenticated/toolkits'
import { Route as AuthenticatedProjectsRouteImport } from './routes/_authenticated/projects'
import { Route as AuthenticatedProjectsProjectIdRouteImport } from './routes/_authenticated/projects.$projectId'
import { Route as AuthenticatedTasksRouteImport } from './routes/_authenticated/tasks'
import { Route as AuthenticatedScheduleRouteImport } from './routes/_authenticated/schedule'
import { Route as AuthenticatedAutomationsRouteImport } from './routes/_authenticated/automations'
import { Route as OauthAuthorizeRouteImport } from './routes/oauth/authorize'
import { Route as OauthRegisterRouteImport } from './routes/oauth/register'
import { Route as OauthTokenRouteImport } from './routes/oauth/token'
import { Route as V1IndexRouteImport } from './routes/v1/index'
import { Route as V1ModelsRouteImport } from './routes/v1/models'
import { Route as ApiV1HealthRouteImport } from './routes/api/v1/health'
import { Route as ApiV1ResourcesRouteImport } from './routes/api/v1/resources'
import { Route as V1ChatCompletionsRouteImport } from './routes/v1/chat/completions'

const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
const AuthenticatedRouteRoute = AuthenticatedRouteRouteImport.update({ id: '/_authenticated', getParentRoute: () => rootRouteImport } as any)
const AuthRoute = AuthRouteImport.update({ id: '/auth', path: '/auth', getParentRoute: () => rootRouteImport } as any)
const LoginRoute = LoginRouteImport.update({ id: '/login', path: '/login', getParentRoute: () => rootRouteImport } as any)
const ConnectionsRoute = ConnectionsRouteImport.update({ id: '/connections', path: '/connections', getParentRoute: () => rootRouteImport } as any)
const ExploreRoute = ExploreRouteImport.update({ id: '/explore', path: '/explore', getParentRoute: () => rootRouteImport } as any)
const IntegrationsRoute = IntegrationsRouteImport.update({ id: '/integrations', path: '/integrations', getParentRoute: () => rootRouteImport } as any)
const McpRoute = McpRouteImport.update({ id: '/mcp', path: '/mcp', getParentRoute: () => rootRouteImport } as any)
const ModelsRoute = ModelsRouteImport.update({ id: '/models', path: '/models', getParentRoute: () => rootRouteImport } as any)
const ResourcesRoute = ResourcesRouteImport.update({ id: '/resources', path: '/resources', getParentRoute: () => rootRouteImport } as any)
const AuthenticatedAdminRoute = AuthenticatedAdminRouteImport.update({ id: '/admin', path: '/admin', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedAgentsRoute = AuthenticatedAgentsRouteImport.update({ id: '/agents', path: '/agents', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedApiKeysRoute = AuthenticatedApiKeysRouteImport.update({ id: '/api-keys', path: '/api-keys', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedDashboardRoute = AuthenticatedDashboardRouteImport.update({ id: '/dashboard', path: '/dashboard', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedGuidesRoute = AuthenticatedGuidesRouteImport.update({ id: '/guides', path: '/guides', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedOrgsRoute = AuthenticatedOrgsRouteImport.update({ id: '/orgs', path: '/orgs', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedRolesRoute = AuthenticatedRolesRouteImport.update({ id: '/roles', path: '/roles', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedSecretsRoute = AuthenticatedSecretsRouteImport.update({ id: '/secrets', path: '/secrets', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedSettingsRoute = AuthenticatedSettingsRouteImport.update({ id: '/settings', path: '/settings', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedStudioRoute = AuthenticatedStudioRouteImport.update({ id: '/studio', path: '/studio', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedToolkitsRoute = AuthenticatedToolkitsRouteImport.update({ id: '/toolkits', path: '/toolkits', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedProjectsRoute = AuthenticatedProjectsRouteImport.update({ id: '/projects', path: '/projects', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedProjectsProjectIdRoute = AuthenticatedProjectsProjectIdRouteImport.update({ id: '/projects/$projectId', path: '/projects/$projectId', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedTasksRoute = AuthenticatedTasksRouteImport.update({ id: '/tasks', path: '/tasks', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedScheduleRoute = AuthenticatedScheduleRouteImport.update({ id: '/schedule', path: '/schedule', getParentRoute: () => AuthenticatedRouteRoute } as any)
const AuthenticatedAutomationsRoute = AuthenticatedAutomationsRouteImport.update({ id: '/automations', path: '/automations', getParentRoute: () => AuthenticatedRouteRoute } as any)
const OauthAuthorizeRoute = OauthAuthorizeRouteImport.update({ id: '/oauth/authorize', path: '/oauth/authorize', getParentRoute: () => rootRouteImport } as any)
const OauthRegisterRoute = OauthRegisterRouteImport.update({ id: '/oauth/register', path: '/oauth/register', getParentRoute: () => rootRouteImport } as any)
const OauthTokenRoute = OauthTokenRouteImport.update({ id: '/oauth/token', path: '/oauth/token', getParentRoute: () => rootRouteImport } as any)
const V1IndexRoute = V1IndexRouteImport.update({ id: '/v1/', path: '/v1/', getParentRoute: () => rootRouteImport } as any)
const V1ModelsRoute = V1ModelsRouteImport.update({ id: '/v1/models', path: '/v1/models', getParentRoute: () => rootRouteImport } as any)
const ApiV1HealthRoute = ApiV1HealthRouteImport.update({ id: '/api/v1/health', path: '/api/v1/health', getParentRoute: () => rootRouteImport } as any)
const ApiV1ResourcesRoute = ApiV1ResourcesRouteImport.update({ id: '/api/v1/resources', path: '/api/v1/resources', getParentRoute: () => rootRouteImport } as any)
const V1ChatCompletionsRoute = V1ChatCompletionsRouteImport.update({ id: '/v1/chat/completions', path: '/v1/chat/completions', getParentRoute: () => rootRouteImport } as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/auth': typeof AuthRoute
  '/login': typeof LoginRoute
  '/connections': typeof ConnectionsRoute
  '/explore': typeof ExploreRoute
  '/integrations': typeof IntegrationsRoute
  '/mcp': typeof McpRoute
  '/models': typeof ModelsRoute
  '/resources': typeof ResourcesRoute
  '/admin': typeof AuthenticatedAdminRoute
  '/agents': typeof AuthenticatedAgentsRoute
  '/api-keys': typeof AuthenticatedApiKeysRoute
  '/dashboard': typeof AuthenticatedDashboardRoute
  '/guides': typeof AuthenticatedGuidesRoute
  '/orgs': typeof AuthenticatedOrgsRoute
  '/roles': typeof AuthenticatedRolesRoute
  '/secrets': typeof AuthenticatedSecretsRoute
  '/settings': typeof AuthenticatedSettingsRoute
  '/studio': typeof AuthenticatedStudioRoute
  '/toolkits': typeof AuthenticatedToolkitsRoute
  '/projects': typeof AuthenticatedProjectsRoute
  '/projects/$projectId': typeof AuthenticatedProjectsProjectIdRoute
  '/tasks': typeof AuthenticatedTasksRoute
  '/schedule': typeof AuthenticatedScheduleRoute
  '/automations': typeof AuthenticatedAutomationsRoute
  '/oauth/authorize': typeof OauthAuthorizeRoute
  '/oauth/register': typeof OauthRegisterRoute
  '/oauth/token': typeof OauthTokenRoute
  '/v1': typeof V1IndexRoute
  '/v1/models': typeof V1ModelsRoute
  '/api/v1/health': typeof ApiV1HealthRoute
  '/api/v1/resources': typeof ApiV1ResourcesRoute
  '/v1/chat/completions': typeof V1ChatCompletionsRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/auth': typeof AuthRoute
  '/login': typeof LoginRoute
  '/connections': typeof ConnectionsRoute
  '/explore': typeof ExploreRoute
  '/integrations': typeof IntegrationsRoute
  '/mcp': typeof McpRoute
  '/models': typeof ModelsRoute
  '/resources': typeof ResourcesRoute
  '/admin': typeof AuthenticatedAdminRoute
  '/agents': typeof AuthenticatedAgentsRoute
  '/api-keys': typeof AuthenticatedApiKeysRoute
  '/dashboard': typeof AuthenticatedDashboardRoute
  '/guides': typeof AuthenticatedGuidesRoute
  '/orgs': typeof AuthenticatedOrgsRoute
  '/roles': typeof AuthenticatedRolesRoute
  '/secrets': typeof AuthenticatedSecretsRoute
  '/settings': typeof AuthenticatedSettingsRoute
  '/studio': typeof AuthenticatedStudioRoute
  '/toolkits': typeof AuthenticatedToolkitsRoute
  '/projects': typeof AuthenticatedProjectsRoute
  '/projects/$projectId': typeof AuthenticatedProjectsProjectIdRoute
  '/tasks': typeof AuthenticatedTasksRoute
  '/schedule': typeof AuthenticatedScheduleRoute
  '/automations': typeof AuthenticatedAutomationsRoute
  '/oauth/authorize': typeof OauthAuthorizeRoute
  '/oauth/register': typeof OauthRegisterRoute
  '/oauth/token': typeof OauthTokenRoute
  '/v1': typeof V1IndexRoute
  '/v1/models': typeof V1ModelsRoute
  '/api/v1/health': typeof ApiV1HealthRoute
  '/api/v1/resources': typeof ApiV1ResourcesRoute
  '/v1/chat/completions': typeof V1ChatCompletionsRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/_authenticated': typeof AuthenticatedRouteRouteWithChildren
  '/auth': typeof AuthRoute
  '/login': typeof LoginRoute
  '/connections': typeof ConnectionsRoute
  '/explore': typeof ExploreRoute
  '/integrations': typeof IntegrationsRoute
  '/mcp': typeof McpRoute
  '/models': typeof ModelsRoute
  '/resources': typeof ResourcesRoute
  '/_authenticated/admin': typeof AuthenticatedAdminRoute
  '/_authenticated/agents': typeof AuthenticatedAgentsRoute
  '/_authenticated/api-keys': typeof AuthenticatedApiKeysRoute
  '/_authenticated/dashboard': typeof AuthenticatedDashboardRoute
  '/_authenticated/guides': typeof AuthenticatedGuidesRoute
  '/_authenticated/orgs': typeof AuthenticatedOrgsRoute
  '/_authenticated/roles': typeof AuthenticatedRolesRoute
  '/_authenticated/secrets': typeof AuthenticatedSecretsRoute
  '/_authenticated/settings': typeof AuthenticatedSettingsRoute
  '/_authenticated/studio': typeof AuthenticatedStudioRoute
  '/_authenticated/toolkits': typeof AuthenticatedToolkitsRoute
  '/_authenticated/projects': typeof AuthenticatedProjectsRoute
  '/_authenticated/projects/$projectId': typeof AuthenticatedProjectsProjectIdRoute
  '/_authenticated/tasks': typeof AuthenticatedTasksRoute
  '/_authenticated/schedule': typeof AuthenticatedScheduleRoute
  '/_authenticated/automations': typeof AuthenticatedAutomationsRoute
  '/oauth/authorize': typeof OauthAuthorizeRoute
  '/oauth/register': typeof OauthRegisterRoute
  '/oauth/token': typeof OauthTokenRoute
  '/v1/': typeof V1IndexRoute
  '/v1/models': typeof V1ModelsRoute
  '/api/v1/health': typeof ApiV1HealthRoute
  '/api/v1/resources': typeof ApiV1ResourcesRoute
  '/v1/chat/completions': typeof V1ChatCompletionsRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/auth' | '/login' | '/connections' | '/explore' | '/integrations' | '/mcp' | '/models' | '/resources' | '/admin' | '/agents' | '/api-keys' | '/dashboard' | '/guides' | '/orgs' | '/roles' | '/secrets' | '/settings' | '/studio' | '/toolkits' | '/projects' | '/projects/$projectId' | '/tasks' | '/schedule' | '/automations' | '/oauth/authorize' | '/oauth/register' | '/oauth/token' | '/v1' | '/v1/models' | '/api/v1/health' | '/api/v1/resources' | '/v1/chat/completions'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/auth' | '/login' | '/connections' | '/explore' | '/integrations' | '/mcp' | '/models' | '/resources' | '/admin' | '/agents' | '/api-keys' | '/dashboard' | '/guides' | '/orgs' | '/roles' | '/secrets' | '/settings' | '/studio' | '/toolkits' | '/projects' | '/projects/$projectId' | '/tasks' | '/schedule' | '/automations' | '/oauth/authorize' | '/oauth/register' | '/oauth/token' | '/v1' | '/v1/models' | '/api/v1/health' | '/api/v1/resources' | '/v1/chat/completions'
  id: '__root__' | '/' | '/_authenticated' | '/auth' | '/login' | '/connections' | '/explore' | '/integrations' | '/mcp' | '/models' | '/resources' | '/_authenticated/admin' | '/_authenticated/agents' | '/_authenticated/api-keys' | '/_authenticated/dashboard' | '/_authenticated/guides' | '/_authenticated/orgs' | '/_authenticated/roles' | '/_authenticated/secrets' | '/_authenticated/settings' | '/_authenticated/studio' | '/_authenticated/toolkits' | '/_authenticated/projects' | '/_authenticated/projects/$projectId' | '/_authenticated/tasks' | '/_authenticated/schedule' | '/_authenticated/automations' | '/oauth/authorize' | '/oauth/register' | '/oauth/token' | '/v1/' | '/v1/models' | '/api/v1/health' | '/api/v1/resources' | '/v1/chat/completions'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  AuthenticatedRouteRoute: typeof AuthenticatedRouteRouteWithChildren
  AuthRoute: typeof AuthRoute
  LoginRoute: typeof LoginRoute
  ConnectionsRoute: typeof ConnectionsRoute
  ExploreRoute: typeof ExploreRoute
  IntegrationsRoute: typeof IntegrationsRoute
  McpRoute: typeof McpRoute
  ModelsRoute: typeof ModelsRoute
  ResourcesRoute: typeof ResourcesRoute
  OauthAuthorizeRoute: typeof OauthAuthorizeRoute
  OauthRegisterRoute: typeof OauthRegisterRoute
  OauthTokenRoute: typeof OauthTokenRoute
  V1IndexRoute: typeof V1IndexRoute
  V1ModelsRoute: typeof V1ModelsRoute
  ApiV1HealthRoute: typeof ApiV1HealthRoute
  ApiV1ResourcesRoute: typeof ApiV1ResourcesRoute
  V1ChatCompletionsRoute: typeof V1ChatCompletionsRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { id: '/'; path: '/'; fullPath: '/'; preLoaderRoute: typeof IndexRouteImport; parentRoute: typeof rootRouteImport }
    '/_authenticated': { id: '/_authenticated'; path: ''; fullPath: '/'; preLoaderRoute: typeof AuthenticatedRouteRouteImport; parentRoute: typeof rootRouteImport }
    '/auth': { id: '/auth'; path: '/auth'; fullPath: '/auth'; preLoaderRoute: typeof AuthRouteImport; parentRoute: typeof rootRouteImport }
    '/login': { id: '/login'; path: '/login'; fullPath: '/login'; preLoaderRoute: typeof LoginRouteImport; parentRoute: typeof rootRouteImport }
    '/connections': { id: '/connections'; path: '/connections'; fullPath: '/connections'; preLoaderRoute: typeof ConnectionsRouteImport; parentRoute: typeof rootRouteImport }
    '/explore': { id: '/explore'; path: '/explore'; fullPath: '/explore'; preLoaderRoute: typeof ExploreRouteImport; parentRoute: typeof rootRouteImport }
    '/integrations': { id: '/integrations'; path: '/integrations'; fullPath: '/integrations'; preLoaderRoute: typeof IntegrationsRouteImport; parentRoute: typeof rootRouteImport }
    '/mcp': { id: '/mcp'; path: '/mcp'; fullPath: '/mcp'; preLoaderRoute: typeof McpRouteImport; parentRoute: typeof rootRouteImport }
    '/models': { id: '/models'; path: '/models'; fullPath: '/models'; preLoaderRoute: typeof ModelsRouteImport; parentRoute: typeof rootRouteImport }
    '/resources': { id: '/resources'; path: '/resources'; fullPath: '/resources'; preLoaderRoute: typeof ResourcesRouteImport; parentRoute: typeof rootRouteImport }
    '/_authenticated/admin': { id: '/_authenticated/admin'; path: '/admin'; fullPath: '/admin'; preLoaderRoute: typeof AuthenticatedAdminRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/agents': { id: '/_authenticated/agents'; path: '/agents'; fullPath: '/agents'; preLoaderRoute: typeof AuthenticatedAgentsRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/api-keys': { id: '/_authenticated/api-keys'; path: '/api-keys'; fullPath: '/api-keys'; preLoaderRoute: typeof AuthenticatedApiKeysRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/dashboard': { id: '/_authenticated/dashboard'; path: '/dashboard'; fullPath: '/dashboard'; preLoaderRoute: typeof AuthenticatedDashboardRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/guides': { id: '/_authenticated/guides'; path: '/guides'; fullPath: '/guides'; preLoaderRoute: typeof AuthenticatedGuidesRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/orgs': { id: '/_authenticated/orgs'; path: '/orgs'; fullPath: '/orgs'; preLoaderRoute: typeof AuthenticatedOrgsRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/roles': { id: '/_authenticated/roles'; path: '/roles'; fullPath: '/roles'; preLoaderRoute: typeof AuthenticatedRolesRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/secrets': { id: '/_authenticated/secrets'; path: '/secrets'; fullPath: '/secrets'; preLoaderRoute: typeof AuthenticatedSecretsRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/settings': { id: '/_authenticated/settings'; path: '/settings'; fullPath: '/settings'; preLoaderRoute: typeof AuthenticatedSettingsRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/studio': { id: '/_authenticated/studio'; path: '/studio'; fullPath: '/studio'; preLoaderRoute: typeof AuthenticatedStudioRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/toolkits': { id: '/_authenticated/toolkits'; path: '/toolkits'; fullPath: '/toolkits'; preLoaderRoute: typeof AuthenticatedToolkitsRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/projects': { id: '/_authenticated/projects'; path: '/projects'; fullPath: '/projects'; preLoaderRoute: typeof AuthenticatedProjectsRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/projects/$projectId': { id: '/_authenticated/projects/$projectId'; path: '/projects/$projectId'; fullPath: '/projects/$projectId'; preLoaderRoute: typeof AuthenticatedProjectsProjectIdRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/tasks': { id: '/_authenticated/tasks'; path: '/tasks'; fullPath: '/tasks'; preLoaderRoute: typeof AuthenticatedTasksRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/schedule': { id: '/_authenticated/schedule'; path: '/schedule'; fullPath: '/schedule'; preLoaderRoute: typeof AuthenticatedScheduleRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/_authenticated/automations': { id: '/_authenticated/automations'; path: '/automations'; fullPath: '/automations'; preLoaderRoute: typeof AuthenticatedAutomationsRouteImport; parentRoute: typeof AuthenticatedRouteRoute }
    '/oauth/authorize': { id: '/oauth/authorize'; path: '/oauth/authorize'; fullPath: '/oauth/authorize'; preLoaderRoute: typeof OauthAuthorizeRouteImport; parentRoute: typeof rootRouteImport }
    '/oauth/register': { id: '/oauth/register'; path: '/oauth/register'; fullPath: '/oauth/register'; preLoaderRoute: typeof OauthRegisterRouteImport; parentRoute: typeof rootRouteImport }
    '/oauth/token': { id: '/oauth/token'; path: '/oauth/token'; fullPath: '/oauth/token'; preLoaderRoute: typeof OauthTokenRouteImport; parentRoute: typeof rootRouteImport }
    '/v1/': { id: '/v1/'; path: '/v1'; fullPath: '/v1'; preLoaderRoute: typeof V1IndexRouteImport; parentRoute: typeof rootRouteImport }
    '/v1/models': { id: '/v1/models'; path: '/v1/models'; fullPath: '/v1/models'; preLoaderRoute: typeof V1ModelsRouteImport; parentRoute: typeof rootRouteImport }
    '/api/v1/health': { id: '/api/v1/health'; path: '/api/v1/health'; fullPath: '/api/v1/health'; preLoaderRoute: typeof ApiV1HealthRouteImport; parentRoute: typeof rootRouteImport }
    '/api/v1/resources': { id: '/api/v1/resources'; path: '/api/v1/resources'; fullPath: '/api/v1/resources'; preLoaderRoute: typeof ApiV1ResourcesRouteImport; parentRoute: typeof rootRouteImport }
    '/v1/chat/completions': { id: '/v1/chat/completions'; path: '/v1/chat/completions'; fullPath: '/v1/chat/completions'; preLoaderRoute: typeof V1ChatCompletionsRouteImport; parentRoute: typeof rootRouteImport }
  }
}

interface AuthenticatedRouteRouteChildren {
  AuthenticatedAdminRoute: typeof AuthenticatedAdminRoute
  AuthenticatedAgentsRoute: typeof AuthenticatedAgentsRoute
  AuthenticatedApiKeysRoute: typeof AuthenticatedApiKeysRoute
  AuthenticatedDashboardRoute: typeof AuthenticatedDashboardRoute
  AuthenticatedGuidesRoute: typeof AuthenticatedGuidesRoute
  AuthenticatedOrgsRoute: typeof AuthenticatedOrgsRoute
  AuthenticatedRolesRoute: typeof AuthenticatedRolesRoute
  AuthenticatedSecretsRoute: typeof AuthenticatedSecretsRoute
  AuthenticatedSettingsRoute: typeof AuthenticatedSettingsRoute
  AuthenticatedStudioRoute: typeof AuthenticatedStudioRoute
  AuthenticatedToolkitsRoute: typeof AuthenticatedToolkitsRoute
  AuthenticatedProjectsRoute: typeof AuthenticatedProjectsRoute
  AuthenticatedProjectsProjectIdRoute: typeof AuthenticatedProjectsProjectIdRoute
  AuthenticatedTasksRoute: typeof AuthenticatedTasksRoute
  AuthenticatedScheduleRoute: typeof AuthenticatedScheduleRoute
  AuthenticatedAutomationsRoute: typeof AuthenticatedAutomationsRoute
}

const AuthenticatedRouteRouteChildren: AuthenticatedRouteRouteChildren = {
  AuthenticatedAdminRoute,
  AuthenticatedAgentsRoute,
  AuthenticatedApiKeysRoute,
  AuthenticatedDashboardRoute,
  AuthenticatedGuidesRoute,
  AuthenticatedOrgsRoute,
  AuthenticatedRolesRoute,
  AuthenticatedSecretsRoute,
  AuthenticatedSettingsRoute,
  AuthenticatedStudioRoute,
  AuthenticatedToolkitsRoute,
  AuthenticatedProjectsRoute,
  AuthenticatedProjectsProjectIdRoute,
  AuthenticatedTasksRoute,
  AuthenticatedScheduleRoute,
  AuthenticatedAutomationsRoute,
}

const AuthenticatedRouteRouteWithChildren = AuthenticatedRouteRoute._addFileChildren(AuthenticatedRouteRouteChildren)

const rootRouteChildren: RootRouteChildren = {
  IndexRoute,
  AuthenticatedRouteRoute: AuthenticatedRouteRouteWithChildren,
  AuthRoute,
  LoginRoute,
  ConnectionsRoute,
  ExploreRoute,
  IntegrationsRoute,
  McpRoute,
  ModelsRoute,
  ResourcesRoute,
  OauthAuthorizeRoute,
  OauthRegisterRoute,
  OauthTokenRoute,
  V1IndexRoute,
  V1ModelsRoute,
  ApiV1HealthRoute,
  ApiV1ResourcesRoute,
  V1ChatCompletionsRoute,
}
export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
