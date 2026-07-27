'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import styles from './ThemeSelector.module.scss'

type ThemeId = 'light' | 'dark' | 'neon'

interface ThemeSelectorProps {
  className?: string
  defaultTheme?: ThemeId
  storageKey?: string
  onThemeChange?: (theme: ThemeId) => void
}

type ThemeOption = {
  id: ThemeId
  label: string
  preview: {
    bg: string
    accent: string
  }
}

const ROOT_THEME_ATTRIBUTE = 'data-theme'

const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  'dark-premium': 'dark',
  glassmorphism: 'neon',
  neobrutalism: 'neon',
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    label: 'Light Mode',
    preview: {
      bg: '#f7f9fc',
      accent: '#1f6feb',
    },
  },
  {
    id: 'dark',
    label: 'Dark Mode',
    preview: {
      bg: '#0f1420',
      accent: '#7dc4ff',
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    preview: {
      bg: '#0a0616',
      accent: '#39ffb6',
    },
  },
]

function isThemeId(value: string | null): value is ThemeId {
  return THEME_OPTIONS.some((option) => option.id === value)
}

export function ThemeSelector({
  className,
  defaultTheme = 'light',
  storageKey = 'cycling-ai-theme',
  onThemeChange,
}: ThemeSelectorProps) {
  const selectorId = useId()
  const listboxId = `${selectorId}-listbox`
  const optionIdPrefix = `${selectorId}-option`

  const [activeTheme, setActiveTheme] = useState<ThemeId>(defaultTheme)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const activeIndex = useMemo(
    () => THEME_OPTIONS.findIndex((option) => option.id === activeTheme),
    [activeTheme],
  )

  const highlightedOptionId = isOpen ? `${optionIdPrefix}-${highlightedIndex}` : undefined

  useEffect(() => {
    // Hydrate theme from storage/DOM and ensure both html/body receive the same data-theme.
    const fromStorage = window.localStorage.getItem(storageKey)
    const fromDom = document.documentElement.getAttribute(ROOT_THEME_ATTRIBUTE)
    const normalizedFromStorage = fromStorage ? (LEGACY_THEME_MAP[fromStorage] ?? fromStorage) : null
    const normalizedFromDom = fromDom ? (LEGACY_THEME_MAP[fromDom] ?? fromDom) : null

    const initialTheme = isThemeId(normalizedFromStorage)
      ? normalizedFromStorage
      : isThemeId(normalizedFromDom)
        ? normalizedFromDom
        : defaultTheme

    applyTheme(initialTheme)
    setHighlightedIndex(THEME_OPTIONS.findIndex((option) => option.id === initialTheme))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTheme, storageKey])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onEscape)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onEscape)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    optionRefs.current[highlightedIndex]?.focus()
  }, [highlightedIndex, isOpen])

  const applyTheme = (theme: ThemeId) => {
    // Single source of truth: update component state, persist value, and write data-theme attributes.
    setActiveTheme(theme)
    document.documentElement.setAttribute(ROOT_THEME_ATTRIBUTE, theme)
    document.body.setAttribute(ROOT_THEME_ATTRIBUTE, theme)
    window.localStorage.setItem(storageKey, theme)
    onThemeChange?.(theme)
  }

  const selectTheme = (theme: ThemeId, index: number) => {
    applyTheme(theme)
    setHighlightedIndex(index)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const handleTriggerClick = () => {
    const nextOpen = !isOpen
    setIsOpen(nextOpen)
    if (nextOpen) {
      setHighlightedIndex(activeIndex >= 0 ? activeIndex : 0)
    }
  }

  const handleListboxKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev + 1) % THEME_OPTIONS.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setHighlightedIndex(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      setHighlightedIndex(THEME_OPTIONS.length - 1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const option = THEME_OPTIONS[highlightedIndex]
      selectTheme(option.id, highlightedIndex)
      return
    }

    if (event.key === 'Tab') {
      setIsOpen(false)
    }
  }

  const activeThemeLabel = THEME_OPTIONS.find((option) => option.id === activeTheme)?.label ?? 'Theme'

  return (
    <div className={clsx(styles.themeSelector, className)} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={clsx(styles.trigger, isOpen && styles.triggerOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={handleTriggerClick}
      >
        <span className={styles.triggerLabel}>Theme: {activeThemeLabel}</span>
        <span className={styles.chevron} aria-hidden="true">▾</span>
      </button>

      <div className={clsx(styles.menuContainer, isOpen && styles.menuOpen)}>
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Theme selector"
          aria-activedescendant={highlightedOptionId}
          tabIndex={-1}
          className={styles.menu}
          onKeyDown={handleListboxKeyDown}
        >
          {THEME_OPTIONS.map((option, index) => {
            const isActive = option.id === activeTheme
            const isHighlighted = index === highlightedIndex

            return (
              <li key={option.id} role="option" aria-selected={isActive} id={`${optionIdPrefix}-${index}`}>
                <button
                  ref={(node) => {
                    optionRefs.current[index] = node
                  }}
                  type="button"
                  className={clsx(styles.option, isActive && styles.optionActive, isHighlighted && styles.optionHighlighted)}
                  onClick={() => selectTheme(option.id, index)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className={styles.previewGrid} aria-hidden="true">
                    <span
                      className={styles.previewSwatch}
                      style={{ backgroundColor: option.preview.bg }}
                    />
                    <span
                      className={styles.previewSwatch}
                      style={{ backgroundColor: option.preview.accent }}
                    />
                  </span>

                  <span className={styles.optionText}>{option.label}</span>

                  {isActive && (
                    <span className={styles.activePill}>
                      <svg viewBox="0 0 20 20" className={styles.tick} aria-hidden="true">
                        <path d="M4.5 10.5l3.3 3.3 7.7-7.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Active
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
