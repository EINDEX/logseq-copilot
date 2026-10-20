import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useSearchEngines } from '@/hooks/use-search-engines';
import CustomSearchEngineForm from '../components/CustomSearchEngineForm';
import { SearchEngineConfig } from '@/utils/storage';
import { PageHelp, PageLayout, PageList, PageListRow, PageLoading, PageSection } from '../components/page-layout';

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
        return <PageLoading title="Search Engine Configuration">Loading search engine configuration...</PageLoading>;
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

    const renderEngine = (engine: SearchEngineConfig) => (
        <PageListRow key={engine.id} className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
                <span className="w-7 shrink-0 text-center text-xl leading-none">{engine.icon}</span>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor={`engine-${engine.id}`} className="text-sm font-medium">
                            {engine.name}
                        </Label>
                        {!engine.enabled && (
                            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                Disabled
                            </Badge>
                        )}
                    </div>
                    {engine.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{engine.description}</p>
                    )}
                    {engine.isCustom && (
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            Pattern: {engine.urlPattern}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {engine.isCustom && (
                    <>
                        <CustomSearchEngineForm
                            engine={engine}
                            onSave={(config) => handleUpdateCustomEngine(engine.id, config)}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveCustomEngine(engine.id)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${engine.name}`}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </>
                )}
                <Switch
                    id={`engine-${engine.id}`}
                    checked={engine.enabled}
                    onCheckedChange={() => handleToggle(engine.id)}
                />
            </div>
        </PageListRow>
    );

    return (
        <PageLayout
            title="Search Engine Configuration"
            description="Choose which search engines to enable Logseq Copilot integration for."
            meta={`${enabledCount} of ${totalCount} enabled`}
            actions={
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
            }
        >
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md">
                    {error}
                </div>
            )}

            <PageSection
                title="Built-in Search Engines"
                description="Pre-configured search engines with built-in integration."
            >
                <PageList>{builtInEngines.map(renderEngine)}</PageList>
            </PageSection>

            <PageSection
                title="Custom Search Engines"
                description="Add your own search engine templates for any website."
                actions={customEngines.length > 0 && <CustomSearchEngineForm onSave={handleAddCustomEngine} />}
            >
                {customEngines.length === 0 ? (
                    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed px-4 py-6">
                        <p className="text-sm text-muted-foreground">No custom search engines configured.</p>
                        <CustomSearchEngineForm onSave={handleAddCustomEngine} />
                    </div>
                ) : (
                    <PageList>{customEngines.map(renderEngine)}</PageList>
                )}
            </PageSection>

            <PageHelp title="How it works">
                <p>
                    When you search on an enabled search engine, Logseq Copilot appears in the
                    search results sidebar with relevant notes from your Logseq graph.
                    Disable the engines you don't use to save memory.
                </p>
                <p>
                    If it doesn't appear, check that the engine is enabled here and that the
                    connection under Settings works.
                </p>
            </PageHelp>
        </PageLayout>
    );
};

export default SearchEnginePage;