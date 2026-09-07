'use client'

import { useLocale } from '../lib/i18n'
import styles from './page.module.scss'

export default function LoginPage() {
  const { locale } = useLocale()
  const isPortuguese = locale === 'pt-PT'

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <h1>{isPortuguese ? 'Entrar no VeloPlanner' : 'Sign in to VeloPlanner'}</h1>
        <p>
          {isPortuguese
            ? 'Crie ou abra a sua conta para guardar o perfil de atleta e os planos na nuvem.'
            : 'Create or open your account to save your athlete profile and training plans in the cloud.'}
        </p>
        <a className={styles.googleButton} href="/api/auth/google">
          {isPortuguese ? 'Continuar com Google' : 'Continue with Google'}
        </a>
      </div>
    </section>
  )
}
