import { Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

/**
 * Theme switch for the top bar.
 *
 * Reads through `useTheme`, the same shared store the settings-drawer switch
 * reads through -- see the note on `listeners` in lib/theme.ts for why a
 * private `useState` here used to fall out of sync with that other switch.
 *
 * The icon shows the theme you will GET, not the one you are in, and the label
 * says so explicitly, because a lone sun/moon glyph is ambiguous in both
 * directions and people misread it about half the time.
 */
export function ThemeToggle({ onDark }: { onDark?: boolean }) {
  const [theme, setTheme] = useTheme()

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const Icon = next === 'dark' ? Moon : Sun

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm',
        'transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1',
        onDark
          ? 'text-navbar-muted hover:bg-white/10 hover:text-navbar-foreground focus-visible:outline-white'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-ring',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}
