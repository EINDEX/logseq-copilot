import React, { useState } from 'react';
import { Trans, useTranslation } from '@/i18n/react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, Edit, Trash2, RotateCcw } from 'lucide-react';
import { useRecallRules } from '@/hooks/use-recall-rules';
import { RecallRuleConfig } from '@/utils/storage';
import RecallRuleForm from '../components/RecallRuleForm';
import {
    PageHelp,
    PageLayout,
    PageList,
    PageListRow,
    PageLoading,
    PageSection,
} from '../components/page-layout';
import log from '@/utils/logger';

const labelText = <span className="font-medium text-foreground" />;

const RecallRulesPage: React.FC = () => {
    const { t } = useTranslation();
    const {
        recallRules,
        loading,
        error,
        toggleRecallRule,
        deleteRecallRule,
        refreshRules,
        addRecallRule,
        updateRecallRule,
        isBuiltin,
        isOverridden,
        resetToBuiltin,
    } = useRecallRules();

    const [editingRule, setEditingRule] = useState<RecallRuleConfig | null>(null);
    const [showForm, setShowForm] = useState(false);

    if (loading) {
        return <PageLoading title={t('options.nav.recallRules')}>{t('options.recallRules.loading')}</PageLoading>;
    }

    const enabledRules = recallRules.filter(rule => rule.enabled);
    const disabledRules = recallRules.filter(rule => !rule.enabled);

    const handleToggle = async (id: string) => {
        await toggleRecallRule(id);
    };

    const handleRefresh = async () => {
        await refreshRules();
    };

    const handleEdit = (rule: RecallRuleConfig) => {
        setEditingRule(rule);
        setShowForm(true);
    };

    const handleAdd = () => {
        setEditingRule(null);
        setShowForm(true);
    };

    const handleDelete = async (id: string, name: string) => {
        if (confirm(t('options.recallRules.confirm.delete', { name }))) {
            await deleteRecallRule(id);
        }
    };

    const handleReset = async (id: string, name: string) => {
        if (confirm(t('options.recallRules.confirm.reset', { name }))) {
            await resetToBuiltin(id);
        }
    };

    const handleSave = async (ruleData: Omit<RecallRuleConfig, 'id'>) => {
        try {
            if (editingRule) {
                await updateRecallRule(editingRule.id, ruleData);
            } else {
                await addRecallRule(ruleData);
            }
            setShowForm(false);
            setEditingRule(null);
        } catch (error) {
            log.error('Failed to save recall rule:', error);
        }
    };

    const handleCancel = () => {
        setShowForm(false);
        setEditingRule(null);
    };

    const testRulePattern = (pattern: string, testUrl: string) => {
        try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(testUrl);
        } catch {
            return false;
        }
    };

    const flags = (rule: RecallRuleConfig) =>
        [
            rule.queryProcessing.ignoreHashFragments && t('options.recallRules.flags.ignoreHash'),
            rule.queryProcessing.ignoreQueryParams && t('options.recallRules.flags.ignoreQuery'),
            !rule.queryProcessing.ignoreQueryParams &&
                rule.queryProcessing.keepQueryParams?.length &&
                t('options.recallRules.flags.keep', {
                    params: rule.queryProcessing.keepQueryParams.join(', '),
                }),
            rule.queryProcessing.scopeDepth &&
                t('options.recallRules.flags.scope', { count: rule.queryProcessing.scopeDepth }),
            rule.searchScope.journalDateRange?.enabled &&
                t('options.recallRules.flags.journals', {
                    days: rule.searchScope.journalDateRange.days,
                }),
            rule.resultFiltering.prioritizeRecent && t('options.recallRules.flags.recentFirst'),
        ].filter((flag): flag is string => Boolean(flag));

    const keywordLine = (label: string, keywords: string[]) =>
        keywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="mr-1 text-muted-foreground">{label}</span>
                {keywords.map((keyword, index) => (
                    <Badge key={index} variant="secondary" className="font-normal">
                        {keyword}
                    </Badge>
                ))}
            </div>
        );

    const renderRule = (rule: RecallRuleConfig) => (
        <PageListRow key={rule.id} className="space-y-2">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {rule.name}
                        {isBuiltin(rule.id) && (
                            <Badge variant="secondary" className="font-normal">
                                {t('options.recallRules.badge.builtIn')}
                            </Badge>
                        )}
                        {isOverridden(rule.id) && (
                            <Badge variant="outline" className="font-normal text-muted-foreground">
                                {t('options.recallRules.badge.modified')}
                            </Badge>
                        )}
                    </div>
                    {rule.description && (
                        <p className="text-sm text-muted-foreground">{rule.description}</p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggle(rule.id)}
                        aria-label={t('options.recallRules.rule.enable', { name: rule.name })}
                        className="mr-2"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rule)}
                        aria-label={t('options.recallRules.rule.edit', { name: rule.name })}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    >
                        <Edit className="h-4 w-4" />
                    </Button>
                    {isBuiltin(rule.id) ? (
                        isOverridden(rule.id) ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReset(rule.id, rule.name)}
                                aria-label={t('options.recallRules.rule.reset', { name: rule.name })}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            >
                                <RotateCcw className="h-4 w-4" />
                            </Button>
                        ) : (
                            <span className="h-8 w-8" aria-hidden />
                        )
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(rule.id, rule.name)}
                            aria-label={t('options.recallRules.rule.delete', { name: rule.name })}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{rule.urlPattern}</code>
                {flags(rule).map((flag) => (
                    <Badge key={flag} variant="outline" className="font-normal text-muted-foreground">
                        {flag}
                    </Badge>
                ))}
            </div>

            {keywordLine(t('options.recallRules.keywords.exclude'), rule.queryProcessing.excludeKeywords)}
            {keywordLine(t('options.recallRules.keywords.prefer'), rule.queryProcessing.includeKeywords)}

            <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    {t('options.recallRules.testUrl.summary')}
                </summary>
                <input
                    type="text"
                    placeholder={t('options.recallRules.testUrl.placeholder')}
                    className="mt-2 w-full max-w-xl rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                    onInput={(e) => {
                        const input = e.target as HTMLInputElement;
                        const isMatch = testRulePattern(rule.urlPattern, input.value);
                        input.className = `mt-2 w-full max-w-xl rounded-md border px-2 py-1 text-xs ${input.value ? (isMatch ? 'border-primary bg-primary/5' : 'border-destructive bg-destructive/5') : 'border-input bg-transparent'
                            }`;
                    }}
                />
            </details>
        </PageListRow>
    );

    if (showForm) {
        return (
            <PageLayout
                title={editingRule ? t('options.recallRules.edit.title') : t('options.recallRules.add.title')}
                description={editingRule ? t('options.recallRules.edit.description') : t('options.recallRules.add.description')}
                actions={
                    <Button variant="outline" onClick={handleCancel}>
                        {t('common.cancel')}
                    </Button>
                }
            >
                <RecallRuleForm
                    initialRule={editingRule}
                    onSave={handleSave}
                    onCancel={handleCancel}
                />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title={t('options.nav.recallRules')}
            description={t('options.recallRules.description')}
            meta={t('options.recallRules.meta', {
                enabled: enabledRules.length,
                disabled: disabledRules.length,
            })}
            actions={
                <>
                    <Button variant="outline" size="sm" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t('options.recallRules.refresh')}
                    </Button>
                    <Button size="sm" onClick={handleAdd}>
                        <Plus className="h-4 w-4 mr-2" />
                        {t('options.recallRules.addRule')}
                    </Button>
                </>
            }
        >
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md">
                    {error}
                </div>
            )}

            <PageSection title={t('options.recallRules.enabledRules')}>
                {enabledRules.length === 0 ? (
                    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed px-4 py-6">
                        <p className="text-sm text-muted-foreground">{t('options.recallRules.noneEnabled')}</p>
                        <Button onClick={handleAdd} variant="outline" size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            {t('options.recallRules.createRule')}
                        </Button>
                    </div>
                ) : (
                    <PageList>{enabledRules.map(renderRule)}</PageList>
                )}
            </PageSection>

            {disabledRules.length > 0 && (
                <PageSection title={t('options.recallRules.disabledRules')}>
                    <PageList>{disabledRules.map(renderRule)}</PageList>
                </PageSection>
            )}

            <PageHelp title={t('options.recallRules.help.title')}>
                <p>
                    <Trans
                        i18nKey="options.recallRules.help.urlPattern"
                        values={{ example1: 'github\\.com', example2: '.*reddit\\.com.*' }}
                        components={{ label: labelText, code: <code /> }}
                    />
                </p>
                <p>
                    <Trans
                        i18nKey="options.recallRules.help.queryProcessing"
                        components={{ label: labelText }}
                    />
                </p>
                <p>
                    <Trans
                        i18nKey="options.recallRules.help.searchScope"
                        components={{ label: labelText }}
                    />
                </p>
                <p>
                    <Trans
                        i18nKey="options.recallRules.help.resultFiltering"
                        components={{ label: labelText }}
                    />
                </p>
            </PageHelp>
        </PageLayout>
    );
};

export default RecallRulesPage; 