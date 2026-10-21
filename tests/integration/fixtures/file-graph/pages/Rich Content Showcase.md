- The showcase starts with a long paragraph. Personal knowledge management is less about collecting everything and more about returning to the few ideas that keep coming back: you write a note while reading, link it to an older one, and weeks later a search result reminds you that you already thought about the same question from another angle. This paragraph is intentionally long so that the sidebar has to decide how much of it to show before the reader asks for more, and so that the text keeps wrapping across many lines of a narrow column.
- showcase multi-line block, first line
  second line of the same block
  third line with **bold**, _italic_ and `inline code`
- showcase code sample with a long line
  ```typescript
  export const showcaseEncode = (input: string) => input.split('').map((char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('-'); // this line is much wider than the sidebar
  const short = 1;
  ```
- showcase table of search engines
  | Engine | Mount point | Column width |
  | --- | --- | --- |
  | Google | rhs column | 369px |
  | Bing | b_context list | 432px |
  | DuckDuckGo | .js-react-sidebar | 448px |
- showcase image ![Showcase diagram](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5NjAiIGhlaWdodD0iNTQwIiB2aWV3Qm94PSIwIDAgOTYwIDU0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjODVjOGM4Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMjA2Zjc4Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9Ijk2MCIgaGVpZ2h0PSI1NDAiIGZpbGw9InVybCgjZykiLz48Y2lyY2xlIGN4PSI3NjAiIGN5PSIxNDAiIHI9IjkwIiBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9Ii4yNSIvPjxyZWN0IHg9IjgwIiB5PSIzNjAiIHdpZHRoPSI1MjAiIGhlaWdodD0iNDAiIHJ4PSI4IiBmaWxsPSIjMDAyYjM2IiBmaWxsLW9wYWNpdHk9Ii4zNSIvPjx0ZXh0IHg9IjgwIiB5PSIyMDAiIGZvbnQtZmFtaWx5PSJIZWx2ZXRpY2EsIEFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjcyIiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjZmZmZmZmIj5TaG93Y2FzZSBkaWFncmFtPC90ZXh0Pjx0ZXh0IHg9IjgwIiB5PSIyNzAiIGZvbnQtZmFtaWx5PSJIZWx2ZXRpY2EsIEFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjMyIiBmaWxsPSIjZTZmNGY0Ij45NjAgeCA1NDAsIHdpZGVyIHRoYW4gYW55IHNpZGViYXI8L3RleHQ+PC9zdmc+Cg==)
- showcase local asset image ![screenshot.png](../assets/screenshot_1700000000000_0.png)
- showcase long URL https://example.com/research/2024/a-very-long-path-segment-without-any-natural-break-points/and-another-segment/index.html?utm_source=logseq-sidebar&utm_medium=sidebar&utm_campaign=showcase-overflow
- showcase references [[Another Page]], #reading and #[[Multi Word Tag]]
- Referenced block target, quoted by a block reference
  id:: 65f0c0de-0000-4000-8000-000000000001
- showcase block reference ((65f0c0de-0000-4000-8000-000000000001))
- showcase properties block
  type:: article
  source:: https://example.com/source
- showcase parent block
	- showcase child block one
		- showcase grandchild block
	- showcase child block two
- showcase 中英混排：这是一段很长的中文段落，用来检查侧边栏中的中文能否正常换行，这个插件在搜索结果页旁边显示你的笔记，不应该溢出容器，也不应该被截断。
- TODO showcase task with a long description that should wrap naturally next to the checkbox instead of being squeezed into a narrow column
- DONE showcase finished task
