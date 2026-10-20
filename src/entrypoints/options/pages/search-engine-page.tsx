import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle, XCircle, Trash2, Settings } from 'lucide-react';
import { useSearchEngines } from '@/hooks/use-search-engines';
import CustomSearchEngineForm from '../components/CustomSearchEngineForm';
import { SearchEngineConfig } from '@/utils/storage';

const SearchEnginePage: React.FC = () => {
    const {
        searchEngines,
        loading,
        error,
        toggleSearchEngine,
        refreshConfig,
        getEnabledSearchEngines,
        addCustomSearchEngine,
        removeSearchEngine,
        updateSearchEngine,
        getCustomSearchEngines,
        getBuiltInSearchEngines,
    } = useSearchEngines();

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-center h-64">
                    <div className="text-muted-foreground">Loading search engine configuration...</div>
                </div>
            </div>
        );
    }

    const enabledEngines = getEnabledSearchEngines();
    const enabledCount = enabledEngines.length;
    const totalCount = searchEngines.length;
    const customEngines = getCustomSearchEngines();
    const builtInEngines = getBuiltInSearchEngines();

    const handleToggle = async (id: string) => {
        await toggleSearchEngine(id);
    };

    const handleRefresh = async () => {
        await refreshConfig();
    };

    const handleAddCustomEngine = async (config: Omit<SearchEngineConfig, 'id'>) => {
        await addCustomSearchEngine(config);
    };

    const handleUpdateCustomEngine = async (id: string, config: Omit<SearchEngineConfig, 'id'>) => {
        await updateSearchEngine(id, config);
    };

    const handleRemoveCustomEngine = async (id: string) => {
        if (confirm('Are you sure you want to remove this custom search engine?')) {
            await removeSearchEngine(id);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Search Engine Configuration</h1>
                    <p className="text-muted-foreground mt-2">
                        Choose which search engines to enable Logseq Copilot integration for.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
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
                        <span>Summary</span>
                        <Badge variant="secondary" className="ml-2">
                            {enabledCount} of {totalCount} enabled
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span>{enabledCount} enabled</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            <span>{totalCount - enabledCount} disabled</span>
                        </div>
                    </div>
                    <Separator className="my-3" />
                    <p className="text-sm text-muted-foreground">
                        Logseq Copilot will only appear on enabled search engines.
                        Disable search engines you don't use to improve performance.
                    </p>
                </CardContent>
            </Card>

            {/* Built-in Search Engines */}
            <Card>
                <CardHeader>
                    <CardTitle>Built-in Search Engines</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Pre-configured search engines with built-in integration.
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {builtInEngines.map((engine, index) => (
                            <div key={engine.id}>
                                <div className="flex items-center justify-between py-2">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{engine.icon}</span>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor={`engine-${engine.id}`} className="text-sm font-medium">
                                                    {engine.name}
                                                </Label>
                                                <Badge
                                                    variant={engine.enabled ? "default" : "secondary"}
                                                    className="text-xs"
                                                >
                                                    {engine.enabled ? "Enabled" : "Disabled"}
                                                </Badge>
                                            </div>
                                            {engine.description && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {engine.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <Switch
                                        id={`engine-${engine.id}`}
                                        checked={engine.enabled}
                                        onCheckedChange={() => handleToggle(engine.id)}
                                    />
                                </div>
                                {index < builtInEngines.length - 1 && (
                                    <Separator className="mt-2" />
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Custom Search Engines */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Custom Search Engines</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Add your own search engine templates for any website.
                            </p>
                        </div>
                        <CustomSearchEngineForm onSave={handleAddCustomEngine} />
                    </div>
                </CardHeader>
                <CardContent>
                    {customEngines.length === 0 ? (
                        <div className="text-center py-8">
                            <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground mb-4">No custom search engines configured</p>
                            <CustomSearchEngineForm onSave={handleAddCustomEngine} />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {customEngines.map((engine, index) => (
                                <div key={engine.id}>
                                    <div className="flex items-center justify-between py-2">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{engine.icon}</span>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Label htmlFor={`engine-${engine.id}`} className="text-sm font-medium">
                                                        {engine.name}
                                                    </Label>
                                                    <Badge
                                                        variant={engine.enabled ? "default" : "secondary"}
                                                        className="text-xs"
                                                    >
                                                        {engine.enabled ? "Enabled" : "Disabled"}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-xs">
                                                        Custom
                                                    </Badge>
                                                </div>
                                                {engine.description && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {engine.description}
                                                    </p>
                                                )}
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    Pattern: {engine.urlPattern}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                id={`engine-${engine.id}`}
                                                checked={engine.enabled}
                                                onCheckedChange={() => handleToggle(engine.id)}
                                            />
                                            <CustomSearchEngineForm
                                                engine={engine}
                                                onSave={(config) => handleUpdateCustomEngine(engine.id, config)}
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleRemoveCustomEngine(engine.id)}
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    {index < customEngines.length - 1 && (
                                        <Separator className="mt-2" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Help Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Help & Information</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 text-sm">
                        <div>
                            <h4 className="font-medium mb-1">How it works</h4>
                            <p className="text-muted-foreground">
                                When you search on an enabled search engine, Logseq Copilot will appear
                                in the search results sidebar with relevant information from your Logseq graph.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-medium mb-1">Performance tip</h4>
                            <p className="text-muted-foreground">
                                Disable search engines you don't use to reduce memory usage and improve
                                extension performance.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-medium mb-1">Troubleshooting</h4>
                            <p className="text-muted-foreground">
                                If Logseq Copilot doesn't appear on a search engine, make sure it's enabled
                                here and that you're connected to your Logseq instance.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default SearchEnginePage;