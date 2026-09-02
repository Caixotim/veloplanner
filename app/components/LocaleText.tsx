'use client'

import { useLocale } from '../lib/i18n'

export function LocaleText({ children }: { children: string }) {
  const { isPortuguese, t } = useLocale()
  return <>{isPortuguese && children === 'All rights reserved.' ? t('allRightsReserved') : children}</>
}
