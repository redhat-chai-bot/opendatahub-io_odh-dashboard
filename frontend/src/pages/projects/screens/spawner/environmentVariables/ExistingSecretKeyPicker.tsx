import * as React from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Flex,
  FlexItem,
  Spinner,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';
import { MinusCircleIcon } from '@patternfly/react-icons';
import type { SecretKind } from '@odh-dashboard/k8s-core';
import { getSecret } from '#~/api';
import { ExistingSecretKeyRef } from '#~/pages/projects/types';

type ExistingSecretKeyPickerProps = {
  secretRef: ExistingSecretKeyRef;
  namespace: string;
  onChange: (updated: ExistingSecretKeyRef) => void;
  onRemove: () => void;
};

const ExistingSecretKeyPicker: React.FC<ExistingSecretKeyPickerProps> = ({
  secretRef,
  namespace,
  onChange,
  onRemove,
}) => {
  const [availableKeys, setAvailableKeys] = React.useState<string[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | undefined>();

  React.useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setFetchError(undefined);

    getSecret(namespace, secretRef.secretName)
      .then((secret: SecretKind) => {
        if (!cancelled) {
          setAvailableKeys(Object.keys(secret.data || {}));
          setLoaded(true);
        }
      })
      .catch((e: { statusObject?: { code?: number }; message?: string }) => {
        if (!cancelled) {
          if (e.statusObject?.code === 404) {
            setFetchError(`Secret "${secretRef.secretName}" no longer exists in the cluster.`);
          } else {
            setFetchError(`Failed to fetch secret keys: ${e.message || 'Unknown error'}`);
          }
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [namespace, secretRef.secretName]);

  // Detect missing keys: keys the user previously selected that no longer exist in the secret
  const missingKeys = React.useMemo(() => {
    if (!loaded || fetchError || secretRef.allKeys) {
      return [];
    }
    return secretRef.selectedKeys.filter((k) => !availableKeys.includes(k));
  }, [loaded, fetchError, secretRef.allKeys, secretRef.selectedKeys, availableKeys]);

  const handleAllKeysToggle = (_event: React.FormEvent<HTMLInputElement>, checked: boolean) => {
    onChange({
      ...secretRef,
      allKeys: checked,
      selectedKeys: checked ? [] : availableKeys,
    });
  };

  const handleKeyToggle = (key: string, checked: boolean) => {
    const updated = checked
      ? [...secretRef.selectedKeys, key]
      : secretRef.selectedKeys.filter((k) => k !== key);
    onChange({ ...secretRef, selectedKeys: updated });
  };

  const handleRemoveMissingKeys = () => {
    onChange({
      ...secretRef,
      selectedKeys: secretRef.selectedKeys.filter((k) => availableKeys.includes(k)),
    });
  };

  return (
    <Stack hasGutter data-testid={`secret-key-picker-${secretRef.secretName}`}>
      <StackItem>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h5" size="md">
              {secretRef.secretName}
            </Title>
          </SplitItem>
          <SplitItem>
            <Button
              variant="plain"
              aria-label={`Remove secret ${secretRef.secretName}`}
              icon={<MinusCircleIcon />}
              onClick={onRemove}
              data-testid={`remove-secret-${secretRef.secretName}`}
            />
          </SplitItem>
        </Split>
      </StackItem>

      {fetchError ? (
        <StackItem>
          <Alert
            variant="danger"
            isInline
            isPlain
            title={fetchError}
            data-testid={`secret-error-${secretRef.secretName}`}
          >
            <Button variant="link" isInline onClick={onRemove}>
              Remove this reference
            </Button>
          </Alert>
        </StackItem>
      ) : !loaded ? (
        <StackItem>
          <Flex>
            <FlexItem>
              <Spinner size="md" aria-label="Loading secret keys" />
            </FlexItem>
            <FlexItem>Loading keys...</FlexItem>
          </Flex>
        </StackItem>
      ) : (
        <>
          <StackItem>
            <Checkbox
              id={`all-keys-${secretRef.secretName}`}
              label="All keys"
              isChecked={secretRef.allKeys}
              onChange={handleAllKeysToggle}
              data-testid={`all-keys-checkbox-${secretRef.secretName}`}
            />
          </StackItem>
          {!secretRef.allKeys && (
            <StackItem>
              <Stack hasGutter>
                {availableKeys.map((key) => (
                  <StackItem key={key}>
                    <Checkbox
                      id={`key-${secretRef.secretName}-${key}`}
                      label={key}
                      isChecked={secretRef.selectedKeys.includes(key)}
                      onChange={(_event, checked) => handleKeyToggle(key, checked)}
                      data-testid={`key-checkbox-${secretRef.secretName}-${key}`}
                    />
                  </StackItem>
                ))}
              </Stack>
            </StackItem>
          )}
          {missingKeys.length > 0 && (
            <StackItem>
              <Alert
                variant="warning"
                isInline
                isPlain
                title={`The following keys no longer exist in the secret: ${missingKeys.join(
                  ', ',
                )}`}
                data-testid={`missing-keys-warning-${secretRef.secretName}`}
              >
                <Button variant="link" isInline onClick={handleRemoveMissingKeys}>
                  Remove missing keys
                </Button>
              </Alert>
            </StackItem>
          )}
        </>
      )}
    </Stack>
  );
};

export default ExistingSecretKeyPicker;
