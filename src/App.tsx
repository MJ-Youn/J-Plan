import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';

import { useThemeStore } from './store/themeStore';
import ProtectedRoute from './components/auth/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/Login';
import TravelDetail from './pages/TravelDetail';
import TravelList from './pages/TravelList';

/**
 * 앱 루트 컴포넌트입니다.
 *
 * @author 윤명준 (MJ Yune)
 * @since 2026. 05. 07.
 */
function App() {
    const { theme } = useThemeStore();
    const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    const content = (
        <BrowserRouter>
            <Routes>
                <Route
                    path="/login"
                    element={<Login />}
                />
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <MainLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route
                        index
                        element={
                            <Navigate
                                to="/travels"
                                replace
                            />
                        }
                    />
                    <Route
                        path="travels"
                        element={<TravelList />}
                    />
                    <Route
                        path="travels/:id"
                        element={<TravelDetail />}
                    />
                </Route>
            </Routes>
        </BrowserRouter>
    );

    if (!API_KEY) return content;

    return <APIProvider apiKey={API_KEY}>{content}</APIProvider>;
}

export default App;
