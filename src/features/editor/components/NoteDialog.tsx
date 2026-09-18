/**
 * 메모 편집 다이얼로그 — 제목 + 강조색 + 연관 테이블 (05-editor/02-ui.md §7)
 *
 * 오픈 지점: 메모 밴드 더블클릭. 색은 고르는 즉시 커밋해 메모가 실시간으로 변한다
 * (자유 색 픽커는 드래그 이벤트가 많아 400ms 디바운스로 1커밋). 제목·연관 테이블은 저장 버튼으로 확정.
 * 연관 테이블은 메모를 테이블 위에 드래그해 놓는 방법으로도 지정한다(ErdCanvas).
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NOTE_HEX_COLOR, type ErdNote } from '@/features/editor/model/content-schema'
import { PRESET_HEX, noteSkin } from './canvas/note-skin'

export interface NoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 대상 메모 — null이면 내용을 비운다 */
  note: ErdNote | null
  /** 연관 테이블 후보 — 문서의 테이블 전체 */
  tables: { id: string; physicalName: string }[]
  /** 색 즉시 확정 — 프리셋 클릭·자유 색 디바운스 만료 */
  onColorChange: (color: string) => void
  /** 제목 확정(저장 버튼) — 바뀐 경우에만 호출된다 */
  onTitleConfirm: (title: string) => void
  /** 연관 테이블 확정(저장 버튼) — 바뀐 경우에만 호출된다. null은 해제 */
  onLinkConfirm: (tableId: string | null) => void
}

/** 색 → 픽커 초기값(hex). 프리셋이면 대표 hex로 */
function pickerHex(color: string): string {
  return NOTE_HEX_COLOR.test(color) ? color : (PRESET_HEX[color as keyof typeof PRESET_HEX] ?? PRESET_HEX.yellow)
}

const COLOR_COMMIT_DEBOUNCE_MS = 400

export function NoteDialog({
  open,
  onOpenChange,
  note,
  tables,
  onColorChange,
  onTitleConfirm,
  onLinkConfirm,
}: NoteDialogProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  /** 선택된 연관 테이블 — ''는 없음(해제) */
  const [linked, setLinked] = useState('')
  const [custom, setCustom] = useState(PRESET_HEX.yellow)
  /** 자유 샅 디바운스 타이머 — 닫을 때 플러시해 그대로 두지 않는다 */
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 열릴마다 폼을 메모 값으로 초기화
  useEffect(() => {
    if (open && note) {
      setTitle(note.title)
      setLinked(note.linkedTableId ?? '')
      setCustom(pickerHex(note.color))
    }
  }, [open, note])

  useEffect(
    () => () => {
      if (colorTimer.current) clearTimeout(colorTimer.current)
    },
    [],
  )

  /** 대기 중 자유 색 커밋을 즉시 확정 */
  const flushColor = () => {
    if (!colorTimer.current) return
    clearTimeout(colorTimer.current)
    colorTimer.current = null
    onColorChange(custom)
  }

  const close = () => {
    flushColor()
    onOpenChange(false)
  }

  const save = () => {
    flushColor()
    if (note) {
      if (title !== note.title) onTitleConfirm(title)
      if ((note.linkedTableId ?? '') !== linked) onLinkConfirm(linked === '' ? null : linked)
    }
    onOpenChange(false)
  }

  const skin = note ? noteSkin(note.color) : null

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('model.editor.note.edit')}</DialogTitle>
          <DialogDescription>{t('model.editor.note.editDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="note-title-input">{t('model.editor.note.title')}</Label>
            <Input
              id="note-title-input"
              value={title}
              placeholder={t('model.editor.note.title')}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                // 조립(IME) 중 Enter는 확정으로 소비된다 — 여기서 저장하면 미완성 글자로 저장된다
                if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) save()
              }}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label>{t('model.editor.note.color')}</Label>
            <div className="flex items-center gap-2">
              {/* 프리셋 5색 — 클릭 즉시 확정 */}
              {(['yellow', 'green', 'blue', 'pink', 'purple'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={t('model.editor.note.color')}
                  aria-pressed={note?.color === preset}
                  className={`size-6 rounded-full border border-black/10 dark:border-white/10 ${
                    note?.color === preset ? 'ring-2 ring-amber-600/70 ring-offset-1' : ''
                  }`}
                  style={{ backgroundColor: PRESET_HEX[preset] }}
                  onClick={() => {
                    if (colorTimer.current) {
                      clearTimeout(colorTimer.current)
                      colorTimer.current = null
                    }
                    onColorChange(preset)
                  }}
                />
              ))}
              {/* 자유 색 픽커 — 드래그마다 이벤트가 오므로 슬립 후 1커밋 */}
              <input
                type="color"
                className="size-7 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                value={custom}
                aria-label={t('model.editor.note.customColor')}
                title={t('model.editor.note.customColor')}
                onChange={(event) => {
                  const next = event.target.value
                  setCustom(next)
                  if (colorTimer.current) clearTimeout(colorTimer.current)
                  colorTimer.current = setTimeout(() => {
                    colorTimer.current = null
                    onColorChange(next)
                  }, COLOR_COMMIT_DEBOUNCE_MS)
                }}
              />
              {/* 현재 색 미리보기 */}
              {skin ? (
                <span
                  aria-hidden
                  className={`ml-auto h-7 w-12 rounded-md border border-black/10 dark:border-white/10 ${skin.band}`}
                  style={skin.bandStyle}
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="note-link-select">{t('model.editor.note.linkedTable')}</Label>
            <Select value={linked} onValueChange={setLinked}>
              <SelectTrigger id="note-link-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('model.editor.note.noLink')}</SelectItem>
                {tables.map((table) => (
                  <SelectItem key={table.id} value={table.id}>
                    {table.physicalName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('model.editor.note.linkedHint')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={save}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
