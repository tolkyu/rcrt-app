import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { GalleryGroup, GallerySection } from './gallery-section';

export async function ButtonsSection() {
  const t = await getTranslations('devUi.buttons');
  return (
    <GallerySection id="buttons" title={t('title')} hint={t('hint')}>
      <GalleryGroup title={t('variants')}>
        <Button>{t('default')}</Button>
        <Button variant="secondary">{t('secondary')}</Button>
        <Button variant="outline">{t('outline')}</Button>
        <Button variant="ghost">{t('ghost')}</Button>
        <Button variant="destructive">{t('destructive')}</Button>
        <Button variant="destructive-soft">{t('destructiveSoft')}</Button>
      </GalleryGroup>
      <GalleryGroup title={t('sizes')}>
        <Button size="sm">{t('small')}</Button>
        <Button size="md">{t('medium')}</Button>
        <Button size="lg">{t('large')}</Button>
        <Button size="icon" variant="outline" aria-label={t('iconLabel')}>
          <Plus aria-hidden="true" />
        </Button>
      </GalleryGroup>
      <GalleryGroup title={t('states')}>
        <Button className="scale-[0.97]">{t('pressed')}</Button>
        <Button disabled>{t('disabled')}</Button>
        <Button aria-disabled="true">{t('ariaDisabled')}</Button>
      </GalleryGroup>
    </GallerySection>
  );
}
