import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/entrypoints/options/components/app-sidebar"

// SidebarInset is the <main> and takes all the width next to the sidebar;
// every page gets the same padding here. The trigger collapses the sidebar
// and is the only way to open it on narrow windows (it becomes a sheet).
export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="min-w-0">
                <header className="flex h-12 shrink-0 items-center px-4 sm:px-6 lg:px-10">
                    <SidebarTrigger className="-ml-1.5 text-muted-foreground" />
                </header>
                <div className="flex flex-1 flex-col px-4 pb-12 pt-2 sm:px-6 lg:px-10">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
