import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, Sparkles } from 'lucide-react';
import Turnstile from 'react-turnstile';
import { useAuthStore } from '../store/authStore';

/**
 * 로그인 페이지 컴포넌트입니다.
 * Turnstile 인증 및 Google OAuth 로그인을 처리합니다.
 * 
 * @author 윤명준 (MJ Yune)
 * @since 2026-05-06
 */
const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, checkAuth, isLoading } = useAuthStore();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/');
    }
  }, [user, isLoading, navigate]);

  const handleLogin = () => {
    if (!token) {
      alert('사람인지 확인하는 과정이 필요합니다.');
      return;
    }
    // gem-deck 패턴: cf_token을 쿼리로 넘김
    window.location.href = `/api/auth/google?cf_token=${token}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
        <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-white dark:bg-zinc-950">
      {/* Ambient Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-[120px] animate-pulse" />
      </div>

      <div className="max-w-md w-full p-8 md:p-12 text-center relative z-10 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-xl rounded-3xl border border-gray-200 dark:border-zinc-800 shadow-2xl">
        <div className="mb-8 flex justify-center">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-inner">
            <Map size={48} className="text-amber-600 dark:text-amber-500" />
          </div>
        </div>

        <div className="relative mb-3">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent tracking-tight">
            J-Plan
          </h1>
          <Sparkles className="w-5 h-5 text-amber-400 absolute -top-1 -right-2 animate-pulse" />
        </div>
        
        <p className="text-gray-500 dark:text-zinc-400 mb-10 text-lg leading-relaxed">
          완벽한 여행을 위한<br/>
          <span className="font-semibold text-amber-600 dark:text-amber-500">J들의 스마트한 선택</span>
        </p>

        <div className="flex justify-center mb-6">
          <Turnstile
            sitekey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
            onVerify={(t) => setToken(t)}
            theme="auto"
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={!token}
          className={`w-full py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-3 transition-all transform active:scale-95 ${
            token 
              ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/30' 
              : 'bg-gray-200 dark:bg-zinc-800 text-gray-400 cursor-not-allowed'
          }`}
        >
          <div className="p-1 bg-white rounded-full">
            <img
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              className="w-5 h-5"
              alt="G"
            />
          </div>
          <span>Google 계정으로 시작하기</span>
        </button>
        
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-zinc-800">
          <p className="text-xs text-gray-400 dark:text-zinc-500 font-light">
            Powered by Cloudflare Pages & Workers
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
