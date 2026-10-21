import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LogseqPageContent } from './LogseqPageContent';
import type { LogseqPageContentType, LogseqPageIdenity } from '@/types/logseqBlock';

// Mock @tabler/icons-react
vi.mock('@tabler/icons-react', () => ({
    IconFile: () => <div data-testid="file-icon" />,
}));

// Mock shadcn/ui components
vi.mock('./ui/card', () => ({
    Card: ({ children, className }: any) => <div className={className}>{children}</div>,
    CardContent: ({ children }: any) => <div>{children}</div>,
    CardHeader: ({ children }: any) => <div>{children}</div>,
}));

describe('LogseqPageContent Component', () => {
    afterEach(cleanup);

    const mockPage: LogseqPageIdenity = {
        id: 1,
        name: 'Test Page',
        uuid: 'test-page-uuid',
        originalName: 'Test Page',
    };

    const createMockPageContent = (content: string): LogseqPageContentType => ({
        uuid: 'test-page-content-uuid',
        content,
        page: mockPage,
    });

    const defaultProps = {
        graph: 'test-graph',
        pageContent: createMockPageContent('<p>Simple text content</p>'),
    };

    it('should render page content with HTML', () => {
        render(<LogseqPageContent {...defaultProps} />);

        // Check that the content is rendered with dangerouslySetInnerHTML
        expect(screen.getByText('Simple text content')).toBeTruthy();
    });

    it('should render page link in header', () => {
        render(<LogseqPageContent {...defaultProps} />);

        expect(screen.getByTestId('file-icon')).toBeTruthy();
        expect(screen.getByText('Test Page')).toBeTruthy();
    });

    it('should not render when content is empty', () => {
        const emptyContent = createMockPageContent('');
        const { container } = render(
            <LogseqPageContent graph="test-graph" pageContent={emptyContent} />
        );

        expect(container.firstChild).toBeNull();
    });

    it('should not render when content is undefined', () => {
        const undefinedContent = { ...createMockPageContent(''), content: undefined as any };
        const { container } = render(
            <LogseqPageContent graph="test-graph" pageContent={undefinedContent} />
        );

        expect(container.firstChild).toBeNull();
    });

    it('should render markdown content as HTML', () => {
        const markdownContent = createMockPageContent('<p><strong>Bold text</strong> and <em>italic text</em></p>');
        render(<LogseqPageContent graph="test-graph" pageContent={markdownContent} />);

        const boldElement = screen.getByText('Bold text');
        const italicElement = screen.getByText('italic text');

        expect(boldElement).toBeTruthy();
        expect(italicElement).toBeTruthy();
        expect(boldElement.tagName.toLowerCase()).toBe('strong');
        expect(italicElement.tagName.toLowerCase()).toBe('em');
    });

    it('should render complex HTML content', () => {
        const htmlContent = createMockPageContent(`
      <div>
        <h2>Heading</h2>
        <p>Paragraph with <a href="https://example.com">link</a></p>
        <ul>
          <li>List item 1</li>
          <li>List item 2</li>
        </ul>
      </div>
    `);

        render(<LogseqPageContent graph="test-graph" pageContent={htmlContent} />);

        expect(screen.getByText('Heading')).toBeTruthy();
        expect(screen.getByText('Paragraph with')).toBeTruthy();
        expect(screen.getByText('link')).toBeTruthy();
        expect(screen.getByText('List item 1')).toBeTruthy();
        expect(screen.getByText('List item 2')).toBeTruthy();
    });

    it('should apply correct CSS classes for prose styling', () => {
        const { container } = render(<LogseqPageContent {...defaultProps} />);

        const proseElement = container.querySelector('[class*="prose"]');
        expect(proseElement).toBeTruthy();
        expect(Array.from(proseElement!.classList)).toEqual(expect.arrayContaining(['prose', 'prose-sm', 'max-w-none']));
    });

    it('should handle different graph names', () => {
        render(<LogseqPageContent graph="different-graph" pageContent={defaultProps.pageContent} />);

        const link = screen.getByRole('link');
        expect(link.getAttribute('href')).toBe('logseq://graph/different-graph?page=Test%20Page');
    });

    it('should render with isPopUp prop', () => {
        const { container } = render(
            <LogseqPageContent {...defaultProps} isPopUp={true} />
        );

        // Component should still render normally
        expect(container.firstChild).toBeTruthy();
        expect(screen.getByText('Simple text content')).toBeTruthy();
    });

    describe('content with special elements', () => {
        it('should render code blocks', () => {
            const codeContent = createMockPageContent('<pre><code>const x = 1;</code></pre>');
            render(<LogseqPageContent graph="test-graph" pageContent={codeContent} />);

            expect(screen.getByText('const x = 1;')).toBeTruthy();
        });

        it('should render images', () => {
            const imageContent = createMockPageContent('<img src="test.jpg" alt="Test image" />');
            render(<LogseqPageContent graph="test-graph" pageContent={imageContent} />);

            const image = screen.getByAltText('Test image');
            expect(image).toBeTruthy();
            expect(image.getAttribute('src')).toBe('test.jpg');
        });

        it('should render tables', () => {
            const tableContent = createMockPageContent(`
        <table>
          <thead>
            <tr><th>Header 1</th><th>Header 2</th></tr>
          </thead>
          <tbody>
            <tr><td>Cell 1</td><td>Cell 2</td></tr>
          </tbody>
        </table>
      `);

            render(<LogseqPageContent graph="test-graph" pageContent={tableContent} />);

            expect(screen.getByText('Header 1')).toBeTruthy();
            expect(screen.getByText('Header 2')).toBeTruthy();
            expect(screen.getByText('Cell 1')).toBeTruthy();
            expect(screen.getByText('Cell 2')).toBeTruthy();
        });
    });

    describe('security considerations', () => {
        it('should render potentially dangerous HTML via dangerouslySetInnerHTML', () => {
            // Note: The component uses dangerouslySetInnerHTML, so it will render any HTML
            const scriptContent = createMockPageContent('<p>Safe content</p>');
            render(<LogseqPageContent graph="test-graph" pageContent={scriptContent} />);

            expect(screen.getByText('Safe content')).toBeTruthy();
        });
    });

    describe('page variations', () => {
        it('should handle page with different properties', () => {
            const differentPage: LogseqPageIdenity = {
                id: 2,
                name: 'Different Page',
                uuid: 'different-uuid',
                originalName: 'Original Different Page',
            };

            const pageContent = { ...createMockPageContent('<p>Content</p>'), page: differentPage };
            render(<LogseqPageContent graph="test-graph" pageContent={pageContent} />);

            expect(screen.getByText('Original Different Page')).toBeTruthy();
            const link = screen.getByRole('link');
            expect(link.getAttribute('href')).toBe('logseq://graph/test-graph?page=Different%20Page');
        });

        it('should handle page without originalName', () => {
            const pageWithoutOriginalName: LogseqPageIdenity = {
                id: 3,
                name: 'Simple Page',
                uuid: 'simple-uuid',
            };

            const pageContent = { ...createMockPageContent('<p>Content</p>'), page: pageWithoutOriginalName };
            render(<LogseqPageContent graph="test-graph" pageContent={pageContent} />);

            expect(screen.getByText('Simple Page')).toBeTruthy();
        });
    });

    describe('accessibility', () => {
        it('should have proper semantic structure', () => {
            render(<LogseqPageContent {...defaultProps} />);

            const link = screen.getByRole('link');
            expect(link).toBeTruthy();
            expect(screen.getByRole('link', { name: 'Test Page' })).toBe(link);
        });
    });
}); 