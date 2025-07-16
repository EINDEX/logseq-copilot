import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Edit, HelpCircle } from 'lucide-react';
import { SearchEngineConfig } from '@/utils/storage';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface CustomSearchEngineFormProps {
    engine?: SearchEngineConfig;
    onSave: (config: Omit<SearchEngineConfig, 'id'>) => void;
    trigger?: React.ReactNode;
}

const CustomSearchEngineForm: React.FC<CustomSearchEngineFormProps> = ({
    engine,
    onSave,
    trigger,
}) => {
    const [open, setOpen] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        icon: '🔍',
        description: '',
        enabled: true,
        urlPattern: '',
        querySelector: '',
        elementSelector: '',
        insertPosition: 'last' as 'before' | 'after' | 'first' | 'last',
    });

    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (engine) {
            setFormData({
                name: engine.name || '',
                icon: engine.icon || '🔍',
                description: engine.description || '',
                enabled: engine.enabled ?? true,
                urlPattern: engine.urlPattern || '',
                querySelector: engine.querySelector || '',
                elementSelector: engine.elementSelector || '',
                insertPosition: engine.insertPosition || 'last',
            });
        }
    }, [engine]);

    const validateForm = () => {
        const newErrors: Record<string, string> = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Name is required';
        }

        if (!formData.urlPattern.trim()) {
            newErrors.urlPattern = 'URL pattern is required';
        }

        if (!formData.querySelector.trim()) {
            newErrors.querySelector = 'Query selector is required';
        }

        if (!formData.elementSelector.trim()) {
            newErrors.elementSelector = 'Element selector is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        onSave({
            name: formData.name,
            icon: formData.icon,
            description: formData.description,
            enabled: formData.enabled,
            isCustom: true,
            urlPattern: formData.urlPattern,
            querySelector: formData.querySelector,
            elementSelector: formData.elementSelector,
            insertPosition: formData.insertPosition,
        });

        setOpen(false);

        // Reset form if not editing
        if (!engine) {
            setFormData({
                name: '',
                icon: '🔍',
                description: '',
                enabled: true,
                urlPattern: '',
                querySelector: '',
                elementSelector: '',
                insertPosition: 'last',
            });
        }
    };

    const handleInputChange = (field: string, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }));

        // Clear error when user starts typing
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const defaultTrigger = engine ? (
        <Button variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Edit
        </Button>
    ) : (
        <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Custom Search Engine
        </Button>
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || defaultTrigger}
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {engine ? 'Edit Custom Search Engine' : 'Add Custom Search Engine'}
                    </DialogTitle>
                    <DialogDescription>
                        Create a custom search engine template to integrate Logseq Copilot with any search website.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="name">Name *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => handleInputChange('name', e.target.value)}
                                placeholder="e.g., Custom Search"
                                className={errors.name ? 'border-red-500' : ''}
                            />
                            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
                        </div>

                        <div>
                            <Label htmlFor="icon">Icon</Label>
                            <Input
                                id="icon"
                                value={formData.icon}
                                onChange={(e) => handleInputChange('icon', e.target.value)}
                                placeholder="🔍"
                                maxLength={2}
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => handleInputChange('description', e.target.value)}
                            placeholder="Brief description of this search engine"
                            rows={2}
                        />
                    </div>

                    <div>
                        <div className="flex items-center gap-2">
                            <Label htmlFor="urlPattern">URL Pattern *</Label>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Regex pattern or hostname to match the search engine website</p>
                                    <p>Examples: "example.com", ".*\.search\.com", "search\.example\.org"</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Input
                            id="urlPattern"
                            value={formData.urlPattern}
                            onChange={(e) => handleInputChange('urlPattern', e.target.value)}
                            placeholder="e.g., search.example.com or .*\.search\.com"
                            className={errors.urlPattern ? 'border-red-500' : ''}
                        />
                        {errors.urlPattern && <p className="text-red-500 text-sm mt-1">{errors.urlPattern}</p>}
                    </div>

                    <div>
                        <div className="flex items-center gap-2">
                            <Label htmlFor="querySelector">Query Selector *</Label>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>How to extract the search query from the page</p>
                                    <p>Use "?paramName" for URL parameters (e.g., "?q")</p>
                                    <p>Use CSS selectors for DOM elements (e.g., "#search-input")</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Input
                            id="querySelector"
                            value={formData.querySelector}
                            onChange={(e) => handleInputChange('querySelector', e.target.value)}
                            placeholder="e.g., ?q or #search-input"
                            className={errors.querySelector ? 'border-red-500' : ''}
                        />
                        {errors.querySelector && <p className="text-red-500 text-sm mt-1">{errors.querySelector}</p>}
                    </div>

                    <div>
                        <div className="flex items-center gap-2">
                            <Label htmlFor="elementSelector">Element Selector *</Label>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>CSS selector for the element where Logseq Copilot should be inserted</p>
                                    <p>Examples: "#sidebar", ".results-container", "main"</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Input
                            id="elementSelector"
                            value={formData.elementSelector}
                            onChange={(e) => handleInputChange('elementSelector', e.target.value)}
                            placeholder="e.g., #sidebar or .results-container"
                            className={errors.elementSelector ? 'border-red-500' : ''}
                        />
                        {errors.elementSelector && <p className="text-red-500 text-sm mt-1">{errors.elementSelector}</p>}
                    </div>

                    <div>
                        <Label>Insert Position</Label>
                        <RadioGroup
                            value={formData.insertPosition}
                            onValueChange={(value) => handleInputChange('insertPosition', value)}
                            className="flex flex-row gap-4 mt-2"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="before" id="before" />
                                <Label htmlFor="before">Before</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="after" id="after" />
                                <Label htmlFor="after">After</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="first" id="first" />
                                <Label htmlFor="first">First Child</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="last" id="last" />
                                <Label htmlFor="last">Last Child</Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">
                            {engine ? 'Update' : 'Add'} Search Engine
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CustomSearchEngineForm; 