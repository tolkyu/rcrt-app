import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { z } from 'zod';

export {
  magicLinkResponseSchema,
  oauthStartResponseSchema,
} from '@/lib/schemas/auth-start';

export interface LoginValues {
  email: string;
}

const formSchema = z.object({
  email: z.string().trim().min(1, 'required').pipe(z.email('invalid')),
});

export const loginResolver: Resolver<LoginValues> = zodResolver(formSchema);
