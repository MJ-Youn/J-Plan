import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/**
 * 인증된 사용자만 접근할 수 있도록 보호하는 래퍼 컴포넌트입니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026-05-06
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isLoading, checkAuth } = useAuthStore();

    React.useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
                <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!user) {
        return (
            <Navigate
                to="/login"
                replace
            />
        );
    }

    return <>{children}</>;
};

export default ProtectedRoute;
