import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared frame of every options page: title, description, an optional
 * one-line summary (inline stats) and actions on the right, then the
 * content. Pages take the full width of the content area; the outer
 * padding comes from the options layout.
 */
export function PageLayout({
    title,
    description,
    meta,
    actions,
    children,
}: {
    title: React.ReactNode;
    description?: React.ReactNode;
    /** Short inline summary under the description, e.g. "3 of 7 enabled". */
    meta?: React.ReactNode;
    actions?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <div className="flex w-full flex-col gap-8">
            <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                    {description && <p className="text-sm text-muted-foreground">{description}</p>}
                    {meta && <div className="text-sm text-muted-foreground">{meta}</div>}
                </div>
                {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
            </header>
            {children}
        </div>
    );
}

/**
 * A titled block of a page. Sections are separated by a rule and spacing
 * instead of a card around each of them.
 */
export function PageSection({
    title,
    description,
    actions,
    children,
    className,
}: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={cn('space-y-4 border-t pt-6', className)}>
            {(title || actions) && (
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="min-w-0 space-y-1">
                        {title && <h2 className="text-base font-semibold">{title}</h2>}
                        {description && <p className="text-sm text-muted-foreground">{description}</p>}
                    </div>
                    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
                </div>
            )}
            {children}
        </section>
    );
}

/**
 * Rows of a list (rules, search engines, highlights): thin dividers and a
 * hover background instead of a card per item. The dividers line up with
 * the section rule; the hover background reaches a little further out so
 * the row text stays aligned with the section title.
 */
export function PageList({ className, ...props }: React.ComponentProps<'ul'>) {
    return <ul className={cn('divide-y', className)} {...props} />;
}

export function PageListRow({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <li className="py-1">
            <div
                className={cn('-mx-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/50', className)}
                {...props}
            />
        </li>
    );
}

/** Collapsible help text, closed by default. */
export function PageHelp({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
    return (
        <details className="group border-t pt-6 text-sm">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                {title}
            </summary>
            <div className="mt-3 space-y-3 pl-5 text-muted-foreground">{children}</div>
        </details>
    );
}

/** Placeholder while a page loads its data. */
export function PageLoading({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
    return (
        <PageLayout title={title}>
            <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>
        </PageLayout>
    );
}
