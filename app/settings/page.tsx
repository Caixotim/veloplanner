'use client'

import Link from 'next/link'
import { LocaleSwitcher } from '../components/LocaleSwitcher'
import { ThemeSelector } from '../components/ThemeSelector'
import { useLocale } from '../lib/i18n'
import styles from './page.module.scss'

export default function SettingsPage() {
  const { locale } = useLocale()
  const isPortuguese = locale === 'pt-PT'

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <h1>{isPortuguese ? 'Definições' : 'Settings'}</h1>
        <div className={styles.control}>
          <h2>{isPortuguese ? 'Idioma' : 'Language'}</h2>
          <LocaleSwitcher />
        </div>
        <div className={styles.control}>
          <h2>{isPortuguese ? 'Tema' : 'Theme'}</h2>
          <ThemeSelector />
        </div>
        <Link href="/profile" className={styles.profileLink}>
          {isPortuguese ? 'Abrir perfil do atleta' : 'Open athlete profile'}
        </Link>
      </div>
    </section>
  )
}