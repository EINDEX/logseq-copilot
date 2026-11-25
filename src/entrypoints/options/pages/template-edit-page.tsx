import React, { useEffect, useRef, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useTemplate } from '@/hooks/use-templates';
import { useTranslation } from '@/i18n/react';
import { sendMessage } from '@/types/messaging';
import { TemplateItemV1 } from '@/utils/storage';
import { PageLayout, PageLoading, PageSection } from '../components/page-layout';
import { ClipPreview } from '../components/clip-preview';
import { RulesField } from '../components/rules-field';
import {
    TemplateEditor,
    type TemplateEditorHandle,
} from '../components/template-editor';
import type { EditorGraph } from '../components/template-editor-extensions';
import { segmentClass, segmentedGroupClass } from '../components/segmented';

const VARIABLES = [
    ['{{title}}', 'options.templates.edit.variables.title'],
    ['{{url}}', 'options.templates.edit.variables.url'],
    ['{{content}}', 'options.templates.edit.variables.content'],
    ['{{note}}', 'options.templates.edit.variables.note'],
    ['{{date}}', 'options.templates.edit.variables.date'],
    ['{{time}}', 'options.templates.edit.variables.time'],
    ['{{dt}}', 'options.templates.edit.variables.dt'],
] as const;

const LOCATIONS = [
    ['journal', 'options.templates.edit.location.journal'],
    ['currentPage', 'options.templates.edit.location.currentPage'],
    ['customPage', 'options.templates.edit.location.customPage'],
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

/** The answer of a request, or `fallback` when it fails (Logseq not reachable). */
const ask = <T,>(request: () => Promise<T>, fallback: T): Promise<T> =>
    Promise.resolve()
        .then(request)
        .then((value) => value ?? fallback, () => fallback);

/**
 * The graph the editor completes tags and properties from, asked once when the
 * page opens. Undefined until Logseq answers; empty when it cannot be reached.
 */
const useEditorGraph = (): EditorGraph | undefined => {
    const [graph, setGraph] = useState<EditorGraph>();
    useEffect(() => {
        let live = true;
        const list = <T,>(items: T[]) => (Array.isArray(items) ? items : []);
        Promise.all([
            ask(() => sendMessage('logseq:graphKind'), null),
            ask(() => sendMessage('logseq:listProperties'), []),
            ask(() => sendMessage('logseq:listTags'), []),
        ]).then(([kind, properties, tags]) => {
            if (live) setGraph({ kind, properties: list(properties), tags: list(tags) });
        });
        return () => {
            live = false;
        };
    }, []);
    return graph;
};

const TemplateEditPage: React.FC = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const { template, updateTemplate, loading } = useTemplate(id!);
    const [draft, setDraft] = useState<Draft>({ fields: {} });
    const editorRef = useRef<TemplateEditorHandle>(null);
    const graph = useEditorGraph();

    if (loading) {
        return <PageLoading title={t('options.templates.edit.title')}>
                {t('options.templates.edit.loading')}
            </PageLoading>;
    }

    if (!template) {
        return <Navigate to="/templates" replace />;
    }

    const draftFields = draft.id === id ? draft.fields : {};
    const textValue = (field: TextField) => draftFields[field] ?? template[field] ?? '';
    const location = template.clipNoteLocation || 'journal';

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

    // Puts the variable where the caret is (over the selection, if any), and
    // the caret behind it.
    const insertVariable = (variable: string) => {
        editorRef.current?.insertVariable(variable.slice(2, -2));
    };

    const handleCustomPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleTextChange('clipNoteCustomPage', event.target.value);
    };

    return (
        <PageLayout title={t('options.templates.edit.title')}>
            <PageSection>
                <div className="space-y-2">
                    <Label htmlFor="template-name">{t('options.templates.edit.name')}</Label>
                    <Input
                        id="template-name"
                        value={textValue('name')}
                        onChange={handleNameChange}
                        placeholder={t('options.templates.edit.namePlaceholder')}
                    />
                </div>

                <div className="space-y-2">
                    <Label id="save-to-label">{t('options.templates.edit.saveTo')}</Label>
                    <div className="flex flex-wrap items-center gap-2">
                        <div role="group" aria-labelledby="save-to-label" className={segmentedGroupClass}>
                            {LOCATIONS.map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={location === value}
                                    onClick={() => handleFieldUpdate('clipNoteLocation', value)}
                                    className={segmentClass(location === value)}
                                >
                                    {t(label)}
                                </button>
                            ))}
                        </div>
                        {location === 'customPage' && (
                            <Input
                                aria-label={t('options.templates.edit.pageName')}
                                value={textValue('clipNoteCustomPage')}
                                onChange={handleCustomPageChange}
                                placeholder={t('options.templates.edit.pageName')}
                                className="h-8 w-56"
                            />
                        )}
                    </div>
                </div>
            </PageSection>

            <PageSection title={t('options.templates.edit.rulesTitle')}>
                <RulesField
                    id="template-rules"
                    value={template.rules}
                    onChange={(rules) => updateTemplate({ rules })}
                />
            </PageSection>

            <PageSection>
                <TemplateEditor
                    key={id}
                    ref={editorRef}
                    value={textValue('content')}
                    onChange={(content) => handleTextChange('content', content)}
                    graph={graph}
                />

                <div className="flex flex-wrap items-center gap-1.5">
                    {VARIABLES.map(([name, description]) => (
                        <button
                            key={name}
                            type="button"
                            title={t(description)}
                            onClick={() => insertVariable(name)}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground hover:bg-accent"
                        >
                            {name}
                        </button>
                    ))}
                    <a
                        href="https://liquidjs.com/tutorials/intro-to-liquid.html"
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {t('options.templates.edit.liquidSyntax')}
                    </a>
                </div>

                <ClipPreview template={textValue('content')} />
            </PageSection>
        </PageLayout>
    );
};

export default TemplateEditPage;
