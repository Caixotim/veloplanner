'use client'

import Link from 'next/link'
import { BikeIcon, PlugIcon, UserIcon } from './icons/AppIcons'
import { SettingsMenu } from './SettingsMenu'
import { LocaleSwitcher } from './LocaleSwitcher'
import { useLocale } from '../lib/i18n'
import { AuthStatus } from './AuthStatus'

export function AppHeader() {
  const { t } = useLocale()

  return (
    <header className="header">
      <div className="container">
        <div className="logo">
          <BikeIcon size={20} className="logoIcon" />
          VeloPlanner
        </div>
        <nav className="nav">
          <Link href="/integrations" className="navButton"><PlugIcon size={16} className="navIcon" />{t('connectData')}</Link>
          <Link href="/profile" className="navButton"><UserIcon size={16} className="navIcon" />{t('athlete')}</Link>
          <LocaleSwitcher />
          <SettingsMenu />
          <AuthStatus />
        </nav>
        <Link href="/integrations" className="mobileIntegrationsQuickLink" aria-label={t('connectData')}>
          <PlugIcon size={16} className="navIcon" />
          {t('connectData')}
        </Link>
      </div>
    </header>
  )
}
