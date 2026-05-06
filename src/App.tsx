import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Home from './pages/Home';
import TravelList from './pages/TravelList';
import TravelDetail from './pages/TravelDetail';
import Login from './pages/Login';
import ProtectedRoute from './components/auth/ProtectedRoute';

import { useThemeStore } from './store/themeStore';
import { useEffect } from 'react';

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
          <Route index element={<Home />} />
          <Route path="travels" element={<TravelList />} />
          <Route path="travels/:id" element={<TravelDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
