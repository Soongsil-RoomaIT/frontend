import { Bell, ChartLine, CloudSun, LayoutDashboard, Settings, SlidersHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { to: '/', label: '대시보드', icon: LayoutDashboard },
  { to: '/control', label: '기기 제어', icon: SlidersHorizontal },
  { to: '/history', label: '기록', icon: ChartLine },
  { to: '/forecast', label: '예보·추천', icon: CloudSun },
  { to: '/notifications', label: '알림', icon: Bell },
  { to: '/settings', label: '설정', icon: Settings },
]
