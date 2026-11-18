import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import messages from '@/messages/uk.json';

const SERVICES = join(process.cwd(), 'server', 'services');
const ACTION = /action:\s*'(vacancy\.[a-z_]+)'/g;
const labels: Record<string, string> = messages.settings.audit.actions.vacancy;

function writtenVacancyActions(): string[] {
  const found = new Set<string>();
  for (const file of readdirSync(SERVICES).filter((f) => f.endsWith('.ts')))
    for (const [, code] of readFileSync(join(SERVICES, file), 'utf8').matchAll(
      ACTION,
    ))
      found.add(code!);
  return [...found].sort();
}

describe('audit viewer labels for vacancy actions [AUD, STORY-VAC-02-1, STORY-VAC-03-1, STORY-VAC-03-2]', () => {
  const written = writtenVacancyActions();

  it('the services write the actions this suite expects, so the scan cannot go blind', () => {
    expect(written).toEqual([
      'vacancy.created',
      'vacancy.recruiter_assigned',
      'vacancy.recruiter_unassigned',
      'vacancy.status_changed',
      'vacancy.team_lead_assigned',
      'vacancy.urgency_changed',
    ]);
  });

  it.each(written)('%s has a Ukrainian label, not «Інша дія»', (code) => {
    const label = labels[code.slice('vacancy.'.length)];
    expect(label).toMatch(/\p{Script=Cyrillic}/u);
    expect(label).not.toContain('{');
  });

  it('has no label for an action nothing writes', () => {
    expect(Object.keys(labels).sort()).toEqual(
      written.map((code) => code.slice('vacancy.'.length)),
    );
  });
});
