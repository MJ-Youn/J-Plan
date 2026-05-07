import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';

import { useThemeStore } from './store/themeStore';
import ProtectedRoute from './components/auth/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/Login';
import TravelDetail from './pages/TravelDetail';
import TravelList from './pages/TravelList';

/**
 * 테마 초기화를 담당하는 래퍼 컴포넌트입니다.
 * createBrowserRouter 환경에서 테마 상태를 적용하기 위해 사용합니다.
 */
function ThemeRoot() {
    const { theme } = useThemeStore();

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    return <Outlet />;
}

/**
 * 앱 라우터를 정의합니다.
 * useBlocker 사용을 위해 Data Router(createBrowserRouter) 방식을 사용합니다.
 */
const router = createBrowserRouter([
    {
        element: <ThemeRoot />,
        children: [
            {
                path: '/login',
                element: <Login />,
            },
            {
                path: '/',
                element: (
                    <ProtectedRoute>
                        <MainLayout />
                    </ProtectedRoute>
                ),
                children: [
                    {
                        index: true,
                        element: (
                            <Navigate
                                to="/travels"
                                replace
                            />
                        ),
                    },
                    { path: 'travels', element: <TravelList /> },
                    { path: 'travels/:id', element: <TravelDetail /> },
                ],
            },
        ],
    },
]);

/**
 * 앱 루트 컴포넌트입니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026. 05. 07.
 */
function App() {
    const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

    if (!API_KEY) {
        return <RouterProvider router={router} />;
    }

    return (
        <APIProvider apiKey={API_KEY}>
            <RouterProvider router={router} />
        </APIProvider>
    );
}

export default App;
