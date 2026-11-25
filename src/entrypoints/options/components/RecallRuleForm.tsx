import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Save, X, Plus, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RecallRuleConfig } from '@/utils/storage';
import { RecallRuleProcessor } from '@/utils/recall-rule-processor';
import { broadestScopePrefix } from '@/utils/recall-scope';
import { PageSection } from './page-layout';
import { useTranslation } from '@/i18n/react';

// "This page" saves no depth.
const SCOPE_OPTIONS = [
    { value: 'page', depth: 0 },
    { value: '1', depth: 1 },
    { value: '2', depth: 2 },
    { value: '3', depth: 3 },
];

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
    const { t } = useTranslation();
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
    const [newKeepParam, setNewKeepParam] = useState('');
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
        // An emptied allowlist is "off", the same as a rule that never had one.
        const { keepQueryParams, ...queryProcessing } = formData.queryProcessing;
        onSave({
            ...formData,
            queryProcessing: keepQueryParams?.length
                ? { ...queryProcessing, keepQueryParams }
                : queryProcessing,
        });
    };

    const urlPatternResult = testUrlPattern();

    // What the rule recalls up to on the test URL, with its URL processing.
    const scopePreview = () => {
        if (!urlPatternResult) return undefined;
        try {
            const processed = RecallRuleProcessor.getInstance().processUrl(
                new URL(testUrl),
                [{ ...formData, id: '' }],
            );
            return broadestScopePrefix(processed, formData.queryProcessing.scopeDepth);
        } catch {
            return undefined;
        }
    };
    const recallPrefix = scopePreview();
    const ignoreQuery = formData.queryProcessing.ignoreQueryParams;
    // Shipped with a built-in rule; not editable here.
    const urlForms = formData.queryProcessing.urlForms ?? [];

    const help = (...lines: string[]) => (
        <Tooltip>
            <TooltipTrigger type="button" aria-label={t('options.recallRules.form.help')}>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
                {lines.map((line) => (
                    <p key={line}>{line}</p>
                ))}
            </TooltipContent>
        </Tooltip>
    );

    const chips = (items: string[], parent: string, field: string, disabled = false) =>
        items.length > 0 && (
            <div className={`flex flex-wrap gap-1.5${disabled ? ' opacity-50' : ''}`}>
                {items.map((item, index) => (
                    <Badge key={index} variant="secondary" className="gap-1 pr-1 font-normal">
                        {item}
                        <button
                            type="button"
                            onClick={() => handleArrayRemove(parent, field, index)}
                            disabled={disabled}
                            className="rounded-full p-0.5 hover:bg-foreground/10 disabled:pointer-events-none"
                            aria-label={t('options.recallRules.form.remove', { item })}
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
        disabled = false,
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
                    disabled={disabled}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            add();
                        }
                    }}
                />
                <Button type="button" variant="outline" size="sm" className="h-9 w-9 shrink-0 p-0" onClick={add} disabled={disabled} aria-label={t('options.recallRules.form.add')}>
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
        );
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            <PageSection title={t('options.recallRules.form.basics')}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="name">{t('options.recallRules.form.name.label')}</Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            placeholder={t('options.recallRules.form.name.placeholder')}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="enabled" className="flex items-center gap-2">
                            {t('options.recallRules.form.enabled.label')}
                            {help(t('options.recallRules.form.enabled.help'))}
                        </Label>
                        <Switch
                            id="enabled"
                            checked={formData.enabled}
                            onCheckedChange={(checked) => handleInputChange('enabled', checked)}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">{t('options.recallRules.form.description.label')}</Label>
                    <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        placeholder={t('options.recallRules.form.description.placeholder')}
                        rows={2}
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="urlPattern" className="flex items-center gap-2">
                            {t('options.recallRules.form.urlPattern.label')}
                            {help(
                                t('options.recallRules.form.urlPattern.help'),
                                t('options.recallRules.form.urlPattern.example', { example: 'github\\.com.*\\/[^\\/]+\\/[^\\/]+$' }),
                            )}
                        </Label>
                        <Input
                            id="urlPattern"
                            value={formData.urlPattern}
                            onChange={(e) => handleInputChange('urlPattern', e.target.value)}
                            placeholder={t('options.recallRules.form.urlPattern.placeholder', { example: 'github\.com' })}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="testUrl" className="text-muted-foreground">{t('options.recallRules.form.testUrl.label')}</Label>
                        <Input
                            id="testUrl"
                            value={testUrl}
                            onChange={(e) => setTestUrl(e.target.value)}
                            placeholder={t('options.recallRules.testUrl.placeholder')}
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
                                {urlPatternResult
                                    ? recallPrefix
                                        ? t('options.recallRules.form.testUrl.matchesPrefix', { prefix: recallPrefix })
                                        : t('options.recallRules.form.testUrl.matches')
                                    : t('options.recallRules.form.testUrl.noMatch')}
                            </p>
                        )}
                    </div>
                </div>
            </PageSection>

            <PageSection title={t('options.recallRules.form.queryProcessing.title')} description={t('options.recallRules.form.queryProcessing.description')}>
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
                            {t('options.recallRules.form.ignoreHash.label')}
                            {help(t('options.recallRules.form.ignoreHash.help'), t('options.recallRules.form.ignoreHash.helpSpa'))}
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
                            {t('options.recallRules.form.ignoreQuery.label')}
                            {help(t('options.recallRules.form.ignoreQuery.help'))}
                        </Label>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                        {t('options.recallRules.form.scope.label')}
                        {help(t('options.recallRules.form.scope.help'), t('options.recallRules.form.scope.helpExample'))}
                    </Label>
                    <RadioGroup
                        aria-label={t('options.recallRules.form.scope.label')}
                        value={formData.queryProcessing.scopeDepth ? String(formData.queryProcessing.scopeDepth) : 'page'}
                        onValueChange={(value) =>
                            handleNestedChange('queryProcessing', 'scopeDepth', value === 'page' ? undefined : Number(value))
                        }
                        className="flex flex-wrap gap-x-6 gap-y-2"
                    >
                        {SCOPE_OPTIONS.map((option) => (
                            <div key={option.value} className="flex items-center gap-2">
                                <RadioGroupItem value={option.value} id={`scope-${option.value}`} />
                                <Label htmlFor={`scope-${option.value}`}>
                                    {option.depth
                                        ? t('options.recallRules.form.scope.levels', { count: option.depth })
                                        : t('options.recallRules.form.scope.page')}
                                </Label>
                            </div>
                        ))}
                    </RadioGroup>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label className={`flex items-center gap-2${ignoreQuery ? ' text-muted-foreground' : ''}`}>
                            {t('options.recallRules.form.keepParams.label')}
                            {help(t('options.recallRules.form.keepParams.help'), t('options.recallRules.form.keepParams.helpExample'))}
                        </Label>
                        {listInput(newKeepParam, setNewKeepParam, 'queryProcessing', 'keepQueryParams', t('options.recallRules.form.keepParams.placeholder'), ignoreQuery)}
                        {chips(formData.queryProcessing.keepQueryParams || [], 'queryProcessing', 'keepQueryParams', ignoreQuery)}
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            {t('options.recallRules.form.excludeKeywords.label')}
                            {help(t('options.recallRules.form.excludeKeywords.help'))}
                        </Label>
                        {listInput(newExcludeKeyword, setNewExcludeKeyword, 'queryProcessing', 'excludeKeywords', t('options.recallRules.form.excludeKeywords.placeholder'))}
                        {chips(formData.queryProcessing.excludeKeywords, 'queryProcessing', 'excludeKeywords')}
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            {t('options.recallRules.form.preferKeywords.label')}
                            {help(t('options.recallRules.form.preferKeywords.help'))}
                        </Label>
                        {listInput(newIncludeKeyword, setNewIncludeKeyword, 'queryProcessing', 'includeKeywords', t('options.recallRules.form.preferKeywords.placeholder'))}
                        {chips(formData.queryProcessing.includeKeywords, 'queryProcessing', 'includeKeywords')}
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            {t('options.recallRules.form.ignorePath.label')}
                            {help(t('options.recallRules.form.ignorePath.help'), t('options.recallRules.form.ignorePath.helpExample'))}
                        </Label>
                        {listInput(newPathSegment, setNewPathSegment, 'queryProcessing', 'ignorePathSegments', t('options.recallRules.form.ignorePath.placeholder'))}
                        {chips(formData.queryProcessing.ignorePathSegments, 'queryProcessing', 'ignorePathSegments')}
                    </div>
                </div>
                {urlForms.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Label className="mr-1 text-muted-foreground">{t('options.recallRules.form.sameUrlUnder')}</Label>
                        {urlForms.map((form) => (
                            <code key={form} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                {form}
                            </code>
                        ))}
                    </div>
                )}
            </PageSection>

            <PageSection title={t('options.recallRules.form.searchScope.title')} description={t('options.recallRules.form.searchScope.description')}>
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
                            {t('options.recallRules.form.limitJournal.label')}
                            {help(t('options.recallRules.form.limitJournal.help'))}
                        </Label>
                    </div>
                    {formData.searchScope.journalDateRange?.enabled && (
                        <div className="flex items-center gap-2">
                            <Label htmlFor="journalDays" className="text-muted-foreground">{t('options.recallRules.form.limitJournal.days')}</Label>
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
                            {t('options.recallRules.form.restrictPages.label')}
                            {help(t('options.recallRules.form.restrictPages.help'))}
                        </Label>
                        {listInput(newRestrictPage, setNewRestrictPage, 'searchScope', 'restrictToPages', t('options.recallRules.form.pageName'))}
                        {chips(formData.searchScope.restrictToPages || [], 'searchScope', 'restrictToPages')}
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            {t('options.recallRules.form.excludePages.label')}
                            {help(t('options.recallRules.form.excludePages.help'))}
                        </Label>
                        {listInput(newExcludePage, setNewExcludePage, 'searchScope', 'excludePages', t('options.recallRules.form.pageName'))}
                        {chips(formData.searchScope.excludePages || [], 'searchScope', 'excludePages')}
                    </div>
                </div>
            </PageSection>

            <PageSection title={t('options.recallRules.form.resultFiltering.title')}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="maxResults">{t('options.recallRules.form.maxResults.label')}</Label>
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
                            placeholder={t('options.recallRules.form.maxResults.placeholder')}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="minRelevanceScore">{t('options.recallRules.form.minScore.label')}</Label>
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
                            placeholder={t('options.recallRules.form.minScore.placeholder')}
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
                        {t('options.recallRules.form.prioritizeRecent.label')}
                        {help(t('options.recallRules.form.prioritizeRecent.help'))}
                    </Label>
                </div>
            </PageSection>

            <div className="flex justify-end gap-3 border-t pt-6">
                <Button type="button" variant="outline" onClick={onCancel}>
                    {t('common.cancel')}
                </Button>
                <Button type="submit" className="gap-2">
                    <Save className="h-4 w-4" />
                    {t('options.recallRules.form.save')}
                </Button>
            </div>
        </form>
    );
};

export default RecallRuleForm; 