import messages from '../../messages/uk.json' with { type: 'json' };

export const markers = {
  cookie: 'synthetic-cookie-ci-log-01-782fc',
  refresh: 'synthetic-refresh-ci-log-01-604de',
  authorization: 'synthetic-bearer-ci-log-01-a35db',
  metadata: 'synthetic-user-metadata-ci-log-01-f431e',
  projectMetadata: 'synthetic-project-metadata-ci-log-01-d9852',
  gitDiff: 'synthetic-auto-git-diff-ci-log-01-b31f7',
  tag: 'synthetic-tag-ci-log-01-8902c',
  person: 'MarinaZoriaUnlabelled418',
  input: 'OpaqueInputValue73920',
  url: 'OpaqueAddressSegment62491',
};

export const contextCopy = {
  card: messages.errors.appErrorTitle,
  toast: messages.profile.saveFailed,
};

export const credentialDiagnostic = () =>
  `route.fetch: ECONNRESET\nCall log:\n  - Cookie: sb-local-auth-token.0=${markers.cookie}; sb-local-auth-token.1=${markers.refresh}\n  - Authorization: Bearer ${markers.authorization}`;
