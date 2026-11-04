import { useState } from 'react'
import type { AutomationMode, AutomationSettings } from '@/api/types'
import { useUpdateAutomation } from './queries'

export const modeLabel: Record<AutomationMode, string> = { APPROVAL: '승인 후 실행', AUTO: '완전 자동' }

type Change = Pick<Partial<AutomationSettings>, 'enabled' | 'mode'>

const isFullAuto = (s: Pick<AutomationSettings, 'enabled' | 'mode'>) => s.enabled && s.mode === 'AUTO'

/** Applies on/off and mode changes, asking first when one would let devices move without approval. */
export function useAutomationChange(settings: AutomationSettings | undefined) {
  const update = useUpdateAutomation()
  const [waiting, setWaiting] = useState<Change | null>(null)

  const request = (change: Change) => {
    if (!settings) return
    if (isFullAuto({ ...settings, ...change }) && !isFullAuto(settings)) setWaiting(change)
    else update.mutate(change)
  }

  return {
    request,
    isSaving: update.isPending,
    confirm: {
      open: waiting !== null,
      title: '완전 자동으로 실행할까요?',
      message: '조건이 맞으면 창문과 가전이 승인 없이 움직입니다. 주변에 끼일 수 있는 사람이나 물건이 없는지 확인해 주세요.',
      confirmLabel: '완전 자동 켜기',
      onCancel: () => setWaiting(null),
      onConfirm: () => {
        if (waiting) update.mutate(waiting)
        setWaiting(null)
      },
    },
  }
}
