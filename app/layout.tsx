import type { Metadata } from 'next'
import Link from 'next/link'
import { BikeIcon, CalendarIcon, HomeIcon, PlugIcon, UserIcon } from './components/icons/AppIcons'
import { SettingsMenu } from './components/SettingsMenu'
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
        <header className="header">
          <div className="container">
            <div className="logo">
              <BikeIcon size={20} className="logoIcon" />
              VeloPlanner
            </div>
            <nav className="nav">
              <Link href="/" className="navButton navSimpleButton">
                <HomeIcon size={16} className="navIcon" />
                Overview
              </Link>
              <Link href="/plans" className="navButton">
                <CalendarIcon size={16} className="navIcon" />
                Coach
              </Link>
              <Link href="/integrations" className="navButton">
                <PlugIcon size={16} className="navIcon" />
                Connect data
              </Link>
              <Link href="/profile" className="navButton">
                <UserIcon size={16} className="navIcon" />
                Athlete
              </Link>
              <SettingsMenu />
            </nav>
            <Link href="/integrations" className="mobileIntegrationsQuickLink" aria-label="Open integrations">
              <PlugIcon size={16} className="navIcon" />
              Connect data
            </Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <p>&copy; 2026 VeloPlanner. All rights reserved.</p>
        </footer>
      </body>
    </html>
  )
}
