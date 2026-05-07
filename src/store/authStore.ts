import { create } from 'zustand';

/**
 * 사용자 인증 정보를 정의하는 인터페이스입니다.
 */
export interface User {
    id: string;
    email: string;
    name: string;
    avatar_url: string;
}

/**
 * 인증 스토어의 상태와 액션을 정의하는 인터페이스입니다.
 */
interface AuthState {
    user: User | null;
    isLoading: boolean;
    setUser: (user: User | null) => void;
    checkAuth: () => Promise<void>;
    logout: () => Promise<void>;
}

/**
 * 로컬 개발 환경용 테스트 사용자 정보입니다.
 */
export const MOCK_USER: User = {
    id: 'dev-user-id',
    email: 'mjyune@ymtech.co.kr',
    name: '윤명준 (Local Dev)',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MJ',
};

/**
 * 사용자 인증 상태를 관리하는 Store입니다.
 * 로컬 개발 모드에서는 Mock 데이터를 사용합니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026. 05. 07.
 */
export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true,

    /**
     * 사용자 정보를 수동으로 설정합니다.
     */
    setUser: (user) => set({ user }),

    /**
     * 서버로부터 현재 로그인된 사용자 정보를 확인합니다.
     * 로컬 개발 환경에서는 Mock 사용자로 자동 로그인합니다.
     */
    checkAuth: async () => {
        if (import.meta.env.DEV) {
            set({ user: MOCK_USER, isLoading: false });
            return;
        }

        try {
            const response = await fetch('/api/auth/me');
            if (response.ok) {
                const data = await response.json();
                set({ user: data.user, isLoading: false });
            } else {
                set({ user: null, isLoading: false });
            }
        } catch (error) {
            console.error('[AuthStore] Failed to fetch user:', error);
            set({ user: null, isLoading: false });
        }
    },

    /**
     * 로그아웃을 수행하고 사용자 상태를 초기화합니다.
     */
    logout: async () => {
        if (import.meta.env.DEV) {
            set({ user: null });
            return;
        }

        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            set({ user: null });
        } catch (error) {
            console.error('[AuthStore] Failed to logout:', error);
        }
    },
}));
