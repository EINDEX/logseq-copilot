import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    RefreshCw,
    Plus,
    Edit,
    Trash2,
    Settings,
    Globe,
    Target,
    Filter,
    CheckCircle,
    XCircle,
    GripVertical
} from 'lucide-react';
import { useRecallRules } from '@/hooks/use-recall-rules';
import { RecallRuleConfig } from '@/utils/storage';
import RecallRuleForm from '../components/RecallRuleForm';
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
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-center h-64">
                    <div className="text-muted-foreground">Loading recall rules...</div>
                </div>
            </div>
        );
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
        if (confirm(`确定要删除召回规则 "${name}" 吗？`)) {
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

    const renderRuleCard = (rule: RecallRuleConfig) => (
        <div key={rule.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{rule.name}</span>
                        {rule.enabled ? (
                            <Badge variant="default" className="gap-1">
                                <CheckCircle className="h-3 w-3" />
                                启用
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                禁用
                            </Badge>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggle(rule.id)}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rule)}
                        aria-label={`Edit ${rule.name}`}
                        className="h-8 w-8 p-0"
                    >
                        <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(rule.id, rule.name)}
                        aria-label={`Delete ${rule.name}`}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {rule.description && (
                <p className="text-sm text-muted-foreground">{rule.description}</p>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span className="font-medium">URL 模式：</span>
                    <code className="ml-2 px-2 py-1 bg-muted rounded text-xs">
                        {rule.urlPattern}
                    </code>
                </div>
                <div className="flex flex-wrap gap-1">
                    {rule.queryProcessing.ignoreHashFragments && (
                        <Badge variant="outline" className="text-xs">忽略Hash</Badge>
                    )}
                    {rule.queryProcessing.ignoreQueryParams && (
                        <Badge variant="outline" className="text-xs">忽略参数</Badge>
                    )}
                    {rule.searchScope.journalDateRange?.enabled && (
                        <Badge variant="outline" className="text-xs">
                            日记范围({rule.searchScope.journalDateRange.days}天)
                        </Badge>
                    )}
                    {rule.resultFiltering.prioritizeRecent && (
                        <Badge variant="outline" className="text-xs">优先最新</Badge>
                    )}
                </div>
            </div>

            {(rule.queryProcessing.excludeKeywords.length > 0 ||
                rule.queryProcessing.includeKeywords.length > 0) && (
                    <div className="space-y-2 text-sm">
                        {rule.queryProcessing.excludeKeywords.length > 0 && (
                            <div>
                                <span className="font-medium text-muted-foreground">排除关键词：</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {rule.queryProcessing.excludeKeywords.map((keyword, index) => (
                                        <Badge key={index} variant="destructive" className="text-xs">
                                            {keyword}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                        {rule.queryProcessing.includeKeywords.length > 0 && (
                            <div>
                                <span className="font-medium text-muted-foreground">优先关键词：</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {rule.queryProcessing.includeKeywords.map((keyword, index) => (
                                        <Badge key={index} variant="default" className="text-xs">
                                            {keyword}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

            {/* Test URL Pattern */}
            <div className="pt-2 border-t">
                <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        测试URL模式
                    </summary>
                    <div className="mt-2 space-y-2">
                        <input
                            type="text"
                            placeholder="输入URL进行测试..."
                            className="w-full px-2 py-1 border rounded text-xs"
                            onInput={(e) => {
                                const input = e.target as HTMLInputElement;
                                const isMatch = testRulePattern(rule.urlPattern, input.value);
                                input.className = `w-full px-2 py-1 border rounded text-xs ${input.value ? (isMatch ? 'border-primary bg-primary/5' : 'border-destructive bg-destructive/5') : 'border-input'
                                    }`;
                            }}
                        />
                    </div>
                </details>
            </div>
        </div>
    );

    if (showForm) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">
                            {editingRule ? '编辑召回规则' : '添加召回规则'}
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            {editingRule ? '修改现有召回规则的配置' : '创建新的召回规则'}
                        </p>
                    </div>
                    <Button variant="outline" onClick={handleCancel}>
                        取消
                    </Button>
                </div>

                <RecallRuleForm
                    initialRule={editingRule}
                    onSave={handleSave}
                    onCancel={handleCancel}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">召回规则配置</h1>
                    <p className="text-muted-foreground mt-2">
                        配置针对不同网站的搜索召回规则，提高搜索结果的相关性
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        刷新
                    </Button>
                    <Button onClick={handleAdd}>
                        <Plus className="h-4 w-4 mr-2" />
                        添加规则
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md">
                    {error}
                </div>
            )}

            {/* Summary Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        规则概览
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-bold text-primary">
                                {enabledRules.length}
                            </div>
                            <p className="text-sm text-muted-foreground">启用的规则</p>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-muted-foreground">
                                {disabledRules.length}
                            </div>
                            <p className="text-sm text-muted-foreground">禁用的规则</p>
                        </div>
                        <div>
                            <div className="text-2xl font-bold">
                                {recallRules.length}
                            </div>
                            <p className="text-sm text-muted-foreground">总规则数</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Enabled Rules */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <CheckCircle className="h-5 w-5 text-primary" />
                                启用的规则 ({enabledRules.length})
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                这些规则当前正在生效
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {enabledRules.length === 0 ? (
                        <div className="text-center py-8">
                            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground mb-4">没有启用的召回规则</p>
                            <Button onClick={handleAdd} variant="outline">
                                <Plus className="h-4 w-4 mr-2" />
                                创建第一个规则
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {enabledRules.map(renderRuleCard)}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Disabled Rules */}
            {disabledRules.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <XCircle className="h-5 w-5 text-muted-foreground" />
                            禁用的规则 ({disabledRules.length})
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                            这些规则当前未生效
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {disabledRules.map(renderRuleCard)}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Help Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        使用说明
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <h4 className="font-medium mb-2">URL模式</h4>
                            <ul className="space-y-1 text-muted-foreground">
                                <li>• 使用正则表达式匹配网站</li>
                                <li>• 例如：<code>github\.com</code> 匹配GitHub</li>
                                <li>• 例如：<code>.*reddit\.com.*</code> 匹配Reddit</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium mb-2">查询处理</h4>
                            <ul className="space-y-1 text-muted-foreground">
                                <li>• 忽略Hash：移除URL中的#后缀部分</li>
                                <li>• 忽略参数：移除URL中的?后查询参数</li>
                                <li>• 关键词过滤：包含或排除特定词汇</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium mb-2">搜索范围</h4>
                            <ul className="space-y-1 text-muted-foreground">
                                <li>• 限制页面：只在指定页面中搜索</li>
                                <li>• 排除页面：排除特定页面</li>
                                <li>• 日记范围：限制日记条目的时间范围</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium mb-2">结果过滤</h4>
                            <ul className="space-y-1 text-muted-foreground">
                                <li>• 最大结果数：限制显示的结果数量</li>
                                <li>• 优先最新：最新的结果排在前面</li>
                                <li>• 相关性阈值：设置最低相关度</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default RecallRulesPage; 