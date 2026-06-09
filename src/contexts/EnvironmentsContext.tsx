import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { syncApi, localEnvironmentsService } from '../services';
import type { Environment, EnvironmentProject } from '../types/api';
import AppLoadingSkeleton from '../components/AppLoadingSkeleton';

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

      // Fetch cloud environments from the default sync-api. This must not inherit
      // the active local target, because a broken self-hosted SSL state should not
      // block the Local Environments page.
      let envs: Environment[] = [];
      const cloudMeta: MetaMap = {};
      let cloudError = '';
      try {
        envs = await syncApi.listDefaultEnvironments();
        for (const e of envs) {
          cloudMeta[e.name] = { source: 'cloud' };
        }
      } catch (e) {
        cloudError = e instanceof Error ? e.message : 'Failed to load cloud environments';
      }

      // Fetch identities for cloud environments
      const identityResults = await Promise.allSettled(
        envs.map(env => syncApi.getDefaultEnvironmentIdentity(env.name).then(id => {
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
      let localError = '';
      try {
        const bindings = await localEnvironmentsService.listBindings();
        const localEnvsList = await localEnvironmentsService.listLocalEnvironments();

        for (const binding of bindings) {
          const localEnv = localEnvsList.find(le => le.id === binding.local_environment_id);
          if (!localEnv) continue;

          // Do not probe the self-hosted sync-api during global app load. If its
          // certificate is still staging/invalid, the proxy will reject it and can
          // prevent users from reaching the reset/repair controls.
          const envName = `${localEnv.name || localEnv.apex_domain}-main`;
          localMeta[envName] = {
            source: 'self-hosted',
            localEnvironmentId: binding.local_environment_id,
            domain: localEnv.apex_domain,
          };
          localEnvs = localEnvs.concat([{
            name: envName,
            source_env: 'production',
            target_env: 'local',
            source_db_url: '',
            target_db_url: '',
            source_container: '',
            target_container: 'supabase-db',
            sync_storage_buckets: true,
          }]);
        }
      } catch (e) {
        localError = e instanceof Error ? e.message : 'Failed to load local environment bindings';
        // Bindings fetch failed - continue with cloud-only
      }

      setEnvironments([...envs, ...localEnvs]);
      setIdentities(map);
      setMeta({ ...cloudMeta, ...localMeta });
      if (!envs.length && !localEnvs.length && (cloudError || localError)) {
        setError(cloudError || localError);
      }
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
