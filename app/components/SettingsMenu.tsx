'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import Link from 'next/link'
import { ThemeSelector } from './ThemeSelector'
import { LocaleSwitcher } from './LocaleSwitcher'
import { useLocale } from '../lib/i18n'
import styles from './SettingsMenu.module.scss'

interface SettingsMenuProps {
  className?: string
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SettingsMenu({ className, isOpen: controlledOpen, onOpenChange }: SettingsMenuProps) {
  const { isPortuguese, t } = useLocale()
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const isOpen = controlledOpen ?? internalOpen
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const setIsOpen = (open: boolean) => {
    if (!isControlled) {
      setInternalOpen(open)
    }
    onOpenChange?.(open)
  }

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleClickOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    window.addEventListener('pointerdown', handleClickOutside)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('pointerdown', handleClickOutside)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const toggleMenu = () => setIsOpen(!isOpen)

  return (
    <div className={clsx(styles.settingsMenu, className)} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.settingsButton}
        aria-label="Open settings menu"
        aria-expanded={isOpen}
        onClick={toggleMenu}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
          <path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3.1 1.3v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3.1-1.3l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-1.3-3.1h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 1.3-3.1l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3.1-1.3v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3.1 1.3l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 1.3 3.1h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-1.3 3.1Z" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.menuPanel}>
          <div className={styles.menuTitle}>{isPortuguese ? 'Definições' : 'Settings'}</div>
          <div className={styles.menuControl}>
            <div className={styles.menuLabel}>{t('language')}</div>
            <LocaleSwitcher />
          </div>
          <div className={styles.menuControl}>
            <div className={styles.menuLabel}>{isPortuguese ? 'Tema' : 'Theme'}</div>
            <ThemeSelector className={styles.themeSelectorWrapper} />
          </div>
          <Link href="/profile" className={styles.profileLink} onClick={() => setIsOpen(false)}>
            {isPortuguese ? 'Abrir perfil do atleta' : 'Open athlete profile'}
          </Link>
        </div>
      )}
    </div>
  )
}
