import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, Edit, Trash2 } from 'lucide-react';
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

const RecallRulesPage: React.FC = () => {
    const {
        recallRules,
        loading,
        error,
        toggleRecallRule,
        deleteRecallRule,
        refreshRules,
        addRecallRule,
        updateRecallRule,
    } = useRecallRules();

    const [editingRule, setEditingRule] = useState<RecallRuleConfig | null>(null);
    const [showForm, setShowForm] = useState(false);

    if (loading) {
        return <PageLoading title="Recall Rules">Loading recall rules...</PageLoading>;
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
        if (confirm(`Delete the recall rule "${name}"?`)) {
            await deleteRecallRule(id);
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
            rule.queryProcessing.ignoreHashFragments && 'Ignore hash',
            rule.queryProcessing.ignoreQueryParams && 'Ignore query',
            rule.searchScope.journalDateRange?.enabled &&
                `Journals: last ${rule.searchScope.journalDateRange.days} days`,
            rule.resultFiltering.prioritizeRecent && 'Recent first',
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
                    <div className="text-sm font-medium">{rule.name}</div>
                    {rule.description && (
                        <p className="text-sm text-muted-foreground">{rule.description}</p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggle(rule.id)}
                        aria-label={`Enable ${rule.name}`}
                        className="mr-2"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rule)}
                        aria-label={`Edit ${rule.name}`}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    >
                        <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(rule.id, rule.name)}
                        aria-label={`Delete ${rule.name}`}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
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

            {keywordLine('Exclude', rule.queryProcessing.excludeKeywords)}
            {keywordLine('Prefer', rule.queryProcessing.includeKeywords)}

            <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Test URL pattern
                </summary>
                <input
                    type="text"
                    placeholder="Enter a URL to test..."
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
                title={editingRule ? 'Edit recall rule' : 'Add recall rule'}
                description={editingRule ? 'Change how this rule matches pages and searches your graph.' : 'Create a rule for the pages it should match.'}
                actions={
                    <Button variant="outline" onClick={handleCancel}>
                        Cancel
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
            title="Recall Rules"
            description="Adjust how Logseq Copilot searches your graph on specific websites."
            meta={`${enabledRules.length} enabled · ${disabledRules.length} disabled`}
            actions={
                <>
                    <Button variant="outline" size="sm" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                    <Button size="sm" onClick={handleAdd}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add rule
                    </Button>
                </>
            }
        >
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md">
                    {error}
                </div>
            )}

            <PageSection title="Enabled rules">
                {enabledRules.length === 0 ? (
                    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed px-4 py-6">
                        <p className="text-sm text-muted-foreground">No recall rule is enabled.</p>
                        <Button onClick={handleAdd} variant="outline" size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Create a rule
                        </Button>
                    </div>
                ) : (
                    <PageList>{enabledRules.map(renderRule)}</PageList>
                )}
            </PageSection>

            {disabledRules.length > 0 && (
                <PageSection title="Disabled rules">
                    <PageList>{disabledRules.map(renderRule)}</PageList>
                </PageSection>
            )}

            <PageHelp title="How recall rules work">
                <p>
                    <span className="font-medium text-foreground">URL pattern:</span> a regular
                    expression matched against the page URL, e.g. <code>github\.com</code> or{' '}
                    <code>.*reddit\.com.*</code>.
                </p>
                <p>
                    <span className="font-medium text-foreground">Query processing:</span> drop the
                    URL hash or query parameters before searching, and exclude or prefer keywords.
                </p>
                <p>
                    <span className="font-medium text-foreground">Search scope:</span> search only
                    some pages, skip pages, or limit journals to recent days.
                </p>
                <p>
                    <span className="font-medium text-foreground">Result filtering:</span> limit the
                    number of results, show recent ones first, or set a minimum relevance score.
                </p>
            </PageHelp>
        </PageLayout>
    );
};

export default RecallRulesPage; 