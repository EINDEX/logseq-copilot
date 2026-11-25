import React from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DEFAULT_TEMPLATE_CONTENT } from '@/utils/default-templates';
import { useTemplates } from '@/hooks/use-templates';
import { useTranslation } from '@/i18n/react';
import { PageLayout, PageLoading } from '../components/page-layout';

// `/templates` has no page or sidebar entry of its own: a template link that
// no longer resolves lands here. It sends the user to the first template's
// editor, or offers to create one when there are none.
const TemplatesIndexPage: React.FC = () => {
    const { t } = useTranslation();
    const { templates, loading, addTemplate } = useTemplates();

    if (loading) {
        return <PageLoading title={t('options.templates.index.title')}>
                {t('options.templates.index.loading')}
            </PageLoading>;
    }

    if (templates.length > 0) {
        return <Navigate to={`/template/${templates[0].id}`} replace />;
    }

    const handleCreate = () => {
        addTemplate({
            name: 'New Template 1',
            content: DEFAULT_TEMPLATE_CONTENT,
            clipNoteLocation: 'journal',
            clipNoteCustomPage: '',
        });
    };

    return (
        <PageLayout
            title={t('options.templates.index.title')}
            description={t('options.templates.index.empty')}
        >
            <div>
                <Button onClick={handleCreate}>{t('options.templates.index.create')}</Button>
            </div>
        </PageLayout>
    );
};

export default TemplatesIndexPage;
