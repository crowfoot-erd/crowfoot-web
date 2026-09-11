/**
 * 테마 토글 (storyboard 00-common §3.1 [10] — 라이트/다크/시스템 순환 선택)
 */
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme, type Theme } from '@/lib/theme'

export function ThemeToggle() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('common.theme.label')}
          className="relative"
        >
          <Sun
            aria-hidden
            className="h-4 w-4 scale-100 rotate-0 transition-transform duration-200 dark:scale-0 dark:-rotate-90"
          />
          <Moon
            aria-hidden
            className="absolute h-4 w-4 scale-0 rotate-90 transition-transform duration-200 dark:scale-100 dark:rotate-0"
          />
          {theme === 'system' ? (
            <Monitor aria-hidden className="absolute h-4 w-4 text-muted-foreground" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuRadioItem value="light">{t('common.theme.light')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t('common.theme.dark')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">{t('common.theme.system')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
