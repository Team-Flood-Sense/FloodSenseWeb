import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

// Sliding light/dark switch
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggleTheme}
      className="relative flex items-center w-[68px] h-9 rounded-full shrink-0 cursor-pointer"
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #0f2a3d 0%, #16384f 100%)'
          : 'linear-gradient(135deg, #bfe9f3 0%, #e7f6fa 100%)',
        border: '1px solid rgba(var(--ink-rgb), 0.15)',
        boxShadow: 'inset 0 1px 3px rgba(var(--shadow-rgb), 0.18)',
        transition: 'background 0.3s ease',
      }}
    >
      <Sun className="absolute left-2.5 text-[#F59E0B]" size={16} strokeWidth={2.5} style={{ opacity: isDark ? 0.45 : 1 }} />
      <Moon className="absolute right-2.5 text-[#93C5FD]" size={16} strokeWidth={2.5} style={{ opacity: isDark ? 1 : 0.45 }} />
      <span
        className="absolute top-[3px] w-7 h-7 rounded-full"
        style={{
          left: isDark ? 'calc(100% - 31px)' : '3px',
          background: isDark
            ? 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)'
            : 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
          transition: 'left 0.28s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease',
        }}
      />
    </button>
  );
}
