import React, { useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Sun, Moon, Map, LogOut } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';

/**
 * 어플리케이션의 메인 레이아웃 컴포넌트입니다.
 * 상단 GNB, 메인 콘텐츠 영역, 하단 푸터를 포함합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 05. 07.
 */
const MainLayout: React.FC = () => {
    const { theme, toggleTheme } = useThemeStore();
    const { user, isLoading, logout } = useAuthStore();

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    return (
        <div className="h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300 overflow-hidden print:overflow-visible print:h-auto">
            {/* 상단 GNB */}
            <header className="shrink-0 sticky top-0 z-50 w-full backdrop-blur-md bg-white/70 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-800 print:hidden">
                <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Link
                            to="/"
                            className="flex items-center space-x-2 text-amber-600 dark:text-amber-500"
                        >
                            <Map size={28} />
                            <span className="font-bold text-xl tracking-tight">J-Plan</span>
                        </Link>
                    </div>

                    <nav className="flex items-center space-x-4">
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            aria-label="Toggle Theme"
                        >
                            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                        </button>

                        {!isLoading && user ? (
                            <div className="flex items-center space-x-3">
                                <img
                                    src={user.avatar_url}
                                    alt={user.name}
                                    className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700"
                                />
                                <span className="text-sm font-medium hidden sm:block">{user.name}</span>
                                <button
                                    onClick={logout}
                                    className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                                    aria-label="Logout"
                                >
                                    <LogOut size={20} />
                                </button>
                            </div>
                        ) : !isLoading ? (
                            <Link
                                to="/login"
                                className="text-sm font-medium px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                            >
                                로그인
                            </Link>
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                        )}
                    </nav>
                </div>
            </header>

            {/* 메인 콘텐츠 영역 */}
            <main className="flex-1 overflow-hidden print:overflow-visible print:h-auto">
                <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-full flex flex-col print:overflow-visible print:h-auto print:block print:p-0">
                    <Outlet />
                </div>
            </main>

            {/* 푸터 영역 */}
            <footer className="shrink-0 border-t border-gray-200 dark:border-gray-800 py-2 print:hidden">
                <div className="max-w-screen-2xl mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">© 2026 J-Plan. All rights reserved.</div>
            </footer>
        </div>
    );
};

export default MainLayout;
