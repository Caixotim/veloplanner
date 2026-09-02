import type { Metadata } from 'next'
import { AppHeader } from './components/AppHeader'
import { LocaleText } from './components/LocaleText'
import { LocaleProvider } from './lib/i18n'
import './globals.css'
import './print.css'

export const metadata: Metadata = {
  title: 'VeloPlanner',
  description: 'Cycling training planner with Intervals.icu integration',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const key = 'cycling-ai-theme';
    const raw = window.localStorage.getItem(key);
    const legacyMap = {
      'dark-premium': 'dark',
      glassmorphism: 'neon',
      neobrutalism: 'neon',
    };
    const normalized = raw && legacyMap[raw] ? legacyMap[raw] : raw;
    const valid = normalized === 'light' || normalized === 'dark' || normalized === 'neon';
    const theme = valid ? normalized : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
  } catch (_error) {
    document.documentElement.setAttribute('data-theme', 'light');
    document.body.setAttribute('data-theme', 'light');
  }
})();`,
          }}
        />
        <LocaleProvider>
        <AppHeader />
        <main>{children}</main>
        <footer className="footer">
          <p>&copy; 2026 VeloPlanner. <LocaleText>All rights reserved.</LocaleText></p>
        </footer>
        </LocaleProvider>
      </body>
    </html>
  )
}
