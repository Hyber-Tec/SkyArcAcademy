import { useTheme } from './theme'
import { LuMonitor, LuMoon, LuSun } from 'react-icons/lu'
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { THEME_LABELS_KO } from '@/features/profile/themeText'
import { useT } from '@/lib/lang'

export function ThemeSubmenu() {
  const { theme = 'system', setTheme } = useTheme()
  const t = useT()
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {theme === 'dark' ? <LuMoon /> : theme === 'light' ? <LuSun /> : <LuMonitor />}
        {t('Theme', '화면 모드')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">{t('Light', THEME_LABELS_KO.light)}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t('Dark', THEME_LABELS_KO.dark)}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">{t('System', THEME_LABELS_KO.system)}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
