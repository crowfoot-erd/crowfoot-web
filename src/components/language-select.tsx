/**
 * 언어 선택기 (storyboard 00-common §3.1 [11] — 한국어/English)
 */
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
          {/* lucide Languages 아이콘은 文A(중문·영문) 글리프라 한국어·English 전환과 어긋난다 — 한/EN 표기 */}
          <span aria-hidden className="text-[11px] font-semibold leading-none tracking-tight">
            한/EN
          </span>
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
