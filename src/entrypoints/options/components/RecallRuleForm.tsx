import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
    Save,
    X,
    Plus,
    Minus,
    HelpCircle,
    TestTube,
    Globe,
    Filter,
    Target,
    Clock
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RecallRuleConfig } from '@/utils/storage';

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
    const [newKeyword, setNewKeyword] = useState('');
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

    return (
        <div className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="h-5 w-5" />
                            基本信息
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">规则名称 *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="例如：GitHub项目页面"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="enabled" className="flex items-center gap-2">
                                    启用规则
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>启用后，此规则将在匹配的网站上生效</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </Label>
                                <Switch
                                    id="enabled"
                                    checked={formData.enabled}
                                    onCheckedChange={(checked) => handleInputChange('enabled', checked)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">描述</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                                placeholder="描述此规则的用途和适用场景"
                                rows={2}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="urlPattern" className="flex items-center gap-2">
                                URL 匹配模式 *
                                <Tooltip>
                                    <TooltipTrigger>
                                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>使用正则表达式匹配网站URL</p>
                                        <p>例如：github\.com.*\/[^\/]+\/[^\/]+$</p>
                                    </TooltipContent>
                                </Tooltip>
                            </Label>
                            <Input
                                id="urlPattern"
                                value={formData.urlPattern}
                                onChange={(e) => handleInputChange('urlPattern', e.target.value)}
                                placeholder="例如：github\.com"
                                required
                            />

                            {/* URL Pattern Test */}
                            <div className="space-y-2">
                                <Label className="text-sm text-muted-foreground">测试 URL 模式</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={testUrl}
                                        onChange={(e) => setTestUrl(e.target.value)}
                                        placeholder="输入 URL 进行测试..."
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
                                    <Button type="button" variant="outline" size="sm">
                                        <TestTube className="h-4 w-4" />
                                    </Button>
                                </div>
                                {testUrl && formData.urlPattern && (
                                    <p className={`text-sm ${urlPatternResult ? 'text-primary' : 'text-destructive'}`}>
                                        {urlPatternResult ? '✓ 匹配成功' : '✗ 不匹配'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Query Processing */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="h-5 w-5" />
                            查询处理
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="ignoreHashFragments"
                                    checked={formData.queryProcessing.ignoreHashFragments}
                                    onCheckedChange={(checked) =>
                                        handleNestedChange('queryProcessing', 'ignoreHashFragments', checked)
                                    }
                                />
                                <Label htmlFor="ignoreHashFragments" className="flex items-center gap-2">
                                    忽略 Hash 片段
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>移除 URL 中的 # 后面的部分</p>
                                            <p>适用于单页应用的 hash 路由</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </Label>
                            </div>

                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="ignoreQueryParams"
                                    checked={formData.queryProcessing.ignoreQueryParams}
                                    onCheckedChange={(checked) =>
                                        handleNestedChange('queryProcessing', 'ignoreQueryParams', checked)
                                    }
                                />
                                <Label htmlFor="ignoreQueryParams" className="flex items-center gap-2">
                                    忽略查询参数
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>移除 URL 中的 ? 后面的查询参数</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </Label>
                            </div>
                        </div>

                        <Separator />

                        {/* Exclude Keywords */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                排除关键词
                                <Tooltip>
                                    <TooltipTrigger>
                                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>包含这些关键词的搜索结果将被过滤掉</p>
                                    </TooltipContent>
                                </Tooltip>
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    value={newKeyword}
                                    onChange={(e) => setNewKeyword(e.target.value)}
                                    placeholder="输入要排除的关键词"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleArrayAdd('queryProcessing', 'excludeKeywords', newKeyword);
                                            setNewKeyword('');
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        handleArrayAdd('queryProcessing', 'excludeKeywords', newKeyword);
                                        setNewKeyword('');
                                    }}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {formData.queryProcessing.excludeKeywords.map((keyword, index) => (
                                    <Badge key={index} variant="destructive" className="gap-1">
                                        {keyword}
                                        <button
                                            type="button"
                                            onClick={() => handleArrayRemove('queryProcessing', 'excludeKeywords', index)}
                                            className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        {/* Include Keywords */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                优先关键词
                                <Tooltip>
                                    <TooltipTrigger>
                                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>包含这些关键词的搜索结果将被优先显示</p>
                                    </TooltipContent>
                                </Tooltip>
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    value={newKeyword}
                                    onChange={(e) => setNewKeyword(e.target.value)}
                                    placeholder="输入优先关键词"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleArrayAdd('queryProcessing', 'includeKeywords', newKeyword);
                                            setNewKeyword('');
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        handleArrayAdd('queryProcessing', 'includeKeywords', newKeyword);
                                        setNewKeyword('');
                                    }}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {formData.queryProcessing.includeKeywords.map((keyword, index) => (
                                    <Badge key={index} variant="default" className="gap-1">
                                        {keyword}
                                        <button
                                            type="button"
                                            onClick={() => handleArrayRemove('queryProcessing', 'includeKeywords', index)}
                                            className="ml-1 hover:bg-primary/20 rounded-full p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        {/* Ignore Path Segments */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                忽略路径段
                                <Tooltip>
                                    <TooltipTrigger>
                                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>忽略 URL 路径中的特定段落</p>
                                        <p>例如：忽略 "files" 段落在 GitHub 中</p>
                                    </TooltipContent>
                                </Tooltip>
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    value={newPathSegment}
                                    onChange={(e) => setNewPathSegment(e.target.value)}
                                    placeholder="输入要忽略的路径段"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleArrayAdd('queryProcessing', 'ignorePathSegments', newPathSegment);
                                            setNewPathSegment('');
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        handleArrayAdd('queryProcessing', 'ignorePathSegments', newPathSegment);
                                        setNewPathSegment('');
                                    }}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {formData.queryProcessing.ignorePathSegments.map((segment, index) => (
                                    <Badge key={index} variant="outline" className="gap-1">
                                        {segment}
                                        <button
                                            type="button"
                                            onClick={() => handleArrayRemove('queryProcessing', 'ignorePathSegments', index)}
                                            className="ml-1 hover:bg-muted rounded-full p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Search Scope */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Target className="h-5 w-5" />
                            搜索范围
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Journal Date Range */}
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
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
                                    限制日记时间范围
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>只搜索指定天数内的日记条目</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </Label>
                            </div>

                            {formData.searchScope.journalDateRange?.enabled && (
                                <div className="ml-6 space-y-2">
                                    <Label htmlFor="journalDays">搜索天数</Label>
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
                                        className="w-32"
                                    />
                                </div>
                            )}
                        </div>

                        <Separator />

                        {/* Restrict to Pages */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                限制搜索页面
                                <Tooltip>
                                    <TooltipTrigger>
                                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>只在指定的页面中搜索</p>
                                    </TooltipContent>
                                </Tooltip>
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    value={newRestrictPage}
                                    onChange={(e) => setNewRestrictPage(e.target.value)}
                                    placeholder="输入页面名称"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleArrayAdd('searchScope', 'restrictToPages', newRestrictPage);
                                            setNewRestrictPage('');
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        handleArrayAdd('searchScope', 'restrictToPages', newRestrictPage);
                                        setNewRestrictPage('');
                                    }}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(formData.searchScope.restrictToPages || []).map((page, index) => (
                                    <Badge key={index} variant="default" className="gap-1">
                                        {page}
                                        <button
                                            type="button"
                                            onClick={() => handleArrayRemove('searchScope', 'restrictToPages', index)}
                                            className="ml-1 hover:bg-primary/20 rounded-full p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        {/* Exclude Pages */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                排除搜索页面
                                <Tooltip>
                                    <TooltipTrigger>
                                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>排除指定的页面，不在其中搜索</p>
                                    </TooltipContent>
                                </Tooltip>
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    value={newExcludePage}
                                    onChange={(e) => setNewExcludePage(e.target.value)}
                                    placeholder="输入页面名称"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleArrayAdd('searchScope', 'excludePages', newExcludePage);
                                            setNewExcludePage('');
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        handleArrayAdd('searchScope', 'excludePages', newExcludePage);
                                        setNewExcludePage('');
                                    }}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(formData.searchScope.excludePages || []).map((page, index) => (
                                    <Badge key={index} variant="destructive" className="gap-1">
                                        {page}
                                        <button
                                            type="button"
                                            onClick={() => handleArrayRemove('searchScope', 'excludePages', index)}
                                            className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Result Filtering */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            结果过滤
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="maxResults">最大结果数</Label>
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
                                    placeholder="不限制"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="minRelevanceScore">最低相关性分数</Label>
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

                        <div className="flex items-center space-x-2">
                            <Switch
                                id="prioritizeRecent"
                                checked={formData.resultFiltering.prioritizeRecent}
                                onCheckedChange={(checked) =>
                                    handleNestedChange('resultFiltering', 'prioritizeRecent', checked)
                                }
                            />
                            <Label htmlFor="prioritizeRecent" className="flex items-center gap-2">
                                优先显示最新结果
                                <Tooltip>
                                    <TooltipTrigger>
                                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>较新的内容将排在搜索结果前面</p>
                                    </TooltipContent>
                                </Tooltip>
                            </Label>
                        </div>
                    </CardContent>
                </Card>

                {/* Form Actions */}
                <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        取消
                    </Button>
                    <Button type="submit" className="gap-2">
                        <Save className="h-4 w-4" />
                        保存规则
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default RecallRuleForm; 