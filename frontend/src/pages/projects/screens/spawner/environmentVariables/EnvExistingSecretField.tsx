import * as React from 'react';
import { Alert, Divider, Flex, FlexItem, Spinner, Stack, StackItem } from '@patternfly/react-core';
import type { SecretKind } from '@odh-dashboard/k8s-core';
import { ExistingSecretKeyRef } from '#~/pages/projects/types';
import TypeaheadSelect, { TypeaheadSelectOption } from '#~/components/TypeaheadSelect';
import { useExistingSecrets } from './useExistingSecrets';
import ExistingSecretKeyPicker from './ExistingSecretKeyPicker';

type EnvExistingSecretFieldProps = {
  existingSecretRefs: ExistingSecretKeyRef[];
  onUpdate: (refs: ExistingSecretKeyRef[]) => void;
  namespace: string;
  canListSecrets: boolean;
  canListSecretsLoaded: boolean;
};

const EnvExistingSecretField: React.FC<EnvExistingSecretFieldProps> = ({
  existingSecretRefs,
  onUpdate,
  namespace,
  canListSecrets,
  canListSecretsLoaded,
}) => {
  const { secrets, loaded, error, fetch: fetchSecrets } = useExistingSecrets(namespace);
  const hasFetchedRef = React.useRef(false);

  // Lazy-load: fetch secrets on first render of this component
  React.useEffect(() => {
    if (!hasFetchedRef.current && canListSecrets && canListSecretsLoaded) {
      hasFetchedRef.current = true;
      fetchSecrets();
    }
  }, [canListSecrets, canListSecretsLoaded, fetchSecrets]);

  const selectedNames = React.useMemo(
    () => new Set(existingSecretRefs.map((ref) => ref.secretName)),
    [existingSecretRefs],
  );

  const secretOptions: TypeaheadSelectOption[] = React.useMemo(
    () =>
      secrets
        .filter((s: SecretKind) => !selectedNames.has(s.metadata.name))
        .map(
          (s: SecretKind): TypeaheadSelectOption => ({
            content: s.metadata.name,
            value: s.metadata.name,
          }),
        ),
    [secrets, selectedNames],
  );

  const handleSelectSecret = (
    _event:
      | React.MouseEvent<Element, MouseEvent>
      | React.KeyboardEvent<HTMLInputElement>
      | undefined,
    selection: string | number,
  ) => {
    const value = String(selection);
    if (!selectedNames.has(value)) {
      onUpdate([...existingSecretRefs, { secretName: value, allKeys: true, selectedKeys: [] }]);
    }
  };

  const handleUpdateRef = (index: number, updated: ExistingSecretKeyRef) => {
    const newRefs = [...existingSecretRefs];
    newRefs[index] = updated;
    onUpdate(newRefs);
  };

  const handleRemoveRef = (index: number) => {
    onUpdate(existingSecretRefs.filter((_, i) => i !== index));
  };

  if (!canListSecretsLoaded) {
    return (
      <Flex>
        <FlexItem>
          <Spinner size="md" aria-label="Checking permissions" />
        </FlexItem>
        <FlexItem>Checking permissions...</FlexItem>
      </Flex>
    );
  }

  if (!canListSecrets) {
    return (
      <Alert
        variant="info"
        isInline
        isPlain
        title="You do not have permission to list secrets in this namespace."
        data-testid="no-secret-list-permission"
      />
    );
  }

  if (error) {
    return (
      <Alert
        variant="danger"
        isInline
        isPlain
        title={`Failed to load secrets: ${error.message}`}
        data-testid="secret-load-error"
      />
    );
  }

  if (!loaded) {
    return (
      <Flex>
        <FlexItem>
          <Spinner size="md" aria-label="Loading secrets" />
        </FlexItem>
        <FlexItem>Loading secrets...</FlexItem>
      </Flex>
    );
  }

  return (
    <Stack hasGutter>
      <StackItem data-testid="existing-secret-select">
        <TypeaheadSelect
          selectOptions={secretOptions}
          onSelect={handleSelectSecret}
          placeholder="Select a secret to add"
          noOptionsFoundMessage="No matching secrets found"
          allowClear={false}
        />
      </StackItem>
      {existingSecretRefs.map((ref, i) => (
        <React.Fragment key={ref.secretName}>
          {i > 0 && <Divider />}
          <StackItem>
            <ExistingSecretKeyPicker
              secretRef={ref}
              namespace={namespace}
              onChange={(updated) => handleUpdateRef(i, updated)}
              onRemove={() => handleRemoveRef(i)}
            />
          </StackItem>
        </React.Fragment>
      ))}
    </Stack>
  );
};

export default EnvExistingSecretField;
