import { getTranslations } from 'next-intl/server';
import { AuthCard, Spinner } from '@/components/auth/auth-card';

export default async function AuthLoading() {
  const t = await getTranslations('auth');
  return (
    <AuthCard title={t('brand')}>
      <Spinner label={t('loading')} />
    </AuthCard>
  );
}
