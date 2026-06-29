import * as React from 'react';
import { k8sListResource } from '@openshift/dynamic-plugin-sdk-utils';
import type { SecretKind } from '@odh-dashboard/k8s-core';
import { SecretModel } from '#~/api/models';
import { isConnection } from '#~/concepts/connectionTypes/utils';
import { useAccessReview } from '#~/api/useAccessReview';

type UseExistingSecretsReturn = {
  secrets: SecretKind[];
  loaded: boolean;
  error: Error | undefined;
  fetch: () => void;
};

/**
 * Lazy-loading hook that lists all Opaque secrets in a namespace,
 * filtering out Connection secrets. Only fetches when `fetch()` is called.
 */
export const useExistingSecrets = (namespace: string): UseExistingSecretsReturn => {
  const [secrets, setSecrets] = React.useState<SecretKind[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<Error | undefined>();

  const fetchSecrets = React.useCallback(() => {
    if (!namespace) {
      return;
    }
    setLoaded(false);
    setError(undefined);

    k8sListResource<SecretKind>({
      model: SecretModel,
      queryOptions: {
        ns: namespace,
        queryParams: { fieldSelector: 'type=Opaque' },
      },
    })
      .then((result) => {
        const filtered = result.items.filter((secret) => !isConnection(secret));
        setSecrets(filtered);
        setLoaded(true);
      })
      .catch((e: Error) => {
        setError(e);
        setLoaded(true);
      });
  }, [namespace]);

  return { secrets, loaded, error, fetch: fetchSecrets };
};

/**
 * Check whether the current user has RBAC permission to list secrets in a namespace.
 */
export const useCanListSecrets = (namespace: string): [boolean, boolean] =>
  useAccessReview(
    {
      group: '',
      resource: 'secrets',
      verb: 'list',
      namespace,
    },
    !!namespace,
  );
