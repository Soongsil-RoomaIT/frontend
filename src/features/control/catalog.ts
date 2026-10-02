import { AirVent, Cpu, DoorClosed, DoorOpen, Droplets, Grid2x2, type LucideIcon } from 'lucide-react'
import type { Device, DeviceAction, DeviceState, KnownDeviceType } from '@/api/types'

/**
 * Everything type-specific about a device lives here, so a change in the hardware lineup
 * (new device, different actions) is a one-file edit.
 */
interface DeviceKind {
  icon: (state: DeviceState) => LucideIcon
  /** Used when the server doesn't send `actions` */
  defaultActions: DeviceAction[]
  /** Shown before running the action; null → runs immediately */
  confirm?: (action: DeviceAction) => string | null
  /** Shown when the device has no action for its current state */
  noActionHint?: (state: DeviceState) => string | null
}

const kinds: Record<KnownDeviceType, DeviceKind> = {
  WINDOW: {
    icon: () => Grid2x2,
    defaultActions: ['OPEN', 'CLOSE'],
  },
  DEHUMIDIFIER: {
    icon: () => Droplets,
    defaultActions: ['ON', 'OFF'],
  },
  AIR_PURIFIER: {
    icon: () => AirVent,
    defaultActions: ['ON', 'OFF'],
  },
  FRONT_DOOR: {
    icon: (state) => (state === 'OPEN' ? DoorOpen : DoorClosed),
    // Remote opening is a security risk (unlocking the home from anywhere) and isn't in FR-03/04,
    // so it's off unless the server explicitly lists OPEN in `actions`.
    defaultActions: ['CLOSE'],
    confirm: (action) =>
      action === 'CLOSE' ? '문 주변에 사람이나 물건이 없는지 확인한 뒤 닫아 주세요.' : null,
    noActionHint: (state) => (state === 'CLOSED' ? '보안을 위해 원격으로 열 수 없습니다' : null),
  },
}

const genericKind: DeviceKind = { icon: () => Cpu, defaultActions: [] }

export const kindOf = (type: string): DeviceKind =>
  Object.hasOwn(kinds, type) ? kinds[type as KnownDeviceType] : genericKind

export const isKnownType = (type: string): type is KnownDeviceType => Object.hasOwn(kinds, type)

/** The state an action leads to */
export const targetState: Record<DeviceAction, DeviceState> = {
  OPEN: 'OPEN',
  CLOSE: 'CLOSED',
  ON: 'ON',
  OFF: 'OFF',
}

export const stateLabel: Record<DeviceState, string> = {
  OPEN: '열림',
  CLOSED: '닫힘',
  ON: '켜짐',
  OFF: '꺼짐',
}

export const actionLabel: Record<DeviceAction, string> = {
  OPEN: '열기',
  CLOSE: '닫기',
  ON: '켜기',
  OFF: '끄기',
}

/** Question form for confirmations ("창문을 열까요?"); conjugation is irregular, so spelled out */
export const actionQuestion: Record<DeviceAction, string> = {
  OPEN: '열까요?',
  CLOSE: '닫을까요?',
  ON: '켤까요?',
  OFF: '끌까요?',
}

export const progressLabel: Record<DeviceAction, string> = {
  OPEN: '여는 중',
  CLOSE: '닫는 중',
  ON: '켜는 중',
  OFF: '끄는 중',
}

/** Actions the device supports at all (server-declared, else type default) */
export const supportedActions = (device: Device): DeviceAction[] =>
  device.actions ?? kindOf(device.type).defaultActions

/** Actions that would change the current state — what the UI offers as buttons */
export const availableActions = (device: Device): DeviceAction[] =>
  supportedActions(device).filter((a) => targetState[a] !== device.state)

export const isControllable = (device: Device) => supportedActions(device).length > 0
