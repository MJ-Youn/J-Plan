import { create } from 'zustand';

interface ThemeState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

// 브라우저 또는 OS 환경의 기본 테마 감지
const getInitialTheme = (): 'light' | 'dark' => {
  const savedTheme = localStorage.getItem('j-plan-theme') as 'light' | 'dark';
  if (savedTheme) {
    return savedTheme;
  }
  return 'dark';
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('j-plan-theme', newTheme);
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      return { theme: newTheme };
    }),
  setTheme: (theme) =>
    set(() => {
      localStorage.setItem('j-plan-theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      return { theme };
    }),
}));
