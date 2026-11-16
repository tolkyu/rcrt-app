import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { z } from 'zod';

export { redirectResponseSchema } from '@/lib/schemas/auth';

export interface TotpValues {
  code: string;
}

const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export const totpResolver: Resolver<TotpValues> = zodResolver(codeSchema);
