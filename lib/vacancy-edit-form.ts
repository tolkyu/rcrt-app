import type { VacancyDetail } from '@/lib/schemas/vacancy';
import type { VacancyFormValues } from '@/lib/vacancy-form';
import { formatSalaryAmount } from '@/lib/vacancy-salary';

/** Form text of a saved draft; kept Zod-free so the edit page holds it without the lazy module. */
export function vacancyFormValues(
  vacancy: VacancyDetail,
  withProbation: boolean,
): VacancyFormValues {
  return {
    verticalId: vacancy.vertical.id,
    positionId: vacancy.position?.id ?? '',
    title: vacancy.title,
    headcount: String(vacancy.headcount),
    priority: vacancy.priority,
    teamLeadId: vacancy.teamLead?.id ?? '',
    seniority: vacancy.seniority ?? '',
    workFormat: vacancy.workFormat ?? '',
    employmentType: vacancy.employmentType ?? '',
    location: vacancy.location ?? '',
    salaryMin: vacancy.salaryMinMinor
      ? formatSalaryAmount(vacancy.salaryMinMinor)
      : '',
    salaryMax: vacancy.salaryMaxMinor
      ? formatSalaryAmount(vacancy.salaryMaxMinor)
      : '',
    salaryCurrency: vacancy.salaryCurrency ?? '',
    probationDays: withProbation ? String(vacancy.probationDays) : '',
  };
}
