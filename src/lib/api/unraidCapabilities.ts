import { ServerConfig } from '@/types'
import { apiGraphQL, buildUrl } from './client'

export interface DockerCapabilities {
  hasStart: boolean
  hasStop: boolean
  hasRestart: boolean
  hasPause: boolean
  hasUnpause: boolean
}

export const RESTART_FALLBACK_DELAY_MS = 1500

const INTROSPECTION = `{ __type(name: "DockerMutations") { fields { name } } }`

interface IntrospectionRes {
  __type: { fields: Array<{ name: string }> } | null
}

const FALLBACK_CAPS: DockerCapabilities = {
  hasStart: true,
  hasStop: true,
  hasRestart: false,
  hasPause: true,
  hasUnpause: true,
}

const cache = new Map<string, Promise<DockerCapabilities>>()

async function probe(server: ServerConfig): Promise<DockerCapabilities> {
  const url = `${buildUrl(server.protocol, server.host, server.port)}/graphql`
  const r = await apiGraphQL<IntrospectionRes>(url, INTROSPECTION, {}, server.apiKey)
  if (!r.ok || !r.data?.__type) return { ...FALLBACK_CAPS }
  const names = new Set(r.data.__type.fields.map((f) => f.name))
  return {
    hasStart: names.has('start'),
    hasStop: names.has('stop'),
    hasRestart: names.has('restart'),
    hasPause: names.has('pause'),
    hasUnpause: names.has('unpause'),
  }
}

export function getDockerCapabilities(server: ServerConfig): Promise<DockerCapabilities> {
  let p = cache.get(server.id)
  if (!p) {
    p = probe(server).catch(() => ({ ...FALLBACK_CAPS }))
    cache.set(server.id, p)
  }
  return p
}

export function invalidateDockerCapabilities(serverId: string) {
  cache.delete(serverId)
}