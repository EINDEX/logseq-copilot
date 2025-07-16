import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Edit, Eye, EyeOff } from 'lucide-react';
import { useAIConfig } from '@/hooks/use-ai-config';
import { AIProviderConfig } from '@/utils/storage';

const AIConfigPage: React.FC = () => {
    const {
        aiConfig,
        loading,
        error,
        updateConfig,
        addProvider,
        updateProvider,
        deleteProvider
    } = useAIConfig();

    const [showApiKeys, setShowApiKeys] = useState<{ [key: string]: boolean }>({});
    const [editingProvider, setEditingProvider] = useState<string | null>(null);
    const [newProvider, setNewProvider] = useState<Omit<AIProviderConfig, 'id'>>({
        name: '',
        type: 'openai',
        apiKey: '',
        model: '',
        enabled: true,
        temperature: 0.7,
        maxTokens: 1000,
        systemPrompt: '',
    });

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-center h-64">
                    <div className="text-muted-foreground">Loading AI configuration...</div>
                </div>
            </div>
        );
    }

    const handleToggleApiKey = (providerId: string) => {
        setShowApiKeys(prev => ({
            ...prev,
            [providerId]: !prev[providerId]
        }));
    };

    const handleAddProvider = async () => {
        if (!newProvider.name || !newProvider.apiKey || !newProvider.model) {
            return;
        }

        await addProvider(newProvider);
        setNewProvider({
            name: '',
            type: 'openai',
            apiKey: '',
            model: '',
            enabled: true,
            temperature: 0.7,
            maxTokens: 1000,
            systemPrompt: '',
        });
    };

    const handleUpdateProvider = (id: string, updates: Partial<AIProviderConfig>) => {
        updateProvider(id, updates);
    };

    const handleDeleteProvider = (id: string) => {
        deleteProvider(id);
    };

    const handleSetDefaultProvider = (providerId: string) => {
        updateConfig({ defaultProvider: providerId });
    };

    const getProviderTypeLabel = (type: string) => {
        const labels = {
            openai: 'OpenAI',
            anthropic: 'Anthropic (Claude)',
            google: 'Google (Gemini)',
            ollama: 'Ollama',
            litellm: 'LiteLLM',
            custom: 'Custom'
        };
        return labels[type as keyof typeof labels] || type;
    };

    const getModelPlaceholder = (type: string) => {
        const placeholders = {
            openai: 'gpt-4, gpt-3.5-turbo',
            anthropic: 'claude-3-opus, claude-3-sonnet',
            google: 'gemini-pro, gemini-pro-vision',
            ollama: 'llama2, codellama',
            litellm: 'Any model supported by LiteLLM',
            custom: 'Model name'
        };
        return placeholders[type as keyof typeof placeholders] || 'Model name';
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">AI Configuration</h1>
                <p className="text-muted-foreground mt-2">
                    Configure AI providers and models for intelligent content processing.
                </p>
            </div>

            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md">
                    {error}
                </div>
            )}

            <div className="grid gap-6 w-full">
                {/* General Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle>General Settings</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Configure general AI behavior and settings.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="enable-ai">Enable AI Features</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Enable AI-powered content processing and analysis.
                                    </p>
                                </div>
                                <Switch
                                    id="enable-ai"
                                    checked={aiConfig.enabled}
                                    onCheckedChange={(checked) => updateConfig({ enabled: checked })}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="auto-run">Automatically Run</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Run AI processing automatically when templates contain variables.
                                    </p>
                                </div>
                                <Switch
                                    id="auto-run"
                                    checked={aiConfig.autoRun}
                                    onCheckedChange={(checked) => updateConfig({ autoRun: checked })}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Default Context */}
                <Card>
                    <CardHeader>
                        <CardTitle>Default Context</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Override the default context used for AI processing.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Label htmlFor="default-context">Context Template</Label>
                            <Textarea
                                id="default-context"
                                value={aiConfig.defaultContext}
                                onChange={(e) => updateConfig({ defaultContext: e.target.value })}
                                placeholder="{{fullHtml}}"
                                className="min-h-20"
                            />
                            <p className="text-sm text-muted-foreground">
                                Variables available: {`{{fullHtml}}, {{title}}, {{url}}, {{content}}`}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Providers */}
                <Card>
                    <CardHeader>
                        <CardTitle>AI Providers</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Configure AI providers and their models.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {aiConfig.providers.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    No providers configured. Add your first provider below.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {aiConfig.providers.map((provider) => (
                                        <div key={provider.id} className="border rounded-lg p-4 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <Switch
                                                            checked={provider.enabled}
                                                            onCheckedChange={(checked) =>
                                                                handleUpdateProvider(provider.id, { enabled: checked })
                                                            }
                                                        />
                                                        <h3 className="font-medium">{provider.name}</h3>
                                                        <span className="text-sm text-muted-foreground">
                                                            ({getProviderTypeLabel(provider.type)})
                                                        </span>
                                                    </div>
                                                    {aiConfig.defaultProvider === provider.id && (
                                                        <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                                                            Default
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleSetDefaultProvider(provider.id)}
                                                        disabled={aiConfig.defaultProvider === provider.id}
                                                    >
                                                        Set Default
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setEditingProvider(
                                                            editingProvider === provider.id ? null : provider.id
                                                        )}
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleDeleteProvider(provider.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {editingProvider === provider.id && (
                                                <div className="space-y-4 pt-4 border-t">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label>Provider Name</Label>
                                                            <Input
                                                                value={provider.name}
                                                                onChange={(e) =>
                                                                    handleUpdateProvider(provider.id, { name: e.target.value })
                                                                }
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>Model</Label>
                                                            <Input
                                                                value={provider.model}
                                                                onChange={(e) =>
                                                                    handleUpdateProvider(provider.id, { model: e.target.value })
                                                                }
                                                                placeholder={getModelPlaceholder(provider.type)}
                                                            />
                                                        </div>
                                                    </div>

                                                    {provider.type === 'custom' && (
                                                        <div className="space-y-2">
                                                            <Label>Base URL</Label>
                                                            <Input
                                                                value={provider.baseUrl || ''}
                                                                onChange={(e) =>
                                                                    handleUpdateProvider(provider.id, { baseUrl: e.target.value })
                                                                }
                                                                placeholder="https://api.example.com/v1"
                                                            />
                                                        </div>
                                                    )}

                                                    <div className="space-y-2">
                                                        <Label>API Key</Label>
                                                        <div className="relative">
                                                            <Input
                                                                type={showApiKeys[provider.id] ? 'text' : 'password'}
                                                                value={provider.apiKey}
                                                                onChange={(e) =>
                                                                    handleUpdateProvider(provider.id, { apiKey: e.target.value })
                                                                }
                                                                className="pr-10"
                                                            />
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7"
                                                                onClick={() => handleToggleApiKey(provider.id)}
                                                            >
                                                                {showApiKeys[provider.id] ?
                                                                    <EyeOff className="w-4 h-4" /> :
                                                                    <Eye className="w-4 h-4" />
                                                                }
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label>Temperature</Label>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                max="2"
                                                                step="0.1"
                                                                value={provider.temperature || 0.7}
                                                                onChange={(e) =>
                                                                    handleUpdateProvider(provider.id, {
                                                                        temperature: parseFloat(e.target.value)
                                                                    })
                                                                }
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>Max Tokens</Label>
                                                            <Input
                                                                type="number"
                                                                min="1"
                                                                max="32000"
                                                                value={provider.maxTokens || 1000}
                                                                onChange={(e) =>
                                                                    handleUpdateProvider(provider.id, {
                                                                        maxTokens: parseInt(e.target.value)
                                                                    })
                                                                }
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label>System Prompt</Label>
                                                        <Textarea
                                                            value={provider.systemPrompt || ''}
                                                            onChange={(e) =>
                                                                handleUpdateProvider(provider.id, { systemPrompt: e.target.value })
                                                            }
                                                            placeholder="You are a helpful assistant that processes web content..."
                                                            className="min-h-20"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <Separator />

                            {/* Add New Provider */}
                            <div className="space-y-4">
                                <h4 className="font-medium">Add New Provider</h4>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Provider Name</Label>
                                        <Input
                                            value={newProvider.name}
                                            onChange={(e) => setNewProvider(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="My OpenAI Provider"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Provider Type</Label>
                                        <RadioGroup
                                            value={newProvider.type}
                                            onValueChange={(value) => setNewProvider(prev => ({
                                                ...prev,
                                                type: value as AIProviderConfig['type']
                                            }))}
                                            className="flex flex-wrap gap-4"
                                        >
                                            {['openai', 'anthropic', 'google', 'ollama', 'litellm', 'custom'].map((type) => (
                                                <div key={type} className="flex items-center space-x-2">
                                                    <RadioGroupItem value={type} id={type} />
                                                    <Label htmlFor={type} className="text-sm">
                                                        {getProviderTypeLabel(type)}
                                                    </Label>
                                                </div>
                                            ))}
                                        </RadioGroup>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Model</Label>
                                        <Input
                                            value={newProvider.model}
                                            onChange={(e) => setNewProvider(prev => ({ ...prev, model: e.target.value }))}
                                            placeholder={getModelPlaceholder(newProvider.type)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>API Key</Label>
                                        <Input
                                            type="password"
                                            value={newProvider.apiKey}
                                            onChange={(e) => setNewProvider(prev => ({ ...prev, apiKey: e.target.value }))}
                                            placeholder="sk-..."
                                        />
                                    </div>
                                </div>

                                {newProvider.type === 'custom' && (
                                    <div className="space-y-2">
                                        <Label>Base URL</Label>
                                        <Input
                                            value={newProvider.baseUrl || ''}
                                            onChange={(e) => setNewProvider(prev => ({ ...prev, baseUrl: e.target.value }))}
                                            placeholder="https://api.example.com/v1"
                                        />
                                    </div>
                                )}

                                <Button
                                    onClick={handleAddProvider}
                                    disabled={!newProvider.name || !newProvider.apiKey || !newProvider.model}
                                    className="w-full"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Provider
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AIConfigPage; 