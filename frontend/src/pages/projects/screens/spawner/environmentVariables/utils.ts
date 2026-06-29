import type { EnvironmentVariable, SecretKind } from '@odh-dashboard/k8s-core';
import { ConfigMapKind, NotebookKind } from '#~/k8sTypes';
import { EnvVariable, ExistingSecretKeyRef, SecretCategory } from '#~/pages/projects/types';

type SecretKeyRefValue = { name: string; key: string };

/**
 * Safely extract secretKeyRef from an EnvironmentVariable's valueFrom field.
 * EnvironmentVariable.valueFrom is typed as Record<string, unknown>, so we
 * must validate the shape at runtime.
 */
const getSecretKeyRef = (envVar: EnvironmentVariable): SecretKeyRefValue | undefined => {
  if (!('valueFrom' in envVar) || !envVar.valueFrom) {
    return undefined;
  }
  const ref = envVar.valueFrom.secretKeyRef;
  if (
    typeof ref === 'object' &&
    ref !== null &&
    'name' in ref &&
    typeof ref.name === 'string' &&
    'key' in ref &&
    typeof ref.key === 'string'
  ) {
    return { name: ref.name, key: ref.key };
  }
  return undefined;
};

/**
 * Type guard for ExistingSecretKeyRef[] parsed from JSON.
 */
const isExistingSecretKeyRefArray = (value: unknown): value is ExistingSecretKeyRef[] =>
  Array.isArray(value) &&
  value.every(
    (item: unknown) =>
      typeof item === 'object' &&
      item !== null &&
      'secretName' in item &&
      typeof item.secretName === 'string' &&
      'allKeys' in item &&
      typeof item.allKeys === 'boolean' &&
      'selectedKeys' in item &&
      Array.isArray(item.selectedKeys),
  );

export const updateArrayValue = <T>(values: T[], index: number, partialValue: Partial<T>): T[] =>
  values.map((v, i) => (i === index ? { ...v, ...partialValue } : v));

export const removeArrayItem = <T>(values: T[], index: number): T[] =>
  values.filter((v, i) => i !== index);

export const isConfigMapKind = (object: unknown): object is ConfigMapKind =>
  typeof object === 'object' && object !== null && 'kind' in object && object.kind === 'ConfigMap';

export const isSecretKind = (object: unknown): object is SecretKind =>
  typeof object === 'object' && object !== null && 'kind' in object && object.kind === 'Secret';

export const isStringKeyValuePairObject = (object: unknown): object is Record<string, string> =>
  typeof object === 'object' &&
  object !== null &&
  Object.entries(object).every(
    ([key, value]) => typeof key === 'string' && typeof value === 'string',
  );

export const getDeletedConfigMapOrSecretVariables = (
  notebook: NotebookKind | undefined,
  envVariables: EnvVariable[],
  excludedResources: string[] = [],
): {
  deletedSecrets: string[];
  deletedConfigMaps: string[];
} => {
  const existingEnvVariables = new Set(envVariables.map((env) => env.existingName));
  const deletedConfigMaps: string[] = [];
  const deletedSecrets: string[] = [];

  (notebook?.spec.template.spec.containers[0].envFrom || []).forEach((env) => {
    if (
      env.configMapRef &&
      !existingEnvVariables.has(env.configMapRef.name) &&
      !excludedResources.includes(env.configMapRef.name)
    ) {
      deletedConfigMaps.push(env.configMapRef.name);
    }
    if (
      env.secretRef &&
      !existingEnvVariables.has(env.secretRef.name) &&
      !excludedResources.includes(env.secretRef.name)
    ) {
      deletedSecrets.push(env.secretRef.name);
    }
  });
  return { deletedSecrets, deletedConfigMaps };
};

/**
 * Check whether an EnvVariable uses the "Existing secret" category.
 */
export const isExistingSecretRef = (envVar: EnvVariable): boolean =>
  envVar.values?.category === SecretCategory.EXISTING;

/**
 * Parse ExistingSecretKeyRef[] from the serialized data entries in an EnvVariable.
 * Existing secret refs are stored as JSON in a single entry with key '__existingSecretRefs'.
 */
export const parseExistingSecretRefsFromEnvVar = (envVar: EnvVariable): ExistingSecretKeyRef[] => {
  if (!isExistingSecretRef(envVar) || !envVar.values?.data.length) {
    return [];
  }
  try {
    const entry = envVar.values.data.find((d) => d.key === '__existingSecretRefs');
    if (entry) {
      const parsed: unknown = JSON.parse(entry.value);
      if (isExistingSecretKeyRefArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore parse errors
  }
  return [];
};

/**
 * Convert ExistingSecretKeyRef[] to EnvironmentVariable[] for injection
 * into the Notebook container's `env` array using `valueFrom.secretKeyRef`.
 *
 * For "All keys" refs, we need the actual keys from the secret, which must be provided.
 * For refs with specific selectedKeys, we use those directly.
 */
export const convertExistingSecretRefsToEnv = (
  refs: ExistingSecretKeyRef[],
  resolvedKeys?: Map<string, string[]>,
): EnvironmentVariable[] =>
  refs.flatMap((ref) => {
    const keys = ref.allKeys ? resolvedKeys?.get(ref.secretName) || [] : ref.selectedKeys;

    return keys.map(
      (key): EnvironmentVariable => ({
        name: key,
        valueFrom: {
          secretKeyRef: {
            name: ref.secretName,
            key,
          },
        },
      }),
    );
  });

/**
 * Extract ExistingSecretKeyRef[] from a notebook container's `env` array.
 * Finds all entries with `valueFrom.secretKeyRef` and groups them by secret name.
 */
export const extractExistingSecretRefsFromEnv = (
  envVars: EnvironmentVariable[],
): ExistingSecretKeyRef[] => {
  const refMap = new Map<string, string[]>();

  envVars.forEach((envVar) => {
    const secretKeyRef = getSecretKeyRef(envVar);
    if (secretKeyRef) {
      const existing = refMap.get(secretKeyRef.name) || [];
      existing.push(secretKeyRef.key);
      refMap.set(secretKeyRef.name, existing);
    }
  });

  return Array.from(refMap.entries()).map(([secretName, selectedKeys]) => ({
    secretName,
    allKeys: false,
    selectedKeys,
  }));
};

/**
 * Detect env key conflicts across all sources: existing secret refs,
 * inline key/value pairs, and connection secrets.
 * Returns a map of duplicate keys to the sources they appear in.
 */
export const detectEnvKeyConflicts = (
  envVariables: EnvVariable[],
  connectionKeys: string[],
  resolvedExistingSecretKeys?: Map<string, string[]>,
): Map<string, string[]> => {
  const keySourceMap = new Map<string, string[]>();

  const addKey = (key: string, source: string) => {
    const sources = keySourceMap.get(key) || [];
    sources.push(source);
    keySourceMap.set(key, sources);
  };

  // Inline key/value pairs and uploaded entries
  envVariables.forEach((envVar) => {
    if (envVar.values?.category === SecretCategory.EXISTING) {
      // Existing secret refs
      const refs = parseExistingSecretRefsFromEnvVar(envVar);
      refs.forEach((ref) => {
        const keys = ref.allKeys
          ? resolvedExistingSecretKeys?.get(ref.secretName) || []
          : ref.selectedKeys;
        keys.forEach((key) => addKey(key, `secret:${ref.secretName}`));
      });
    } else if (envVar.values?.data) {
      envVar.values.data.forEach((entry) => {
        if (entry.key) {
          addKey(entry.key, envVar.existingName || 'inline');
        }
      });
    }
  });

  // Connection keys
  connectionKeys.forEach((key) => addKey(key, 'connection'));

  // Filter to only keys with multiple sources (actual conflicts)
  const conflicts = new Map<string, string[]>();
  keySourceMap.forEach((sources, key) => {
    if (sources.length > 1) {
      conflicts.set(key, sources);
    }
  });

  return conflicts;
};
