import React from 'react';
import { LogseqConnectOptions } from '../components/Connect';
import { ClipNoteOptions } from '../components/ClipNote';
import { SidebarOptions } from '../components/SidebarOptions';
import { PageLayout } from '../components/page-layout';

const SettingsPage: React.FC = () => {
    return (
        <PageLayout title="Settings" description="Configure your Logseq Copilot extension settings.">
            <LogseqConnectOptions />
            <ClipNoteOptions />
            <SidebarOptions />
        </PageLayout>
    );
};

export default SettingsPage;
