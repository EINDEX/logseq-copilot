import React from 'react';
import { LogseqConnectOptions } from '../components/Connect';
import { ClipNoteOptions } from '../components/ClipNote';
import { SidebarOptions } from '../components/SidebarOptions';
import { ExperimentalOptions } from '../components/ExperimentalOptions';
import { LanguageOptions } from '../components/LanguageOptions';
import { PageLayout } from '../components/page-layout';
import { useTranslation } from '@/i18n/react';

const SettingsPage: React.FC = () => {
    const { t } = useTranslation();
    return (
        <PageLayout title={t('options.settings.title')} description={t('options.settings.description')}>
            <LogseqConnectOptions />
            <ClipNoteOptions />
            <SidebarOptions />
            <LanguageOptions />
            <ExperimentalOptions />
        </PageLayout>
    );
};

export default SettingsPage;
