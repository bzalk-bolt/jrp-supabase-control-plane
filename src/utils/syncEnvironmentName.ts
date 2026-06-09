export interface SyncEnvironmentNameInput {
  name?: string | null;
  apex_domain?: string | null;
}

export function getSyncEnvironmentName(env: SyncEnvironmentNameInput): string {
  const raw = (env.name || env.apex_domain || 'local').trim();
  const slug = raw
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^[^a-zA-Z0-9]+/, '')
    .slice(0, 58)
    .replace(/[^a-zA-Z0-9_-]+$/g, '');

  return `${slug || 'local'}-main`;
}
