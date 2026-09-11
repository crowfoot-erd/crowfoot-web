/**
 * 404·존재 은닉 콘텐츠 (storyboard 00-common §4.2 — 대상명 + 목록 복귀)
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface NotFoundContentProps {
  title: string
  description: string
  backTo: { to: string; label: string }
}

export function NotFoundContent({ title, description, backTo }: NotFoundContentProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p aria-hidden className="text-5xl font-light tracking-widest text-muted-foreground/50">
        404
      </p>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to={backTo.to}>{backTo.label}</Link>
      </Button>
      <span className="sr-only">{t('notFound.title')}</span>
    </div>
  )
}
