import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/auth/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/Login';
import TravelDetail from './pages/TravelDetail';
import TravelList from './pages/TravelList';

import { useEffect } from 'react';
import { useThemeStore } from './store/themeStore';

function App() {
  const { theme } = useThemeStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/travels" replace />} />
          <Route path="travels" element={<TravelList />} />
          <Route path="travels/:id" element={<TravelDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
