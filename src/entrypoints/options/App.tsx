import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layout';
import SettingsPage from './pages/connection-page';
import SearchEnginePage from './pages/search-engine-page';
import TemplateEditPage from './pages/template-edit-page';
import TemplatesIndexPage from './pages/templates-index-page';
import { HighlightsPage } from './pages/highlights-page';
// AI Configuration page (./pages/ai-config-page) is hidden for now: no feature uses it yet.

const App = () => {
    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Navigate to="/settings" replace />} />
                <Route path="/search-engine" element={<SearchEnginePage />} />
                <Route path="/highlights" element={<HighlightsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/templates" element={<TemplatesIndexPage />} />
                <Route path="/template/:id" element={<TemplateEditPage />} />
                <Route path="*" element={<Navigate to="/settings" replace />} />
            </Routes>
        </Layout>
    );
};

export default App; 