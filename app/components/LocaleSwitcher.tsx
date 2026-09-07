'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useLocale, type Locale } from '../lib/i18n'
import styles from './LocaleSwitcher.module.scss'

const OPTIONS: Array<{ value: Locale; label: string }> = [
  { value: 'en', label: '🇬🇧 English' },
  { value: 'pt-PT', label: '🇵🇹 Português (Portugal)' },
]

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const activeOption = OPTIONS.find((option) => option.value === locale) ?? OPTIONS[0]

  useEffect(() => {
    if (!isOpen) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    window.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen])

  const selectLocale = (nextLocale: Locale) => {
    setLocale(nextLocale)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className={styles.localeSwitcher} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={clsx(styles.trigger, isOpen && styles.triggerOpen)}
        aria-label={t('language')}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className={styles.triggerLabel}>{activeOption.label}</span>
        <span className={styles.chevron} aria-hidden="true">▾</span>
      </button>
      <div className={clsx(styles.menuContainer, isOpen && styles.menuOpen)}>
        <ul className={styles.menu} role="listbox" aria-label={t('language')}>
          {OPTIONS.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === locale}>
              <button
                type="button"
                className={clsx(styles.option, option.value === locale && styles.optionActive)}
                onClick={() => selectLocale(option.value)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
