'use client'

import { useLocale } from '../lib/i18n'

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale()

  return (
    <label className="localeSwitcher">
      <span className="srOnly">{t('language')}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as 'en' | 'pt-PT')} aria-label={t('language')}>
        <option value="en">🇬🇧 English</option>
        <option value="pt-PT">🇵🇹 Português (Portugal)</option>
      </select>
    </label>
  )
}
