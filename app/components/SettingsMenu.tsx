'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ThemeSelector } from './ThemeSelector'
import styles from './SettingsMenu.module.scss'

interface SettingsMenuProps {
  className?: string
}

export function SettingsMenu({ className }: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

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

  const toggleMenu = () => {
    setIsOpen((prev) => !prev)
  }

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
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.menuPanel}>
          <div className={styles.menuTitle}>Settings</div>
          <ThemeSelector className={styles.themeSelectorWrapper} />
        </div>
      )}
    </div>
  )
}
