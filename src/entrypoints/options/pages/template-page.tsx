import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useSettings } from '@/hooks/use-settings';

const TemplatePage: React.FC = () => {
    const { settings: logseqConfig, updateSettings } = useSettings();

    const updateTemplate = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateSettings({ clipNoteTemplate: event.target.value });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Templates</h1>
                <p className="text-muted-foreground mt-2">
                    Configure your clip templates and template settings.
                </p>
            </div>

            <div className="grid gap-6 w-full">
                <Card>
                    <CardHeader>
                        <CardTitle>Clip Template</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="clip-template">Template Content</Label>
                                <Textarea
                                    id="clip-template"
                                    className="min-h-48"
                                    name="clipNoteTemplate"
                                    onChange={updateTemplate}
                                    value={logseqConfig?.clipNoteTemplate || ''}
                                    placeholder="Enter your clip template here..."
                                />
                            </div>

                            <div className="text-right space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    Available parameters: date, time, title, url, content, dt.
                                </p>
                                <a
                                    href="https://liquidjs.com/tutorials/intro-to-liquid.html"
                                    className="text-sm text-primary hover:underline block"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    The template language follows LiquidJS syntax.
                                </a>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default TemplatePage;
