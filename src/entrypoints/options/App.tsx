import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layout';
import SettingsPage from './pages/connection-page';
import SearchEnginePage from './pages/search-engine-page';
import TemplateEditPage from './pages/template-edit-page';
import AIConfigPage from './pages/ai-config-page';

const App = () => {
    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Navigate to="/settings" replace />} />
                <Route path="/search-engine" element={<SearchEnginePage />} />
                <Route path="/ai-config" element={<AIConfigPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/template/:id" element={<TemplateEditPage />} />
            </Routes>
        </Layout>
    );
};

export default App; 