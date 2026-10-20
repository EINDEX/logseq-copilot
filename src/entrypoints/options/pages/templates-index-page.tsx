import React from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTemplates } from '@/hooks/use-templates';

// `/templates` has no page of its own: it sends the user to the first
// template's editor, or offers to create one when there are none.
const TemplatesIndexPage: React.FC = () => {
    const { templates, loading, addTemplate } = useTemplates();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-muted-foreground">Loading templates...</div>
            </div>
        );
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
        <div className="space-y-4">
            <h1 className="text-3xl font-bold">Templates</h1>
            <p className="text-muted-foreground">
                You have no clip templates yet. Create one to start clipping.
            </p>
            <Button onClick={handleCreate}>Create template</Button>
        </div>
    );
};

export default TemplatesIndexPage;
