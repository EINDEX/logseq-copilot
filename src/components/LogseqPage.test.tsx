import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LogseqPageLink from './LogseqPage';
import type { LogseqPageIdenity } from '@/types/logseqBlock';

// Mock @tabler/icons-react
vi.mock('@tabler/icons-react', () => ({
    IconFile: () => <div data-testid="file-icon" />,
}));

describe('LogseqPageLink Component', () => {
    afterEach(cleanup);

    const mockPage: LogseqPageIdenity = {
        id: 1,
        name: 'Test Page',
        uuid: 'test-page-uuid',
        originalName: 'Test Page',
    };

    const defaultProps = {
        graph: 'test-graph',
        page: mockPage,
    };

    it('should render page link with correct href', () => {
        render(<LogseqPageLink {...defaultProps} />);

        const link = screen.getByRole('link');
        expect(link).toBeTruthy();
        expect(link.getAttribute('href')).toBe('logseq://graph/test-graph?page=Test Page');
    });

    it('should display page originalName when available', () => {
        render(<LogseqPageLink {...defaultProps} />);

        expect(screen.getByText('Test Page')).toBeTruthy();
    });

    it('should display page name when originalName is not available', () => {
        const pageWithoutOriginalName: LogseqPageIdenity = {
            id: 1,
            name: 'Test Page',
            uuid: 'test-page-uuid',
        };

        render(<LogseqPageLink graph="test-graph" page={pageWithoutOriginalName} />);

        expect(screen.getByText('Test Page')).toBeTruthy();
    });

    it('should render file icon', () => {
        render(<LogseqPageLink {...defaultProps} />);

        expect(screen.getByTestId('file-icon')).toBeTruthy();
    });

    it('should handle page name with spaces', () => {
        const pageWithSpaces: LogseqPageIdenity = {
            ...mockPage,
            name: 'Page With Spaces',
            originalName: 'Page With Spaces',
        };

        render(<LogseqPageLink graph="test-graph" page={pageWithSpaces} />);

        const link = screen.getByRole('link');
        expect(link.getAttribute('href')).toBe('logseq://graph/test-graph?page=Page With Spaces');
        expect(screen.getByText('Page With Spaces')).toBeTruthy();
    });

    it('should handle page name with special characters', () => {
        const pageWithSpecialChars: LogseqPageIdenity = {
            ...mockPage,
            name: 'Page/With-Special_Characters',
            originalName: 'Page/With-Special_Characters',
        };

        render(<LogseqPageLink graph="test-graph" page={pageWithSpecialChars} />);

        const link = screen.getByRole('link');
        expect(link.getAttribute('href')).toBe('logseq://graph/test-graph?page=Page/With-Special_Characters');
        expect(screen.getByText('Page/With-Special_Characters')).toBeTruthy();
    });

    it('should handle different graph names', () => {
        render(<LogseqPageLink graph="my-special-graph" page={mockPage} />);

        const link = screen.getByRole('link');
        expect(link.getAttribute('href')).toBe('logseq://graph/my-special-graph?page=Test Page');
    });

    it('should apply truncate class to text span', () => {
        render(<LogseqPageLink {...defaultProps} />);

        const pageText = screen.getByText('Test Page');
        expect(pageText).toBeTruthy();
        expect(Array.from(pageText!.classList)).toEqual(expect.arrayContaining(['truncate']));
    });

    it('should have correct CSS classes for styling', () => {
        render(<LogseqPageLink {...defaultProps} />);

        const link = screen.getByRole('link');
        expect(Array.from(link!.classList)).toEqual(expect.arrayContaining(['flex', 'items-center', 'gap-1.5']));
        expect(Array.from(link!.classList)).toEqual(expect.arrayContaining(['text-sm', 'font-medium']));
        expect(Array.from(link!.classList)).toEqual(expect.arrayContaining(['text-foreground', 'hover:text-primary']));
        expect(Array.from(link!.classList)).toEqual(expect.arrayContaining(['transition-colors']));
        expect(Array.from(link!.classList)).toEqual(expect.arrayContaining(['no-underline', 'hover:underline']));
    });

    it('should accept custom className prop', () => {
        const customClass = 'custom-class';
        render(<LogseqPageLink {...defaultProps} className={customClass} />);

        const link = screen.getByRole('link');
        expect(Array.from(link!.classList)).toEqual(expect.arrayContaining([customClass]));
    });

    it('should be accessible', () => {
        render(<LogseqPageLink {...defaultProps} />);

        const link = screen.getByRole('link');
        expect(link).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Test Page' })).toBe(link);
    });

    it('should prefer originalName over name when both exist', () => {
        const pageWithBothNames: LogseqPageIdenity = {
            id: 1,
            name: 'page-name',
            uuid: 'test-uuid',
            originalName: 'Original Page Name',
        };

        render(<LogseqPageLink graph="test-graph" page={pageWithBothNames} />);

        expect(screen.getByText('Original Page Name')).toBeTruthy();
        expect(screen.queryByText('page-name')).toBeNull();
    });

    describe('edge cases', () => {
        it('should return null when page is undefined', () => {
            const { container } = render(
                <LogseqPageLink graph="test-graph" page={undefined as any} />
            );

            expect(container.firstChild).toBeNull();
        });

        it('should return null when page name is undefined', () => {
            const pageWithoutName: LogseqPageIdenity = {
                id: 1,
                name: undefined as any,
                uuid: 'test-uuid',
            };

            const { container } = render(
                <LogseqPageLink graph="test-graph" page={pageWithoutName} />
            );

            expect(container.firstChild).toBeNull();
        });

        it('should handle empty page name', () => {
            const emptyPage: LogseqPageIdenity = {
                ...mockPage,
                name: '',
                originalName: '',
            };

            render(<LogseqPageLink graph="test-graph" page={emptyPage} />);

            const link = screen.getByRole('link');
            expect(link.getAttribute('href')).toBe('logseq://graph/test-graph?page=');
        });

        it('should handle page name with only whitespace', () => {
            const whitespacePageName = '   ';
            const whitespacePage: LogseqPageIdenity = {
                ...mockPage,
                name: whitespacePageName,
                originalName: whitespacePageName,
            };

            render(<LogseqPageLink graph="test-graph" page={whitespacePage} />);

            const link = screen.getByRole('link');
            expect(link.getAttribute('href')).toBe(`logseq://graph/test-graph?page=${whitespacePageName}`);
        });

        it('should handle unicode characters in page name', () => {
            const unicodePage: LogseqPageIdenity = {
                ...mockPage,
                name: '测试页面 🚀',
                originalName: '测试页面 🚀',
            };

            render(<LogseqPageLink graph="test-graph" page={unicodePage} />);

            const link = screen.getByRole('link');
            expect(link.getAttribute('href')).toBe('logseq://graph/test-graph?page=测试页面 🚀');
            expect(screen.getByText('测试页面 🚀')).toBeTruthy();
        });
    });

    describe('file icon styling', () => {
        it('should apply correct classes to file icon', () => {
            render(<LogseqPageLink {...defaultProps} />);

            const icon = screen.getByTestId('file-icon');
            expect(icon).toBeTruthy();
            // Note: The actual classes are applied to the IconFile component
            // In our mock, we can't test the classes, but we can test presence
        });
    });
}); 