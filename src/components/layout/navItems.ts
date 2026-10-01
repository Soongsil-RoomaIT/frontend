import { Bell, ChartLine, CloudSun, LayoutDashboard, Settings, SlidersHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shown in the mobile bottom tab bar (limited space) */
  mobile: boolean
}

export const navItems: NavItem[] = [
  { to: '/', label: '대시보드', icon: LayoutDashboard, mobile: true },
  { to: '/control', label: '기기 제어', icon: SlidersHorizontal, mobile: true },
  { to: '/history', label: '기록', icon: ChartLine, mobile: true },
  { to: '/forecast', label: '예보·추천', icon: CloudSun, mobile: false },
  { to: '/notifications', label: '알림', icon: Bell, mobile: true },
  { to: '/settings', label: '설정', icon: Settings, mobile: true },
]
