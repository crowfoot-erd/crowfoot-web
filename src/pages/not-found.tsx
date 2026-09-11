/**
 * 404 페이지 (storyboard 00-common §4.2 — 셸 밖 단독 렌더, AdminRoute 비관리자 은닉에도 사용)
 */
import { useTranslation } from 'react-i18next'

import { NotFoundContent } from '@/components/not-found-content'

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <NotFoundContent
        title={t('notFound.title')}
        description={t('notFound.description')}
        backTo={{ to: '/', label: t('notFound.home') }}
      />
    </div>
  )
}
