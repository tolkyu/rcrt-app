import { describe, expect, it } from 'vitest';
import { isPiiKey } from '@/server/audit';

describe('Audit detail key guard [SEC-CORE-07, CR-P1-02]', () => {
  it.each([
    'email',
    'candidateEmail',
    'phoneLike',
    'meetLink',
    'fullName',
    'filename',
    'fileName',
    'notes',
    'comments',
    'addresses',
    'telegram',
    'salaryGross',
    'terms',
    'message2',
  ])('rejects %s', (key) => {
    expect(isPiiKey(key)).toBe(true);
  });

  it.each([
    'profileId',
    'contextId',
    'linkedAt',
    'renamed',
    'reason',
    'method',
    'inviteId',
    'removedFactors',
    'factorListingFailed',
    'sessionsRevoked',
    'dryRun',
    'count',
  ])('accepts %s', (key) => {
    expect(isPiiKey(key)).toBe(false);
  });
});
