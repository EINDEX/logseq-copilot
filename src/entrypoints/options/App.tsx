import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layout';
import SettingsPage from './pages/SettingsPage';

const App = () => {
    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Navigate to="/settings" replace />} />
                <Route path="/settings" element={<SettingsPage />} />
            </Routes>
        </Layout>
    );
};

export default App; 