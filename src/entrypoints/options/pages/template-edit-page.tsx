import React, { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTemplate } from '@/hooks/use-templates';
import { TemplateItemV1 } from '@/utils/storage';
import { PageLayout, PageLoading, PageSection } from '../components/page-layout';

const VARIABLES = [
    ['{{title}}', 'Page title'],
    ['{{url}}', 'Page URL'],
    ['{{content}}', 'Selected content'],
    ['{{date}}', 'Current date'],
    ['{{time}}', 'Current time'],
    ['{{dt}}', 'Date/time object'],
] as const;

type TextField = 'name' | 'content' | 'clipNoteCustomPage';

// What the user has typed into this template's text fields. Saving goes
// through storage asynchronously; binding the inputs to the stored value
// would make React restore the old value on each keystroke and assign the
// new one later, which moves the caret to the end. Tagging the draft with
// the template id drops it when another template is opened.
interface Draft {
    id?: string;
    fields: Partial<Pick<TemplateItemV1, TextField>>;
}

const TemplateEditPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { template, updateTemplate, loading } = useTemplate(id!);
    const [draft, setDraft] = useState<Draft>({ fields: {} });

    if (loading) {
        return <PageLoading title="Edit Template">Loading template...</PageLoading>;
    }

    if (!template) {
        return <Navigate to="/templates" replace />;
    }

    const draftFields = draft.id === id ? draft.fields : {};
    const textValue = (field: TextField) => draftFields[field] ?? template[field] ?? '';

    const handleFieldUpdate = (field: keyof TemplateItemV1, value: string) => {
        updateTemplate({ [field]: value });
    };

    const handleTextChange = (field: TextField, value: string) => {
        setDraft((prev) => ({
            id,
            fields: { ...(prev.id === id ? prev.fields : {}), [field]: value },
        }));
        handleFieldUpdate(field, value);
    };

    const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleTextChange('name', event.target.value);
    };

    const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        handleTextChange('content', event.target.value);
    };

    const handleLocationChange = (value: string) => {
        handleFieldUpdate('clipNoteLocation', value);
    };

    const handleCustomPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleTextChange('clipNoteCustomPage', event.target.value);
    };

    return (
        <PageLayout
            title="Edit Template"
            description="Configure your template settings, clip location, and content."
        >
            <PageSection title="Template Name">
                <div className="space-y-2">
                    <Label htmlFor="template-name">Name</Label>
                    <Input
                        id="template-name"
                        value={textValue('name')}
                        onChange={handleNameChange}
                        placeholder="Enter template name"
                    />
                </div>
            </PageSection>

            <PageSection
                title="Clip Location"
                description="Choose where clips using this template will be saved."
            >
                <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                        <Label>Location</Label>
                        <RadioGroup
                            value={template.clipNoteLocation || 'journal'}
                            onValueChange={handleLocationChange}
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="journal" id="journal" />
                                <Label htmlFor="journal">Journal</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="currentPage" id="currentPage" />
                                <Label htmlFor="currentPage">Current Page</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="customPage" id="customPage" />
                                <Label htmlFor="customPage">Custom Page</Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="custom-page-name">Custom Page Name</Label>
                        <Input
                            id="custom-page-name"
                            disabled={template.clipNoteLocation !== 'customPage'}
                            value={textValue('clipNoteCustomPage')}
                            onChange={handleCustomPageChange}
                            placeholder="Enter custom page name"
                        />
                        <p className="text-sm text-muted-foreground">
                            Only used when "Custom Page" is selected as the location.
                        </p>
                    </div>
                </div>
            </PageSection>

            <PageSection
                title="Template Content"
                description="Define the content structure for clips using this template."
            >
                <div className="space-y-2">
                    <Label htmlFor="template-content">Content</Label>
                    <Textarea
                        id="template-content"
                        className="min-h-48 font-mono text-sm"
                        value={textValue('content')}
                        onChange={handleContentChange}
                        placeholder="Enter your template content here..."
                    />
                </div>

                <div className="space-y-2">
                    <h3 className="text-sm font-medium">Available Variables</h3>
                    <dl className="grid gap-x-6 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                        {VARIABLES.map(([name, label]) => (
                            <div key={name} className="flex gap-2">
                                <dt><code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{name}</code></dt>
                                <dd>{label}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                <a
                    href="https://liquidjs.com/tutorials/intro-to-liquid.html"
                    className="inline-block text-sm text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Learn more about LiquidJS template syntax →
                </a>
            </PageSection>
        </PageLayout>
    );
};

export default TemplateEditPage; 