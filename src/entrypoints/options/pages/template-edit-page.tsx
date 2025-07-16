import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTemplate } from '@/hooks/use-templates';
import { TemplateItemV1 } from '@/utils/storage';

const TemplateEditPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { template, updateTemplate, loading } = useTemplate(id!);

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-center h-64">
                    <div className="text-muted-foreground">Loading template...</div>
                </div>
            </div>
        );
    }

    if (!template) {
        return <Navigate to="/templates" replace />;
    }

    const handleFieldUpdate = (field: keyof TemplateItemV1, value: string) => {
        updateTemplate({ [field]: value });
    };

    const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldUpdate('name', event.target.value);
    };

    const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        handleFieldUpdate('content', event.target.value);
    };

    const handleLocationChange = (value: string) => {
        handleFieldUpdate('clipNoteLocation', value);
    };

    const handleCustomPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldUpdate('clipNoteCustomPage', event.target.value);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Edit Template</h1>
                <p className="text-muted-foreground mt-2">
                    Configure your template settings, clip location, and content.
                </p>
            </div>

            <div className="grid gap-6 w-full">
                {/* Template Name */}
                <Card>
                    <CardHeader>
                        <CardTitle>Template Name</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Label htmlFor="template-name">Name</Label>
                            <Input
                                id="template-name"
                                value={template.name}
                                onChange={handleNameChange}
                                placeholder="Enter template name"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Clip Location Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle>Clip Location</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Choose where clips using this template will be saved.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
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
                                    value={template.clipNoteCustomPage || ''}
                                    onChange={handleCustomPageChange}
                                    placeholder="Enter custom page name"
                                />
                                <p className="text-sm text-muted-foreground">
                                    Only used when "Custom Page" is selected as the location.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Template Content */}
                <Card>
                    <CardHeader>
                        <CardTitle>Template Content</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Define the content structure for clips using this template.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="template-content">Content</Label>
                                <Textarea
                                    id="template-content"
                                    className="min-h-48"
                                    value={template.content}
                                    onChange={handleContentChange}
                                    placeholder="Enter your template content here..."
                                />
                            </div>

                            <Separator />

                            <div className="space-y-2">
                                <h4 className="text-sm font-medium">Available Variables</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                                    <div><code>{'{{title}}'}</code> - Page title</div>
                                    <div><code>{'{{url}}'}</code> - Page URL</div>
                                    <div><code>{'{{content}}'}</code> - Selected content</div>
                                    <div><code>{'{{date}}'}</code> - Current date</div>
                                    <div><code>{'{{time}}'}</code> - Current time</div>
                                    <div><code>{'{{dt}}'}</code> - Date/time object</div>
                                </div>
                            </div>

                            <div className="pt-2">
                                <a
                                    href="https://liquidjs.com/tutorials/intro-to-liquid.html"
                                    className="text-sm text-primary hover:underline"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Learn more about LiquidJS template syntax →
                                </a>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default TemplateEditPage; 