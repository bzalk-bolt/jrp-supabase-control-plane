import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { syncApi, localEnvironmentsService } from '../services';
import type { Environment, EnvironmentProject, LocalEnvironmentBinding } from '../types/api';
import AppLoadingSkeleton from '../components/AppLoadingSkeleton';
import { getSyncEnvironmentName } from '../utils/syncEnvironmentName';

export type EnvironmentSource = 'cloud' | 'self-hosted';

export interface EnvironmentMeta {
  source: EnvironmentSource;
  localEnvironmentId?: string;
  domain?: string;
}

type IdentityMap = Record<string, { source?: string; target?: string }>;
type MetaMap = Record<string, EnvironmentMeta>;

interface EnvironmentsContextValue {
  environments: Environment[];
  identities: IdentityMap;
  meta: MetaMap;
  activeLocalEnvId: string;
  setActiveLocalEnvId: (id: string) => void;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const EnvironmentsContext = createContext<EnvironmentsContextValue | null>(null);

export function EnvironmentsProvider({ children }: { children: React.ReactNode }) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [identities, setIdentities] = useState<IdentityMap>({});
  const [meta, setMeta] = useState<MetaMap>({});
  const [activeLocalEnvId, setActiveLocalEnvId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError('');

      // Fetch cloud environments from default sync-api
      const envs = await syncApi.listEnvironments();
      const cloudMeta: MetaMap = {};
      for (const e of envs) {
        cloudMeta[e.name] = { source: 'cloud' };
      }

      // Fetch identities for cloud environments
      const identityResults = await Promise.allSettled(
        envs.map(env => syncApi.getEnvironmentIdentity(env.name).then(id => {
          const src = id.projects.find((p: EnvironmentProject) => p.role === 'source');
          const tgt = id.projects.find((p: EnvironmentProject) => p.role === 'target');
          return { name: env.name, source: src?.name, target: tgt?.name };
        }))
      );

      const map: IdentityMap = {};
      for (const result of identityResults) {
        if (result.status === 'fulfilled') {
          map[result.value.name] = { source: result.value.source, target: result.value.target };
        }
      }

      // Fetch local environment bindings and their environments
      let localEnvs: Environment[] = [];
      const localMeta: MetaMap = {};
      try {
        const bindings = await localEnvironmentsService.listBindings();
        const localEnvsList = await localEnvironmentsService.listLocalEnvironments();

        const bindingResults = await Promise.allSettled(
          bindings.map(async (binding: LocalEnvironmentBinding) => {
            const localEnv = localEnvsList.find(le => le.id === binding.local_environment_id);
            if (!localEnv || !localEnv.sync_api_url) return [];

            const envName = getSyncEnvironmentName(localEnv);

            try {
              const remoteEnvs = await syncApi.listEnvironmentsFor(binding.local_environment_id);
              for (const e of remoteEnvs) {
                localMeta[e.name] = {
                  source: 'self-hosted',
                  localEnvironmentId: binding.local_environment_id,
                  domain: localEnv.apex_domain,
                };
              }
              if (remoteEnvs.length > 0) return remoteEnvs;
            } catch {
              // fetch failed - fall through to synthetic entry
            }

            // No environments returned: create a synthetic entry so the selector shows it
            localMeta[envName] = {
              source: 'self-hosted',
              localEnvironmentId: binding.local_environment_id,
              domain: localEnv.apex_domain,
            };
            return [{
              name: envName,
              source_env: 'production',
              target_env: 'local',
              source_db_url: '',
              target_db_url: '',
              source_container: '',
              target_container: 'supabase-db',
              sync_storage_buckets: true,
            }] as Environment[];
          })
        );

        for (const result of bindingResults) {
          if (result.status === 'fulfilled') {
            localEnvs = localEnvs.concat(result.value);
          }
        }
      } catch {
        // Bindings fetch failed - continue with cloud-only
      }

      setEnvironments([...envs, ...localEnvs]);
      setIdentities(map);
      setMeta({ ...cloudMeta, ...localMeta });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load environments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // When active local env changes, update the api layer
  useEffect(() => {
    syncApi.setActiveLocalEnvironmentId(activeLocalEnvId);
  }, [activeLocalEnvId]);

  return (
    <EnvironmentsContext.Provider value={{ environments, identities, meta, activeLocalEnvId, setActiveLocalEnvId, loading, error, refresh }}>
      {loading ? <AppLoadingSkeleton /> : children}
    </EnvironmentsContext.Provider>
  );
}

export function useEnvironments() {
  const ctx = useContext(EnvironmentsContext);
  if (!ctx) throw new Error('useEnvironments must be used within EnvironmentsProvider');
  return ctx;
}
