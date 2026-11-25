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
import { useTranslation } from '@/i18n/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ErrorKey =
    | 'options.searchEngines.form.errors.name'
    | 'options.searchEngines.form.errors.urlPattern'
    | 'options.searchEngines.form.errors.querySelector'
    | 'options.searchEngines.form.errors.elementSelector';

// Regex examples in the URL pattern tooltip: values, not words.
const URL_PATTERN_EXAMPLES = '"example.com", ".*\\.search\\.com", "search\\.example\\.org"';

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
    const { t } = useTranslation();
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

    // Keys of the messages, translated when they render.
    const [errors, setErrors] = useState<Record<string, ErrorKey | ''>>({});

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
        const newErrors: Record<string, ErrorKey> = {};

        if (!formData.name.trim()) {
            newErrors.name = 'options.searchEngines.form.errors.name';
        }

        if (!formData.urlPattern.trim()) {
            newErrors.urlPattern = 'options.searchEngines.form.errors.urlPattern';
        }

        if (!formData.querySelector.trim()) {
            newErrors.querySelector = 'options.searchEngines.form.errors.querySelector';
        }

        if (!formData.elementSelector.trim()) {
            newErrors.elementSelector = 'options.searchEngines.form.errors.elementSelector';
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
            {t('common.edit')}
        </Button>
    ) : (
        <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t('options.searchEngines.form.add')}
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
                        {engine ? t('options.searchEngines.form.editTitle') : t('options.searchEngines.form.add')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('options.searchEngines.form.description')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="name">{t('options.searchEngines.form.name')}</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => handleInputChange('name', e.target.value)}
                                placeholder={t('options.searchEngines.form.namePlaceholder')}
                                className={errors.name ? 'border-destructive' : ''}
                            />
                            {errors.name && <p className="text-destructive text-sm mt-1">{t(errors.name)}</p>}
                        </div>

                        <div>
                            <Label htmlFor="icon">{t('options.searchEngines.form.icon')}</Label>
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
                        <Label htmlFor="description">{t('options.searchEngines.form.descriptionLabel')}</Label>
                        <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => handleInputChange('description', e.target.value)}
                            placeholder={t('options.searchEngines.form.descriptionPlaceholder')}
                            rows={2}
                        />
                    </div>

                    <div>
                        <div className="flex items-center gap-2">
                            <Label htmlFor="urlPattern">{t('options.searchEngines.form.urlPattern')}</Label>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{t('options.searchEngines.form.urlPatternHelp')}</p>
                                    <p>{t('options.searchEngines.form.urlPatternExamples', { examples: URL_PATTERN_EXAMPLES })}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Input
                            id="urlPattern"
                            value={formData.urlPattern}
                            onChange={(e) => handleInputChange('urlPattern', e.target.value)}
                            placeholder={t('options.searchEngines.form.urlPatternPlaceholder')}
                            className={errors.urlPattern ? 'border-destructive' : ''}
                        />
                        {errors.urlPattern && <p className="text-destructive text-sm mt-1">{t(errors.urlPattern)}</p>}
                    </div>

                    <div>
                        <div className="flex items-center gap-2">
                            <Label htmlFor="querySelector">{t('options.searchEngines.form.querySelector')}</Label>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{t('options.searchEngines.form.querySelectorHelp')}</p>
                                    <p>{t('options.searchEngines.form.querySelectorParam')}</p>
                                    <p>{t('options.searchEngines.form.querySelectorCss')}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Input
                            id="querySelector"
                            value={formData.querySelector}
                            onChange={(e) => handleInputChange('querySelector', e.target.value)}
                            placeholder={t('options.searchEngines.form.querySelectorPlaceholder')}
                            className={errors.querySelector ? 'border-destructive' : ''}
                        />
                        {errors.querySelector && <p className="text-destructive text-sm mt-1">{t(errors.querySelector)}</p>}
                    </div>

                    <div>
                        <div className="flex items-center gap-2">
                            <Label htmlFor="elementSelector">{t('options.searchEngines.form.elementSelector')}</Label>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{t('options.searchEngines.form.elementSelectorHelp')}</p>
                                    <p>{t('options.searchEngines.form.elementSelectorExamples')}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Input
                            id="elementSelector"
                            value={formData.elementSelector}
                            onChange={(e) => handleInputChange('elementSelector', e.target.value)}
                            placeholder={t('options.searchEngines.form.elementSelectorPlaceholder')}
                            className={errors.elementSelector ? 'border-destructive' : ''}
                        />
                        {errors.elementSelector && <p className="text-destructive text-sm mt-1">{t(errors.elementSelector)}</p>}
                    </div>

                    <div>
                        <Label>{t('options.searchEngines.form.insertPosition')}</Label>
                        <RadioGroup
                            value={formData.insertPosition}
                            onValueChange={(value) => handleInputChange('insertPosition', value)}
                            className="flex flex-row gap-4 mt-2"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="before" id="before" />
                                <Label htmlFor="before">{t('options.searchEngines.form.before')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="after" id="after" />
                                <Label htmlFor="after">{t('options.searchEngines.form.after')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="first" id="first" />
                                <Label htmlFor="first">{t('options.searchEngines.form.firstChild')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="last" id="last" />
                                <Label htmlFor="last">{t('options.searchEngines.form.lastChild')}</Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit">
                            {engine ? t('options.searchEngines.form.update') : t('options.searchEngines.form.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CustomSearchEngineForm; 