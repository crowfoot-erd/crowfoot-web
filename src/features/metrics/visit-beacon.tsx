/**
 * 접속 비콘 트리거 — BrowserRouter 안에 렌더만 하면 부팅·라우트 변경마다 송신한다.
 * 화면 요소는 없다(null 렌더). 언어 prefix(/en 등) 포함 경로를 그대로 보내면
 * 서버가 path_group으로 정규화한다(10-metrics.md §4.4).
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { sendVisitBeacon } from './beacon'

export function VisitBeacon() {
  const location = useLocation()

  useEffect(() => {
    sendVisitBeacon({ path: location.pathname, referrer: document.referrer || undefined })
  }, [location.pathname])

  return null
}
