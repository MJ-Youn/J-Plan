import { LogIn, Map as MapIcon, ShieldCheck, Sparkles } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Turnstile } from '@marsidev/react-turnstile';
import { MOCK_USER, useAuthStore } from '../store/authStore';

/**
 * 로그인 페이지 컴포넌트입니다.
 * Turnstile 인증 및 Google OAuth 로그인을 처리합니다.
 * 로컬 개발 환경에서는 Mock 로그인을 통해 즉시 진입이 가능합니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026. 05. 07.
 */
const Login: React.FC = () => {
    const navigate = useNavigate();
    const { user, checkAuth, setUser, isLoading } = useAuthStore();
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        if (!isLoading && user) {
            navigate('/travels');
        }
    }, [user, isLoading, navigate]);

    /**
     * 구글 로그인 버튼 핸들러입니다.
     * 로컬 개발 모드에서는 즉시 Mock 사용자로 로그인 처리합니다.
     */
    const handleLogin = () => {
        if (import.meta.env.DEV) {
            setUser(MOCK_USER);
            return;
        }

        if (!token) {
            alert('보안 검증을 완료해주세요.');
            return;
        }

        window.location.href = `/api/auth/google?cf_token=${token}`;
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
                <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-gray-50 dark:bg-black">
            {/* 배경 장식 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-[120px] animate-pulse" />
            </div>

            <div className="max-w-md w-full p-8 md:p-12 text-center relative z-10 bg-white/90 dark:bg-gray-900/50 backdrop-blur-2xl rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-2xl">
                <div className="mb-10 flex justify-center">
                    <div className="p-5 bg-amber-50 dark:bg-amber-900/20 rounded-3xl shadow-inner relative group">
                        <MapIcon
                            size={56}
                            className="text-amber-600 dark:text-amber-500 transform group-hover:rotate-12 transition-transform duration-300"
                        />
                        <div className="absolute -top-2 -right-2 bg-white dark:bg-gray-800 p-1.5 rounded-full shadow-md">
                            <Sparkles
                                size={16}
                                className="text-amber-400 animate-pulse"
                            />
                        </div>
                    </div>
                </div>

                <div className="relative mb-4">
                    <h1 className="text-5xl md:text-6xl font-black bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent tracking-tighter">J-Plan</h1>
                </div>

                <p className="text-gray-500 dark:text-gray-400 mb-12 text-lg font-medium leading-relaxed">
                    완벽한 여행을 위한
                    <br />
                    <span className="text-amber-600 dark:text-amber-500 font-bold">J들의 스마트한 선택</span>
                </p>

                <div className="space-y-6">
                    {!import.meta.env.DEV ? (
                        <div className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-800/30 rounded-2xl border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-xs text-gray-400 mb-3 font-bold uppercase tracking-widest">
                                <ShieldCheck size={14} />
                                보안 검증
                            </div>
                            <Turnstile
                                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                                onSuccess={(t) => setToken(t)}
                                options={{
                                    theme: 'auto',
                                }}
                            />
                        </div>
                    ) : (
                        <div className="p-4 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl text-amber-700 dark:text-amber-400 text-sm font-semibold flex items-center justify-center gap-2">
                            <span className="animate-bounce">🔧</span> 로컬 개발 모드: 인증이 생략됩니다.
                        </div>
                    )}

                    <button
                        onClick={handleLogin}
                        disabled={!import.meta.env.DEV && !token}
                        className={`group w-full py-5 rounded-2xl text-lg font-bold flex items-center justify-center gap-4 transition-all transform active:scale-[0.98] ${
                            import.meta.env.DEV || token ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xl shadow-amber-600/30' : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        <div className="p-1.5 bg-white rounded-full group-hover:rotate-12 transition-transform">
                            <img
                                src="https://www.svgrepo.com/show/475656/google-color.svg"
                                className="w-5 h-5"
                                alt="G"
                            />
                        </div>
                        <span>Google 계정으로 시작하기</span>
                        <LogIn
                            size={20}
                            className="opacity-50 group-hover:translate-x-1 transition-transform"
                        />
                    </button>
                </div>

                <div className="mt-12 pt-8 border-t border-gray-50 dark:border-gray-800">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">Powered by Cloudflare Pages & Workers</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
