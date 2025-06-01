import React from 'react';
import { LogseqConnectOptions } from '../components/Connect';
import { ClipNoteOptions } from '../components/ClipNote';

const SettingsPage: React.FC = () => {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Configure your Logseq Copilot extension settings.
                </p>
            </div>

            <div className="grid gap-6 w-full">
                <LogseqConnectOptions />
                <ClipNoteOptions />
            </div>
        </div>
    );
};

export default SettingsPage; 