import React, { useEffect, useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Sun, Moon, Map, LogOut, Download, WifiOff, RefreshCw, X } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { usePwa } from '../../hooks/usePwa';

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
    const { isOffline, canInstall, isIosInstallable, hasUpdate, installApp, applyUpdate } = usePwa();
    const [showIosGuide, setShowIosGuide] = useState(false);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    const handleInstallClick = async () => {
        if (canInstall) {
            await installApp();
        } else if (isIosInstallable) {
            setShowIosGuide((prev) => !prev);
        }
    };

    return (
        <div className="h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300 overflow-hidden print:overflow-visible print:h-auto">
            {/* 상단 GNB */}
            <header className="shrink-0 sticky top-0 z-50 w-full backdrop-blur-md bg-white/70 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-800 print:hidden">
                <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Link
                            to="/"
                            className="flex items-center space-x-2 text-amber-600 dark:text-amber-500"
                        >
                            <Map size={28} />
                            <span className="font-bold text-xl tracking-tight">J-Plan</span>
                        </Link>
                    </div>

                    <nav className="flex items-center space-x-2 sm:space-x-3">
                        {isOffline && (
                            <span
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                title="오프라인 상태입니다. 저장된 캐시 데이터를 표시합니다."
                            >
                                <WifiOff size={13} />
                                <span className="hidden xs:inline sm:inline">오프라인</span>
                            </span>
                        )}

                        {(canInstall || isIosInstallable) && (
                            <button
                                onClick={handleInstallClick}
                                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/70 transition-colors"
                                title="홈 화면에 J-Plan 앱 설치"
                            >
                                <Download size={14} />
                                <span className="hidden sm:inline">앱 설치</span>
                            </button>
                        )}

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

            {/* iOS Safari 홈 화면 추가 안내 배너 */}
            {showIosGuide && (
                <div className="shrink-0 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800/70 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2 print:hidden">
                    <span>
                        Safari 하단 <strong>공유 버튼(□↑)</strong>을 누른 뒤 <strong>&lsquo;홈 화면에 추가&rsquo;</strong>를 선택하면 앱처럼 사용할 수 있습니다.
                    </span>
                    <button
                        onClick={() => setShowIosGuide(false)}
                        className="p-1 rounded hover:bg-amber-200/60 dark:hover:bg-amber-900/60 shrink-0"
                        aria-label="안내 닫기"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* 새 버전 업데이트 안내 배너 */}
            {hasUpdate && (
                <div className="shrink-0 bg-indigo-50 dark:bg-indigo-950/60 border-b border-indigo-200 dark:border-indigo-800/70 px-4 py-2 text-xs text-indigo-900 dark:text-indigo-200 flex items-center justify-between gap-2 print:hidden">
                    <span>새로운 J-Plan 버전이 준비되었습니다.</span>
                    <button
                        onClick={applyUpdate}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 font-medium shrink-0 transition-colors"
                    >
                        <RefreshCw size={12} />
                        업데이트
                    </button>
                </div>
            )}

            {/* 메인 콘텐츠 영역 */}
            <main className="flex-1 overflow-hidden print:overflow-visible print:h-auto">
                <div className="w-full px-3 sm:px-6 py-4 sm:py-5 h-full flex flex-col print:overflow-visible print:h-auto print:block print:p-0">
                    <Outlet />
                </div>
            </main>

            {/* 푸터 영역 */}
            <footer className="shrink-0 border-t border-gray-200 dark:border-gray-800 py-2 print:hidden">
                <div className="w-full px-4 sm:px-6 text-center text-sm text-gray-500 dark:text-gray-400">© 2026 J-Plan. All rights reserved.</div>
            </footer>
        </div>
    );
};

export default MainLayout;
