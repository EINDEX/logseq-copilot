import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Save, X, Plus, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RecallRuleConfig } from '@/utils/storage';
import { PageSection } from './page-layout';

interface RecallRuleFormProps {
    initialRule?: RecallRuleConfig | null;
    onSave: (rule: Omit<RecallRuleConfig, 'id'>) => void;
    onCancel: () => void;
}

const RecallRuleForm: React.FC<RecallRuleFormProps> = ({
    initialRule,
    onSave,
    onCancel
}) => {
    const [formData, setFormData] = useState<Omit<RecallRuleConfig, 'id'>>({
        name: '',
        enabled: true,
        description: '',
        urlPattern: '',
        queryProcessing: {
            ignoreHashFragments: false,
            ignoreQueryParams: false,
            excludeKeywords: [],
            includeKeywords: [],
            ignorePathSegments: [],
        },
        searchScope: {
            journalDateRange: {
                enabled: false,
                days: 30,
            },
        },
        resultFiltering: {
            prioritizeRecent: false,
        },
    });

    const [testUrl, setTestUrl] = useState('');
    // One draft per list input: a shared draft made typing in one keyword
    // input fill the other one too.
    const [newExcludeKeyword, setNewExcludeKeyword] = useState('');
    const [newIncludeKeyword, setNewIncludeKeyword] = useState('');
    const [newPathSegment, setNewPathSegment] = useState('');
    const [newRestrictPage, setNewRestrictPage] = useState('');
    const [newExcludePage, setNewExcludePage] = useState('');

    useEffect(() => {
        if (initialRule) {
            setFormData({
                name: initialRule.name,
                enabled: initialRule.enabled,
                description: initialRule.description || '',
                urlPattern: initialRule.urlPattern,
                queryProcessing: { ...initialRule.queryProcessing },
                searchScope: { ...initialRule.searchScope },
                resultFiltering: { ...initialRule.resultFiltering },
            });
        }
    }, [initialRule]);

    const handleInputChange = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleNestedChange = (parent: string, field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [parent]: {
                ...(prev[parent as keyof typeof prev] as object),
                [field]: value,
            },
        }));
    };

    const handleArrayAdd = (parent: string, field: string, value: string) => {
        if (!value.trim()) return;

        setFormData(prev => {
            const parentObj = prev[parent as keyof typeof prev] as any;
            const currentArray = parentObj[field] || [];

            return {
                ...prev,
                [parent]: {
                    ...parentObj,
                    [field]: [...currentArray, value.trim()],
                },
            };
        });
    };

    const handleArrayRemove = (parent: string, field: string, index: number) => {
        setFormData(prev => {
            const parentObj = prev[parent as keyof typeof prev] as any;
            const currentArray = parentObj[field] || [];

            return {
                ...prev,
                [parent]: {
                    ...parentObj,
                    [field]: currentArray.filter((_: any, i: number) => i !== index),
                },
            };
        });
    };

    const testUrlPattern = () => {
        if (!formData.urlPattern || !testUrl) return null;

        try {
            const regex = new RegExp(formData.urlPattern, 'i');
            return regex.test(testUrl);
        } catch {
            return null;
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    const urlPatternResult = testUrlPattern();

    const help = (...lines: string[]) => (
        <Tooltip>
            <TooltipTrigger type="button" aria-label="Help">
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
                {lines.map((line) => (
                    <p key={line}>{line}</p>
                ))}
            </TooltipContent>
        </Tooltip>
    );

    const chips = (items: string[], parent: string, field: string) =>
        items.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
                {items.map((item, index) => (
                    <Badge key={index} variant="secondary" className="gap-1 pr-1 font-normal">
                        {item}
                        <button
                            type="button"
                            onClick={() => handleArrayRemove(parent, field, index)}
                            className="rounded-full p-0.5 hover:bg-foreground/10"
                            aria-label={`Remove ${item}`}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}
            </div>
        );

    const listInput = (
        value: string,
        setValue: (value: string) => void,
        parent: string,
        field: string,
        placeholder: string,
    ) => {
        const add = () => {
            handleArrayAdd(parent, field, value);
            setValue('');
        };
        return (
            <div className="flex gap-2">
                <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={placeholder}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            add();
                        }
                    }}
                />
                <Button type="button" variant="outline" size="sm" className="h-9 w-9 shrink-0 p-0" onClick={add} aria-label="Add">
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
        );
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            <PageSection title="Basics">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="name">Rule name *</Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            placeholder="e.g. GitHub project pages"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="enabled" className="flex items-center gap-2">
                            Enabled
                            {help('When on, the rule applies on matching websites.')}
                        </Label>
                        <Switch
                            id="enabled"
                            checked={formData.enabled}
                            onCheckedChange={(checked) => handleInputChange('enabled', checked)}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        placeholder="What this rule is for"
                        rows={2}
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="urlPattern" className="flex items-center gap-2">
                            URL pattern *
                            {help('A regular expression matched against the page URL.', 'e.g. github\\.com.*\\/[^\\/]+\\/[^\\/]+$')}
                        </Label>
                        <Input
                            id="urlPattern"
                            value={formData.urlPattern}
                            onChange={(e) => handleInputChange('urlPattern', e.target.value)}
                            placeholder="e.g. github\.com"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="testUrl" className="text-muted-foreground">Test the URL pattern</Label>
                        <Input
                            id="testUrl"
                            value={testUrl}
                            onChange={(e) => setTestUrl(e.target.value)}
                            placeholder="Enter a URL to test..."
                            className={
                                testUrl && formData.urlPattern
                                    ? urlPatternResult === true
                                        ? 'border-primary bg-primary/5'
                                        : urlPatternResult === false
                                            ? 'border-destructive bg-destructive/5'
                                            : ''
                                    : ''
                            }
                        />
                        {testUrl && formData.urlPattern && (
                            <p className={`text-sm ${urlPatternResult ? 'text-primary' : 'text-destructive'}`}>
                                {urlPatternResult ? '✓ Matches' : '✗ No match'}
                            </p>
                        )}
                    </div>
                </div>
            </PageSection>

            <PageSection title="Query processing" description="How the page URL is turned into a search.">
                <div className="flex flex-wrap gap-x-8 gap-y-3">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="ignoreHashFragments"
                            checked={formData.queryProcessing.ignoreHashFragments}
                            onCheckedChange={(checked) =>
                                handleNestedChange('queryProcessing', 'ignoreHashFragments', checked)
                            }
                        />
                        <Label htmlFor="ignoreHashFragments" className="flex items-center gap-2">
                            Ignore hash fragment
                            {help('Removes everything after # in the URL.', 'Useful for single-page apps with hash routing.')}
                        </Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="ignoreQueryParams"
                            checked={formData.queryProcessing.ignoreQueryParams}
                            onCheckedChange={(checked) =>
                                handleNestedChange('queryProcessing', 'ignoreQueryParams', checked)
                            }
                        />
                        <Label htmlFor="ignoreQueryParams" className="flex items-center gap-2">
                            Ignore query parameters
                            {help('Removes everything after ? in the URL.')}
                        </Label>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            Exclude keywords
                            {help('Results that contain these keywords are filtered out.')}
                        </Label>
                        {listInput(newExcludeKeyword, setNewExcludeKeyword, 'queryProcessing', 'excludeKeywords', 'Keyword to exclude')}
                        {chips(formData.queryProcessing.excludeKeywords, 'queryProcessing', 'excludeKeywords')}
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            Prefer keywords
                            {help('Results that contain these keywords are shown first.')}
                        </Label>
                        {listInput(newIncludeKeyword, setNewIncludeKeyword, 'queryProcessing', 'includeKeywords', 'Keyword to prefer')}
                        {chips(formData.queryProcessing.includeKeywords, 'queryProcessing', 'includeKeywords')}
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            Ignore path segments
                            {help('Ignores these segments of the URL path.', 'e.g. ignore "files" on GitHub.')}
                        </Label>
                        {listInput(newPathSegment, setNewPathSegment, 'queryProcessing', 'ignorePathSegments', 'Path segment to ignore')}
                        {chips(formData.queryProcessing.ignorePathSegments, 'queryProcessing', 'ignorePathSegments')}
                    </div>
                </div>
            </PageSection>

            <PageSection title="Search scope" description="Where in your graph to search.">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="journalDateRangeEnabled"
                            checked={formData.searchScope.journalDateRange?.enabled || false}
                            onCheckedChange={(checked) =>
                                handleNestedChange('searchScope', 'journalDateRange', {
                                    ...formData.searchScope.journalDateRange,
                                    enabled: checked
                                })
                            }
                        />
                        <Label htmlFor="journalDateRangeEnabled" className="flex items-center gap-2">
                            Limit journal dates
                            {help('Only searches journal pages from the last N days.')}
                        </Label>
                    </div>
                    {formData.searchScope.journalDateRange?.enabled && (
                        <div className="flex items-center gap-2">
                            <Label htmlFor="journalDays" className="text-muted-foreground">Days to search</Label>
                            <Input
                                id="journalDays"
                                type="number"
                                min="1"
                                max="365"
                                value={formData.searchScope.journalDateRange?.days || 30}
                                onChange={(e) =>
                                    handleNestedChange('searchScope', 'journalDateRange', {
                                        ...formData.searchScope.journalDateRange,
                                        days: parseInt(e.target.value)
                                    })
                                }
                                className="w-24"
                            />
                        </div>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            Only search these pages
                            {help('Searches only in these pages.')}
                        </Label>
                        {listInput(newRestrictPage, setNewRestrictPage, 'searchScope', 'restrictToPages', 'Page name')}
                        {chips(formData.searchScope.restrictToPages || [], 'searchScope', 'restrictToPages')}
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            Exclude these pages
                            {help('Never searches in these pages.')}
                        </Label>
                        {listInput(newExcludePage, setNewExcludePage, 'searchScope', 'excludePages', 'Page name')}
                        {chips(formData.searchScope.excludePages || [], 'searchScope', 'excludePages')}
                    </div>
                </div>
            </PageSection>

            <PageSection title="Result filtering">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="maxResults">Max results</Label>
                        <Input
                            id="maxResults"
                            type="number"
                            min="1"
                            max="50"
                            value={formData.resultFiltering.maxResults || ''}
                            onChange={(e) =>
                                handleNestedChange('resultFiltering', 'maxResults',
                                    e.target.value ? parseInt(e.target.value) : undefined
                                )
                            }
                            placeholder="No limit"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="minRelevanceScore">Minimum relevance score</Label>
                        <Input
                            id="minRelevanceScore"
                            type="number"
                            step="0.1"
                            min="0"
                            max="1"
                            value={formData.resultFiltering.minRelevanceScore || ''}
                            onChange={(e) =>
                                handleNestedChange('resultFiltering', 'minRelevanceScore',
                                    e.target.value ? parseFloat(e.target.value) : undefined
                                )
                            }
                            placeholder="0.0 - 1.0"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Switch
                        id="prioritizeRecent"
                        checked={formData.resultFiltering.prioritizeRecent}
                        onCheckedChange={(checked) =>
                            handleNestedChange('resultFiltering', 'prioritizeRecent', checked)
                        }
                    />
                    <Label htmlFor="prioritizeRecent" className="flex items-center gap-2">
                        Show recent results first
                        {help('Newer content is ranked higher.')}
                    </Label>
                </div>
            </PageSection>

            <div className="flex justify-end gap-3 border-t pt-6">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" className="gap-2">
                    <Save className="h-4 w-4" />
                    Save rule
                </Button>
            </div>
        </form>
    );
};

export default RecallRuleForm; 