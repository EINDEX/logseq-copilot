// External links enhancement for Logseq Copilot documentation
// Automatically opens external links in new tabs and adds proper attributes

(function () {
    'use strict';

    // Function to check if a URL is external
    function isExternalLink(url) {
        try {
            const link = new URL(url, window.location.href);
            return link.hostname !== window.location.hostname;
        } catch (e) {
            // If URL parsing fails, assume it's not external
            return false;
        }
    }

    // Function to enhance external links
    function enhanceExternalLinks() {
        // Get all links in the document
        const links = document.querySelectorAll('a[href]');

        links.forEach(link => {
            const href = link.getAttribute('href');

            // Skip if href is empty, starts with #, javascript:, mailto:, or tel:
            if (!href ||
                href.startsWith('#') ||
                href.startsWith('javascript:') ||
                href.startsWith('mailto:') ||
                href.startsWith('tel:') ||
                href.startsWith('/')) {
                return;
            }

            // Check if it's an external link
            if (isExternalLink(href)) {
                // Add target="_blank" and security attributes
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');

                // Add a data attribute to identify external links
                link.setAttribute('data-external-link', 'true');

                // Add simple title attribute if not present
                if (!link.hasAttribute('title')) {
                    const hostname = new URL(href, window.location.href).hostname;
                    link.setAttribute('title', `外部链接: ${hostname}`);
                }
            }
        });
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhanceExternalLinks);
    } else {
        enhanceExternalLinks();
    }

    // Re-run when content changes (for dynamic content)
    const observer = new MutationObserver((mutations) => {
        let shouldRerun = false;

        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Check if any added nodes contain links
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.tagName === 'A' || node.querySelectorAll('a').length > 0) {
                            shouldRerun = true;
                        }
                    }
                });
            }
        });

        if (shouldRerun) {
            enhanceExternalLinks();
        }
    });

    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})(); 