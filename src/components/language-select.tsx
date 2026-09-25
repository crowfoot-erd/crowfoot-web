/**
 * 언어 선택기 (storyboard 00-common §3.1 [11] — 한국어·English·日本語·中文)
 * 항목은 각 언어의 자칭 라벨(common.language.*)로 표시하고, 선택 시 URL prefix를 교체한다.
 */
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useChangeLanguage } from '@/hooks/use-change-language'
import { SUPPORTED_LANGUAGES, type Language, currentLanguage } from '@/lib/i18n'

export function LanguageSelect() {
  const { t } = useTranslation()
  const changeLanguage = useChangeLanguage()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={t('common.language.label')}>
          <Globe aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={currentLanguage()}
          onValueChange={(value) => changeLanguage(value as Language)}
        >
          {SUPPORTED_LANGUAGES.map((language) => (
            <DropdownMenuRadioItem key={language} value={language}>
              {t(`common.language.${language}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
