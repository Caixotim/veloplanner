'use client'

import Link from 'next/link'
import { BikeIcon, PlugIcon, UserIcon } from './icons/AppIcons'
import { SettingsMenu } from './SettingsMenu'
import { LocaleSwitcher } from './LocaleSwitcher'
import { useLocale } from '../lib/i18n'
import { AuthStatus } from './AuthStatus'
import { useState } from 'react'

export function AppHeader() {
  const { t } = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="header">
      <div className="container">
        <div className="logo">
          <BikeIcon size={20} className="logoIcon" />
          VeloPlanner
        </div>
        <button
          type="button"
          className="mobileMenuToggle"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="global-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
        </button>
        <nav id="global-navigation" className={`nav${menuOpen ? ' navOpen' : ''}`}>
          <Link href="/coach" className="navButton" onClick={closeMenu}>{t('home')}</Link>
          <Link href="/integrations" className="navButton" onClick={closeMenu}><PlugIcon size={16} className="navIcon" />{t('connectData')}</Link>
          <Link href="/profile" className="navButton" onClick={closeMenu}><UserIcon size={16} className="navIcon" />{t('athlete')}</Link>
          <LocaleSwitcher />
          <SettingsMenu />
          <AuthStatus />
        </nav>
      </div>
    </header>
  )
}
