import * as React from 'react';
import {
  EnvironmentVariableType,
  ExistingSecretKeyRef,
  EnvVariableData,
  SecretCategory,
} from '#~/pages/projects/types';
import { asEnumMember } from '#~/utilities/utils';
import EnvDataTypeField from './EnvDataTypeField';
import GenericKeyValuePairField from './GenericKeyValuePairField';
import { EMPTY_KEY_VALUE_PAIR } from './const';
import EnvUploadField from './EnvUploadField';
import EnvExistingSecretField from './EnvExistingSecretField';
import { useCanListSecrets } from './useExistingSecrets';

type EnvSecretProps = {
  env?: EnvVariableData;
  onUpdate: (envVariableData: EnvVariableData) => void;
  namespace?: string;
};

const DEFAULT_ENV: EnvVariableData = {
  category: null,
  data: [],
};

/** Parse existing secret refs from env data entries (stored as JSON in the value field). */
const parseExistingSecretRefs = (
  data: { key: string; value: string }[],
): ExistingSecretKeyRef[] => {
  try {
    if (data.length === 1 && data[0].key === '__existingSecretRefs') {
      const parsed: unknown = JSON.parse(data[0].value);
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (item: unknown) =>
            typeof item === 'object' &&
            item !== null &&
            'secretName' in item &&
            typeof item.secretName === 'string' &&
            'allKeys' in item &&
            typeof item.allKeys === 'boolean' &&
            'selectedKeys' in item &&
            Array.isArray(item.selectedKeys),
        )
      ) {
        const validated: ExistingSecretKeyRef[] = parsed.map(
          (item: {
            secretName: string;
            allKeys: boolean;
            selectedKeys: string[];
          }): ExistingSecretKeyRef => ({
            secretName: item.secretName,
            allKeys: item.allKeys,
            selectedKeys: item.selectedKeys,
          }),
        );
        return validated;
      }
    }
  } catch {
    // ignore parse errors
  }
  return [];
};

/** Serialize existing secret refs into env data entries for storage in the EnvVariable model. */
const serializeExistingSecretRefs = (
  refs: ExistingSecretKeyRef[],
): { key: string; value: string }[] => [
  { key: '__existingSecretRefs', value: JSON.stringify(refs) },
];

const EnvSecret: React.FC<EnvSecretProps> = ({ env = DEFAULT_ENV, onUpdate, namespace }) => {
  const [canListSecrets, canListSecretsLoaded] = useCanListSecrets(namespace || '');

  const existingSecretRefs = React.useMemo(
    () => (env.category === SecretCategory.EXISTING ? parseExistingSecretRefs(env.data) : []),
    [env.category, env.data],
  );

  const handleExistingSecretUpdate = React.useCallback(
    (refs: ExistingSecretKeyRef[]) => {
      onUpdate({
        ...env,
        category: SecretCategory.EXISTING,
        data: serializeExistingSecretRefs(refs),
      });
    },
    [env, onUpdate],
  );

  const baseOptions: Record<string, { label: string; render: React.ReactNode }> = {
    [SecretCategory.GENERIC]: {
      label: 'Key / value',
      render: (
        <GenericKeyValuePairField
          values={env.data.length === 0 ? [EMPTY_KEY_VALUE_PAIR] : env.data}
          onUpdate={(newEnvData) => onUpdate({ ...env, data: newEnvData })}
          valueIsSecret
        />
      ),
    },
    [SecretCategory.UPLOAD]: {
      label: 'Upload',
      render: (
        <EnvUploadField
          envVarType={EnvironmentVariableType.SECRET}
          onUpdate={(newEnvData) => onUpdate({ ...env, data: newEnvData })}
          translateValue={(value) => atob(value)}
        />
      ),
    },
  };

  // Only show "Existing secret" option when namespace is available and RBAC is loaded
  if (namespace && (canListSecrets || !canListSecretsLoaded)) {
    baseOptions[SecretCategory.EXISTING] = {
      label: 'Existing secret',
      render: (
        <EnvExistingSecretField
          existingSecretRefs={existingSecretRefs}
          onUpdate={handleExistingSecretUpdate}
          namespace={namespace}
          canListSecrets={canListSecrets}
          canListSecretsLoaded={canListSecretsLoaded}
        />
      ),
    };
  }

  return (
    <EnvDataTypeField
      selection={env.category || ''}
      onSelection={(value) =>
        onUpdate({ ...env, category: asEnumMember(value, SecretCategory), data: [] })
      }
      options={baseOptions}
    />
  );
};

export default EnvSecret;
