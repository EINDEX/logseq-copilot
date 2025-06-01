import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layout';
import SettingsPage from './pages/connection-page';
import SearchEnginePage from './pages/search-engine-page';
import TemplatePage from './pages/template-page';

const App = () => {
    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Navigate to="/settings" replace />} />
                <Route path="/search-engine" element={<SearchEnginePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/templates" element={<TemplatePage />} />
            </Routes>
        </Layout>
    );
};

export default App; 