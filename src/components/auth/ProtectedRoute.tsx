import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/**
 * 인증된 사용자만 접근할 수 있도록 보호하는 래퍼 컴포넌트입니다.
 * Data Router 환경에서 렌더링 중 Navigate 사용을 피하기 위해
 * useNavigate를 useEffect 내에서 호출하는 방식을 사용합니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026. 05. 07.
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isLoading, checkAuth } = useAuthStore();
    const navigate = useNavigate();

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    // 인증 상태가 확정된 후 비로그인이면 이펙트에서 리다이렉트
    // (렌더링 중 Navigate를 사용하면 createBrowserRouter와 충돌할 수 있음)
    useEffect(() => {
        if (!isLoading && !user) {
            navigate('/login', { replace: true });
        }
    }, [isLoading, user, navigate]);

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
                <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    // 비로그인 상태에서는 아무것도 렌더링하지 않음 (useEffect에서 리다이렉트 처리)
    if (!user) return null;

    return <>{children}</>;
};

export default ProtectedRoute;
