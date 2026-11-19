import { describe, expect, it } from 'vitest';
import { removeThrowawayPositions } from '../postman/cleanup';

describe('throwaway position cleanup guard [ADR-013]', () => {
  it.each([
    '',
    'Медіа',
    'Медіабаєр — Facebook',
    'Тест',
    'Тест API',
    'Тест QA ',
  ])(
    'refuses the prefix «%s» before it touches any connection',
    async (prefix) => {
      await expect(removeThrowawayPositions({}, prefix)).rejects.toThrow(
        'not a test prefix',
      );
    },
  );
});
