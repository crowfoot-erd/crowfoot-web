/**
 * 언어 선택기 (storyboard 00-common §3.1 [11] — 한국어/English)
 */
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setLanguage, SUPPORTED_LANGUAGES, type Language } from '@/lib/i18n'

export function LanguageSelect() {
  const { t, i18n } = useTranslation()
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Language)
    : 'ko'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={t('common.language.label')}>
          <Languages aria-hidden className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={current} onValueChange={(value) => setLanguage(value as Language)}>
          <DropdownMenuRadioItem value="ko">{t('common.language.ko')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">{t('common.language.en')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
