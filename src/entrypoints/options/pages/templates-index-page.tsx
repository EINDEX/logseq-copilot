import React from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTemplates } from '@/hooks/use-templates';
import { PageLayout, PageLoading } from '../components/page-layout';

// `/templates` has no page of its own: it sends the user to the first
// template's editor, or offers to create one when there are none.
const TemplatesIndexPage: React.FC = () => {
    const { templates, loading, addTemplate } = useTemplates();

    if (loading) {
        return <PageLoading title="Templates">Loading templates...</PageLoading>;
    }

    if (templates.length > 0) {
        return <Navigate to={`/template/${templates[0].id}`} replace />;
    }

    const handleCreate = () => {
        addTemplate({
            name: 'New Template 1',
            content: `#[[Clip]] [{{title}}]({{url}})
{{content}}`,
            clipNoteLocation: 'journal',
            clipNoteCustomPage: '',
        });
    };

    return (
        <PageLayout
            title="Templates"
            description="You have no clip templates yet. Create one to start clipping."
        >
            <div>
                <Button onClick={handleCreate}>Create template</Button>
            </div>
        </PageLayout>
    );
};

export default TemplatesIndexPage;
