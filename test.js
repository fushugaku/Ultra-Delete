"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mdParser = void 0;
const marked_1 = require("marked");
class MarkdownToJsonParser {
    constructor() {
        this.setupMarked();
    }
    setupMarked() {
        // Custom extension for YAML frontmatter
        const frontmatterExtension = {
            name: 'frontmatter',
            level: 'block',
            start: (src) => src.match(/^---\s*$/)?.index,
            tokenizer: (src) => {
                const match = src.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
                if (!match)
                    return;
                return {
                    type: 'frontmatter',
                    raw: match[0],
                    content: match[1].trim()
                };
            },
            renderer: () => ''
        };
        // Custom extension for HTML inline elements (bold, italic, br)
        const htmlInlineExtension = {
            name: 'htmlInline',
            level: 'inline',
            start: (src) => src.match(/<(b|strong|i|em|br)[\s>]/)?.index,
            tokenizer: (src) => {
                // Handle self-closing br tags
                const brMatch = src.match(/^<br\s*\/?>/i);
                if (brMatch) {
                    return {
                        type: 'htmlInline',
                        raw: brMatch[0],
                        tag: 'br',
                        attributes: {},
                        content: '',
                        selfClosing: true
                    };
                }
                // Handle bold and italic tags
                const inlineMatch = src.match(/^<(b|strong|i|em)([^>]*?)>([\s\S]*?)<\/\1>/i);
                if (inlineMatch) {
                    const tag = inlineMatch[1].toLowerCase();
                    const attributesStr = inlineMatch[2] || '';
                    const content = inlineMatch[3] || '';
                    return {
                        type: 'htmlInline',
                        raw: inlineMatch[0],
                        tag,
                        attributes: this.parseHtmlAttributes(attributesStr),
                        content: content.trim(),
                        selfClosing: false
                    };
                }
                return;
            },
            renderer: (token) => {
                if (token.selfClosing) {
                    return '<br>';
                }
                return `<${token.tag}>${token.content}</${token.tag}>`;
            }
        };
        // Custom extension for HTML lists
        const htmlListExtension = {
            name: 'htmlList',
            level: 'block',
            start: (src) => src.match(/^<(ul|ol)[\s>]/)?.index,
            tokenizer: (src) => {
                const listMatch = src.match(/^(<(ul|ol)[^>]*>[\s\S]*?<\/\2>)/i);
                if (!listMatch)
                    return;
                const listHtml = listMatch[1];
                const listType = listMatch[2].toLowerCase();
                const parsedList = this.parseHtmlList(listHtml, listType);
                return {
                    type: 'htmlList',
                    raw: listMatch[0],
                    html: listHtml,
                    listType,
                    ...parsedList
                };
            },
            renderer: (token) => token.html
        };
        // Custom extension for HTML tables
        const htmlTableExtension = {
            name: 'htmlTable',
            level: 'block',
            start: (src) => src.match(/^<table[\s>]/)?.index,
            tokenizer: (src) => {
                const tableMatch = src.match(/^(<table[\s\S]*?<\/table>)/i);
                if (!tableMatch)
                    return;
                const tableHtml = tableMatch[1];
                const parsedTable = this.parseHtmlTable(tableHtml);
                return {
                    type: 'htmlTable',
                    raw: tableMatch[0],
                    html: tableHtml,
                    ...parsedTable
                };
            },
            renderer: (token) => token.html
        };
        // Enhanced custom component extension with proper nesting support
        const customComponentExtension = {
            name: 'customComponent',
            level: 'block',
            start: (src) => {
                const match = src.match(/^\{\{[<%]\s*[\w-]+/);
                return match?.index;
            },
            tokenizer: function (src) {
                const openMatch = src.match(/^\{\{([<%])\s*([\w-]+)([^>%]*?)([>%])\}\}/);
                if (!openMatch)
                    return;
                const bracketType = openMatch[1];
                const componentName = openMatch[2];
                const closeBracket = openMatch[4];
                const attributesStr = openMatch[3];
                // Validate bracket matching
                if ((bracketType === '<' && closeBracket !== '>') ||
                    (bracketType === '%' && closeBracket !== '%')) {
                    return;
                }
                const attributes = this.parser.parseAttributes(attributesStr);
                // Look for closing tag with proper nesting support
                const content = this.parser.extractComponentContent(src, openMatch, componentName, bracketType);
                if (content === null) {
                    // Self-closing component or malformed
                    return {
                        type: 'customComponent',
                        raw: openMatch[0],
                        componentName,
                        attributes,
                        content: '',
                        selfClosing: true,
                        syntax: bracketType === '<' ? 'angle' : 'percent'
                    };
                }
                return {
                    type: 'customComponent',
                    raw: content.raw,
                    componentName,
                    attributes,
                    content: content.content,
                    selfClosing: false,
                    syntax: bracketType === '<' ? 'angle' : 'percent'
                };
            },
            renderer: (token) => `<div data-component="${token.componentName}" data-syntax="${token.syntax}">${token.content}</div>`
        };
        marked_1.marked.use({
            extensions: [
                frontmatterExtension,
                htmlInlineExtension,
                htmlListExtension,
                htmlTableExtension,
                customComponentExtension
            ],
            gfm: true,
            breaks: false
        });
    }
    extractComponentContent(src, openMatch, componentName, bracketType) {
        const closeBracket = bracketType === '<' ? '>' : '%';
        // Build the closing tag pattern
        const closeTagPattern = `\\{\\{${bracketType}\\s*\\/\\s*${componentName}\\s*${closeBracket}\\}\\}`;
        const openTagPattern = `\\{\\{${bracketType}\\s*${componentName}(?:\\s[^${closeBracket}]*)?\\s*${closeBracket}\\}\\}`;
        let pos = openMatch[0].length;
        let depth = 1;
        let searchPos = pos;
        while (depth > 0 && searchPos < src.length) {
            const remainingText = src.slice(searchPos);
            // Find next opening tag
            const nextOpenMatch = remainingText.match(new RegExp(openTagPattern, 'i'));
            const nextOpenPos = nextOpenMatch ? searchPos + nextOpenMatch.index : Infinity;
            // Find next closing tag
            const nextCloseMatch = remainingText.match(new RegExp(closeTagPattern, 'i'));
            const nextClosePos = nextCloseMatch ? searchPos + nextCloseMatch.index : -1;
            if (nextClosePos === -1) {
                // No closing tag found
                return null;
            }
            if (nextClosePos < nextOpenPos) {
                // Closing tag comes before opening tag
                depth--;
                if (depth === 0) {
                    // Found our matching closing tag
                    const content = src.slice(pos, nextClosePos).trim();
                    const endPos = nextClosePos + nextCloseMatch[0].length;
                    return {
                        content,
                        raw: src.slice(0, endPos)
                    };
                }
                searchPos = nextClosePos + nextCloseMatch[0].length;
            }
            else {
                // Opening tag comes before closing tag (nested component)
                depth++;
                searchPos = nextOpenPos + nextOpenMatch[0].length;
            }
        }
        return null;
    }
    parseComponentContent(content) {
        if (!content || !content.trim())
            return [];
        try {
            // Clean the content and parse it as markdown
            const cleanedContent = content.trim();
            const tokens = marked_1.marked.lexer(cleanedContent);
            return this.convertTokens(tokens);
        }
        catch (error) {
            console.warn('Error parsing component content:', error);
            return [{
                    type: 'text',
                    text: content
                }];
        }
    }
    parseHtmlList(html, listType) {
        try {
            const result = {
                attributes: {},
                ordered: listType === 'ol',
                items: []
            };
            // Extract list attributes
            const listMatch = html.match(/<(ul|ol)([^>]*)>/i);
            if (listMatch && listMatch[2]) {
                result.attributes = this.parseHtmlAttributes(listMatch[2]);
            }
            // Extract list items
            result.items = this.extractListItems(html);
            return result;
        }
        catch (error) {
            console.warn('Error parsing HTML list:', error);
            return { attributes: {}, ordered: listType === 'ol', items: [] };
        }
    }
    extractListItems(html) {
        const items = [];
        const itemRegex = /<li([^>]*?)>([\s\S]*?)<\/li>/gi;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(html)) !== null) {
            try {
                const attrsString = itemMatch[1] || '';
                const content = itemMatch[2] || '';
                const attributes = this.parseHtmlAttributes(attrsString);
                const text = this.extractTextContent(content);
                // Check for nested lists
                const nestedLists = this.extractNestedLists(content);
                // Parse the content to handle inline HTML elements
                const parsedContent = this.parseInlineContent(content);
                items.push({
                    text,
                    html: content.trim(),
                    attributes,
                    children: parsedContent,
                    nestedLists
                });
            }
            catch (error) {
                console.warn('Error parsing list item:', error);
            }
        }
        return items;
    }
    parseInlineContent(content) {
        try {
            // Remove nested lists to avoid double parsing
            const contentWithoutLists = content.replace(/<(ul|ol)[^>]*>[\s\S]*?<\/\1>/gi, '');
            // Parse as markdown to handle inline elements
            const tokens = marked_1.marked.lexer(contentWithoutLists);
            return this.convertTokens(tokens);
        }
        catch (error) {
            console.warn('Error parsing inline content:', error);
            return [];
        }
    }
    extractNestedLists(content) {
        const nestedLists = [];
        const listRegex = /<(ul|ol)[^>]*>[\s\S]*?<\/\1>/gi;
        let listMatch;
        while ((listMatch = listRegex.exec(content)) !== null) {
            try {
                const listHtml = listMatch[0];
                const listType = listMatch[1].toLowerCase();
                const parsedList = this.parseHtmlList(listHtml, listType);
                nestedLists.push({
                    type: 'htmlList',
                    html: listHtml,
                    listType,
                    ...parsedList
                });
            }
            catch (error) {
                console.warn('Error parsing nested list:', error);
            }
        }
        return nestedLists;
    }
    extractTextContent(html) {
        if (!html)
            return '';
        // Remove nested lists and HTML tags for clean text extraction
        const cleanHtml = html
            .replace(/<(ul|ol)[^>]*>[\s\S]*?<\/\1>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return cleanHtml;
    }
    parseHtmlTable(html) {
        try {
            const result = {
                attributes: {},
                header: [],
                rows: []
            };
            // Extract table attributes
            const tableMatch = html.match(/<table([^>]*)>/i);
            if (tableMatch && tableMatch[1]) {
                result.attributes = this.parseHtmlAttributes(tableMatch[1]);
            }
            // Extract thead content
            const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
            if (theadMatch && theadMatch[1]) {
                result.header = this.extractTableRows(theadMatch[1], true);
            }
            // Extract tbody content or all rows if no tbody
            const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
            const rowsContent = tbodyMatch ? tbodyMatch[1] : html;
            const allRows = this.extractTableRows(rowsContent, false);
            if (theadMatch) {
                result.rows = allRows;
            }
            else {
                const firstRowHasTh = allRows.length > 0 &&
                    allRows[0].cells.some(cell => cell.tag === 'th');
                if (firstRowHasTh) {
                    result.header = [allRows[0].cells];
                    result.rows = allRows.slice(1);
                }
                else {
                    result.rows = allRows;
                }
            }
            return result;
        }
        catch (error) {
            console.warn('Error parsing HTML table:', error);
            return { attributes: {}, header: [], rows: [] };
        }
    }
    extractTableRows(html, isHeader = false) {
        const rows = [];
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(html)) !== null) {
            try {
                const rowContent = rowMatch[1];
                const rowAttrsMatch = rowMatch[0].match(/<tr([^>]*)/i);
                const rowAttributes = rowAttrsMatch && rowAttrsMatch[1] ?
                    this.parseHtmlAttributes(rowAttrsMatch[1]) : {};
                const cells = this.extractTableCells(rowContent);
                if (cells.length > 0) {
                    if (isHeader) {
                        rows.push(cells);
                    }
                    else {
                        rows.push({
                            cells,
                            attributes: rowAttributes
                        });
                    }
                }
            }
            catch (error) {
                console.warn('Error parsing table row:', error);
            }
        }
        return rows;
    }
    extractTableCells(html) {
        const cells = [];
        const cellRegex = /<(td|th)([^>]*?)>([\s\S]*?)<\/\1>/gi;
        let cellMatch;
        while ((cellMatch = cellRegex.exec(html)) !== null) {
            try {
                const tag = cellMatch[1] ? cellMatch[1].toLowerCase() : 'td';
                const attrsString = cellMatch[2] || '';
                const content = cellMatch[3] || '';
                const attributes = this.parseHtmlAttributes(attrsString);
                const text = this.extractTextContent(content);
                // Parse cell content for inline HTML elements
                const parsedContent = this.parseInlineContent(content);
                cells.push({
                    text,
                    html: content.trim(),
                    attributes,
                    tag,
                    children: parsedContent
                });
            }
            catch (error) {
                console.warn('Error parsing table cell:', error);
            }
        }
        return cells;
    }
    parseHtmlAttributes(attrString) {
        const attributes = {};
        if (!attrString || typeof attrString !== 'string')
            return attributes;
        try {
            // Handle attributes with values
            const attrWithValueRegex = /(\w+(?:-\w+)*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
            let match;
            while ((match = attrWithValueRegex.exec(attrString)) !== null) {
                const key = match[1];
                const value = match[2] || match[3] || match[4] || '';
                attributes[key] = value;
            }
            // Handle boolean attributes (attributes without values)
            const cleanedString = attrString.replace(attrWithValueRegex, '');
            const booleanAttrRegex = /(\w+(?:-\w+)*)/g;
            while ((match = booleanAttrRegex.exec(cleanedString)) !== null) {
                const key = match[1];
                if (!attributes.hasOwnProperty(key)) {
                    attributes[key] = true;
                }
            }
        }
        catch (error) {
            console.warn('Error parsing HTML attributes:', error);
        }
        return attributes;
    }
    parseAttributes(attrString) {
        const attributes = {};
        if (!attrString?.trim())
            return attributes;
        try {
            const trimmed = attrString.trim();
            // Handle direct quoted parameter
            const directQuotedMatch = trimmed.match(/^"([^"]*)"$/);
            if (directQuotedMatch) {
                attributes.text = directQuotedMatch[1];
                return attributes;
            }
            const directSingleQuotedMatch = trimmed.match(/^'([^']*)'$/);
            if (directSingleQuotedMatch) {
                attributes.text = directSingleQuotedMatch[1];
                return attributes;
            }
            const directUnquotedMatch = trimmed.match(/^([^\s=]+)$/);
            if (directUnquotedMatch && !directUnquotedMatch[1].includes('=')) {
                attributes.text = directUnquotedMatch[1];
                return attributes;
            }
            // Parse key="value" patterns
            const attrRegex = /([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
            let match;
            let hasKeyValuePairs = false;
            while ((match = attrRegex.exec(trimmed)) !== null) {
                attributes[match[1]] = match[2] || match[3] || match[4];
                hasKeyValuePairs = true;
            }
            if (hasKeyValuePairs) {
                const withoutKeyValue = trimmed.replace(attrRegex, '').trim();
                const quotedStringMatch = withoutKeyValue.match(/"([^"]*)"|'([^']*)'/);
                if (quotedStringMatch && !attributes.text) {
                    attributes.text = quotedStringMatch[1] || quotedStringMatch[2];
                }
            }
            if (!attributes.text && !hasKeyValuePairs) {
                const boolRegex = /([\w-]+)(?=\s|$)/g;
                const withoutPairs = trimmed.replace(attrRegex, '');
                while ((match = boolRegex.exec(withoutPairs)) !== null) {
                    if (!attributes[match[1]]) {
                        attributes[match[1]] = true;
                    }
                }
            }
        }
        catch (error) {
            console.warn('Error parsing attributes:', error);
        }
        return attributes;
    }
    parse(markdown) {
        try {
            const cleanedMarkdown = this.cleanMalformedShortcodes(markdown);
            const tokens = marked_1.marked.lexer(cleanedMarkdown);
            return {
                type: 'document',
                children: this.convertTokens(tokens)
            };
        }
        catch (error) {
            console.error('Error parsing markdown:', error);
            return {
                type: 'document',
                children: [],
                error: error.message
            };
        }
    }
    cleanMalformedShortcodes(markdown) {
        if (!markdown || typeof markdown !== 'string')
            return '';
        return markdown
            .replace(/\{\{%\s*\/[\w-]+\s*%\}\}/g, '')
            .replace(/\{\{<\s*\/[\w-]+\s*>\}\}/g, '');
    }
    convertTokens(tokens) {
        if (!Array.isArray(tokens))
            return [];
        return tokens.map(token => this.convertToken(token)).filter(Boolean);
    }
    convertToken(token) {
        if (!token || typeof token !== 'object')
            return null;
        const base = { type: token.type };
        try {
            switch (token.type) {
                case 'frontmatter':
                    return {
                        ...base,
                        content: token.content || '',
                        parsed: this.parseFrontmatter(token.content || '')
                    };
                case 'htmlInline':
                    return {
                        ...base,
                        tag: token.tag || '',
                        attributes: token.attributes || {},
                        content: token.content || '',
                        selfClosing: !!token.selfClosing,
                        // For inline HTML, just use the text content, don't parse as markdown
                        children: token.content && !token.selfClosing ? [{
                                type: 'text',
                                text: token.content
                            }] : []
                    };
                case 'htmlList':
                    return {
                        ...base,
                        html: token.html || '',
                        listType: token.listType || 'ul',
                        ordered: !!token.ordered,
                        attributes: token.attributes || {},
                        items: token.items || []
                    };
                case 'htmlTable':
                    return {
                        ...base,
                        html: token.html || '',
                        attributes: token.attributes || {},
                        header: token.header || [],
                        rows: token.rows || []
                    };
                case 'heading':
                    return {
                        ...base,
                        level: token.depth || 1,
                        text: token.text || '',
                        children: token.tokens ? this.convertTokens(token.tokens) : []
                    };
                case 'paragraph':
                    return {
                        ...base,
                        text: token.text || '',
                        children: token.tokens ? this.convertTokens(token.tokens) : []
                    };
                case 'text':
                    return { ...base, text: token.text || '' };
                case 'strong':
                case 'em':
                case 'del':
                    return {
                        ...base,
                        text: token.text || '',
                        children: token.tokens ? this.convertTokens(token.tokens) : []
                    };
                case 'code':
                    return token.lang ?
                        { ...base, lang: token.lang, text: token.text || '' } :
                        { ...base, text: token.text || '' };
                case 'link':
                    return {
                        ...base,
                        href: token.href || '',
                        title: token.title || null,
                        text: token.text || '',
                        children: token.tokens ? this.convertTokens(token.tokens) : []
                    };
                case 'image':
                    return {
                        ...base,
                        src: token.href || '',
                        alt: token.text || '',
                        title: token.title || null
                    };
                case 'list':
                    return {
                        ...base,
                        ordered: !!token.ordered,
                        children: Array.isArray(token.items) ? token.items.map(item => this.convertToken(item)) : []
                    };
                case 'list_item':
                    return {
                        ...base,
                        task: !!token.task,
                        checked: !!token.checked,
                        children: token.tokens ? this.convertTokens(token.tokens) : []
                    };
                case 'blockquote':
                    return {
                        ...base,
                        children: token.tokens ? this.convertTokens(token.tokens) : []
                    };
                case 'table':
                    return {
                        ...base,
                        header: Array.isArray(token.header) ? token.header.map(cell => ({
                            text: cell.text || '',
                            children: cell.tokens ? this.convertTokens(cell.tokens) : []
                        })) : [],
                        rows: Array.isArray(token.rows) ? token.rows.map(row => Array.isArray(row) ? row.map(cell => ({
                            text: cell.text || '',
                            children: cell.tokens ? this.convertTokens(cell.tokens) : []
                        })) : []) : []
                    };
                case 'hr':
                    return base;
                case 'html':
                    return {
                        ...base,
                        text: token.text || '',
                        children: []
                    };
                case 'customComponent':
                    return {
                        ...base,
                        componentName: token.componentName || '',
                        attributes: token.attributes || {},
                        content: token.content || '',
                        selfClosing: !!token.selfClosing,
                        syntax: token.syntax || 'angle',
                        // Use the parseComponentContent method for proper nested parsing
                        children: token.content ? this.parseComponentContent(token.content) : []
                    };
                case 'space':
                    return null;
                default:
                    return {
                        ...base,
                        text: token.text || '',
                        children: token.tokens ? this.convertTokens(token.tokens) : []
                    };
            }
        }
        catch (error) {
            console.warn(`Error converting token of type ${token.type}:`, error);
            return {
                type: 'error',
                originalType: token.type,
                error: error.message,
                text: token.text || ''
            };
        }
    }
    parseFrontmatter(content) {
        const result = {};
        if (!content || typeof content !== 'string')
            return result;
        try {
            const lines = content.split('\n');
            for (const line of lines) {
                const match = line.match(/^(\w+):\s*(.+)$/);
                if (match && match[1] && match[2]) {
                    const key = match[1];
                    let value = match[2].trim();
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    result[key] = value;
                }
            }
        }
        catch (error) {
            console.warn('Error parsing frontmatter:', error);
        }
        return result;
    }
}
// Example usage
exports.mdParser = new MarkdownToJsonParser();
const fs = require('fs');
const path = require('path');
function runTests() {
    const parser = new MarkdownToJsonParser();
    console.log('Running MarkdownToJsonParser Tests...\n');
    // Helper function to write test output to file
    function writeTestOutput(testName, input, output) {
        const testResult = {
            testName,
            input,
            output,
            timestamp: new Date().toISOString()
        };
        const filename = `test_${testName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}.json`;
        const filepath = path.join('./test_outputs', filename);
        // Ensure directory exists
        if (!fs.existsSync('./test_outputs')) {
            fs.mkdirSync('./test_outputs', { recursive: true });
        }
        fs.writeFileSync(filepath, JSON.stringify(testResult, null, 2));
        console.log(`✓ ${testName} - Output written to ${filename}`);
    }
    // Test 1: Basic Markdown
    const basicMarkdown = `# Hello World
This is a **bold** text and *italic* text.

## Subheading
A paragraph with a [link](https://example.com).`;
    writeTestOutput('Basic Markdown', basicMarkdown, parser.parse(basicMarkdown));
    // Test 2: YAML Frontmatter
    const frontmatterMarkdown = `---
title: My Post
author: John Doe
date: 2023-01-01
---

# Content
This is the content.`;
    writeTestOutput('YAML Frontmatter', frontmatterMarkdown, parser.parse(frontmatterMarkdown));
    // Test 3: HTML Inline Elements
    const htmlInlineMarkdown = `This is <b>bold</b> and <i>italic</i> text.
Line break here:<br>
More text with <strong>strong</strong> and <em>emphasis</em>.`;
    writeTestOutput('HTML Inline Elements', htmlInlineMarkdown, parser.parse(htmlInlineMarkdown));
    // Test 4: HTML Lists
    const htmlListMarkdown = `<ul class="my-list">
  <li>First item</li>
  <li>Second item with <b>bold</b> text</li>
  <li>Third item
    <ul>
      <li>Nested item 1</li>
      <li>Nested item 2</li>
    </ul>
  </li>
</ul>`;
    writeTestOutput('HTML Lists', htmlListMarkdown, parser.parse(htmlListMarkdown));
    // Test 5: HTML Tables
    const htmlTableMarkdown = `<table class="data-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Age</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>John</td>
      <td>25</td>
    </tr>
    <tr>
      <td>Jane</td>
      <td>30</td>
    </tr>
  </tbody>
</table>`;
    writeTestOutput('HTML Tables', htmlTableMarkdown, parser.parse(htmlTableMarkdown));
    // Test 6: Custom Components - Angle Syntax
    const customComponentAngle = `{{< alert type="warning" >}}
This is a **warning** message with markdown content.
{{< /alert >}}`;
    writeTestOutput('Custom Components Angle Syntax', customComponentAngle, parser.parse(customComponentAngle));
    // Test 7: Custom Components - Percent Syntax
    const customComponentPercent = `{{% note "Important" %}}
This is an important note.
{{% /note %}}`;
    writeTestOutput('Custom Components Percent Syntax', customComponentPercent, parser.parse(customComponentPercent));
    // Test 8: Self-closing Custom Components
    const selfClosingComponent = `{{< image src="photo.jpg" alt="My Photo" >}}`;
    writeTestOutput('Self-closing Custom Components', selfClosingComponent, parser.parse(selfClosingComponent));
    // Test 9: Nested Custom Components
    const nestedComponents = `{{< card title="Main Card" >}}
Content in main card.
{{< alert type="info" >}}
Nested alert inside card.
{{< /alert >}}
More content.
{{< /card >}}`;
    writeTestOutput('Nested Custom Components', nestedComponents, parser.parse(nestedComponents));
    // Test 10: Mixed Content
    const mixedContent = `---
title: Mixed Content Example
---

# Main Title

This paragraph has **bold** and *italic* text.

{{< callout type="info" >}}
This is a callout with a [link](https://example.com).
{{< /callout >}}

<ul>
  <li>HTML list item</li>
  <li>Another item</li>
</ul>

## Code Example

\`\`\`javascript
console.log("Hello World");
\`\`\``;
    writeTestOutput('Mixed Content', mixedContent, parser.parse(mixedContent));
    // Test 11: Edge Cases - Empty input
    writeTestOutput('Edge Cases Empty Input', '', parser.parse(''));
    // Test 11b: Edge Cases - Malformed components
    const malformedComponents = `{{< unclosed component
{{% malformed %}}
{{< /orphaned >}}`;
    writeTestOutput('Edge Cases Malformed Components', malformedComponents, parser.parse(malformedComponents));
    // Test 11c: Edge Cases - Complex attributes
    const complexAttributes = `{{< component key1="value1" key2='value2' boolean-flag data-test="complex value" >}}
Content here
{{< /component >}}`;
    writeTestOutput('Edge Cases Complex Attributes', complexAttributes, parser.parse(complexAttributes));
    // Test 12: Simple Tabs
    const simpleTabsMarkdown = `{{< tabs >}}
{{< tab "JavaScript" >}}
\`\`\`javascript
console.log("Hello from JavaScript!");
\`\`\`
{{< /tab >}}

{{< tab "Python" >}}
\`\`\`python
print("Hello from Python!")
\`\`\`
{{< /tab >}}

{{< tab "HTML" >}}
\`\`\`html
<h1>Hello from HTML!</h1>
\`\`\`
{{< /tab >}}
{{< /tabs >}}`;
    writeTestOutput('Simple Tabs', simpleTabsMarkdown, parser.parse(simpleTabsMarkdown));
    // Test 13: Complex Tabs with Attributes
    const complexTabsMarkdown = `{{< tabs class="code-tabs" default="js" >}}
{{< tab "js" title="JavaScript" icon="js-icon" >}}
# JavaScript Example

This tab contains **markdown content** and code:

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));
\`\`\`

> **Note**: JavaScript is a versatile programming language.

- Dynamic typing
- Prototype-based OOP
- First-class functions
{{< /tab >}}

{{< tab "py" title="Python" icon="python-icon" >}}
# Python Example

Python is known for its *clean syntax*:

\`\`\`python
def greet(name):
    return f"Hello, {name}!"

print(greet("World"))
\`\`\`

{{< alert type="info" >}}
Python emphasizes code readability!
{{< /alert >}}

1. Simple syntax
2. Rich standard library
3. Great for data science
{{< /tab >}}

{{< tab "html" title="HTML/CSS" icon="web-icon" >}}
# Web Technologies

HTML structure with CSS styling:

\`\`\`html
<!DOCTYPE html>
<html>
<head>
    <title>Hello World</title>
    <style>
        .greeting { color: blue; }
    </style>
</head>
<body>
    <h1 class="greeting">Hello, World!</h1>
</body>
</html>
\`\`\`

<ul>
  <li>Semantic HTML</li>
  <li>Responsive CSS</li>
  <li>Modern JavaScript</li>
</ul>
{{< /tab >}}
{{< /tabs >}}`;
    writeTestOutput('Complex Tabs with Attributes', complexTabsMarkdown, parser.parse(complexTabsMarkdown));
    // Test 14: Nested Tabs
    const nestedTabsMarkdown = `{{< tabs class="main-tabs" >}}
{{< tab "frontend" title="Frontend" >}}
# Frontend Development

{{< tabs class="frontend-tabs" >}}
{{< tab "react" title="React" >}}
## React Framework

\`\`\`jsx
function App() {
  return <h1>Hello React!</h1>;
}
\`\`\`
{{< /tab >}}

{{< tab "vue" title="Vue.js" >}}
## Vue.js Framework

\`\`\`vue
<template>
  <h1>Hello Vue!</h1>
</template>
\`\`\`
{{< /tab >}}
{{< /tabs >}}
{{< /tab >}}

{{< tab "backend" title="Backend" >}}
# Backend Development

Choose your backend technology:

{{< tabs class="backend-tabs" >}}
{{< tab "node" title="Node.js" >}}
\`\`\`javascript
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello from Node.js!');
});
\`\`\`
{{< /tab >}}

{{< tab "django" title="Django" >}}
\`\`\`python
from django.http import HttpResponse

def hello(request):
    return HttpResponse("Hello from Django!")
\`\`\`
{{< /tab >}}
{{< /tabs >}}
{{< /tab >}}
{{< /tabs >}}`;
    writeTestOutput('Nested Tabs', nestedTabsMarkdown, parser.parse(nestedTabsMarkdown));
    // Test 15: Tabs with Percent Syntax
    const percentTabsMarkdown = `{{% tabs class="percent-tabs" %}}
{{% tab "config" title="Configuration" %}}
# Configuration File

\`\`\`yaml
server:
  port: 3000
  host: localhost

database:
  type: postgres
  host: localhost
  port: 5432
\`\`\`
{{% /tab %}}

{{% tab "env" title="Environment" %}}
# Environment Variables

\`\`\`bash
export NODE_ENV=production
export DATABASE_URL=postgres://user:pass@localhost/db
export PORT=3000
\`\`\`
{{% /tab %}}
{{% /tabs %}}`;
    writeTestOutput('Tabs with Percent Syntax', percentTabsMarkdown, parser.parse(percentTabsMarkdown));
    // Test 16: Mixed Syntax Tabs
    const mixedSyntaxTabsMarkdown = `{{< tabs >}}
{{< tab "mixed1" >}}
Content in angle bracket tab.
{{< /tab >}}

{{% tab "mixed2" %}}
Content in percent tab.
{{% /tab %}}
{{< /tabs >}}`;
    writeTestOutput('Mixed Syntax Tabs', mixedSyntaxTabsMarkdown, parser.parse(mixedSyntaxTabsMarkdown));
    // Test 17: Empty Tabs
    const emptyTabsMarkdown = `{{< tabs >}}
{{< tab "empty1" >}}
{{< /tab >}}

{{< tab "empty2" >}}


{{< /tab >}}

{{< tab "content" >}}
Only this tab has content.
{{< /tab >}}
{{< /tabs >}}`;
    writeTestOutput('Empty Tabs', emptyTabsMarkdown, parser.parse(emptyTabsMarkdown));
    // Test 18: Tabs with HTML Content
    const htmlTabsMarkdown = `{{< tabs >}}
{{< tab "table" title="Data Table" >}}
<table class="data-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Role</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>John Doe</td>
      <td>Developer</td>
    </tr>
    <tr>
      <td>Jane Smith</td>
      <td>Designer</td>
    </tr>
  </tbody>
</table>
{{< /tab >}}

{{< tab "list" title="Feature List" >}}
<ul class="feature-list">
  <li>Fast performance</li>
  <li>Easy to use</li>
  <li>Highly customizable</li>
</ul>
{{< /tab >}}
{{< /tabs >}}`;
    writeTestOutput('Tabs with HTML Content', htmlTabsMarkdown, parser.parse(htmlTabsMarkdown));
    // Test 19: Malformed Tabs
    const malformedTabsMarkdown = `{{< tabs >}}
{{< tab "unclosed" >}}
This tab is never closed...

{{< tab "another" >}}
This tab is properly closed.
{{< /tab >}}
{{< /tabs >}}`;
    writeTestOutput('Malformed Tabs', malformedTabsMarkdown, parser.parse(malformedTabsMarkdown));
    // Test 20: Tabs with Special Characters
    const specialCharsTabsMarkdown = `{{< tabs >}}
{{< tab "special-chars" title="Special & Characters" data-test="value with spaces" >}}
Content with special characters: & < > " '
{{< /tab >}}
{{< /tabs >}}`;
    writeTestOutput('Tabs with Special Characters', specialCharsTabsMarkdown, parser.parse(specialCharsTabsMarkdown));
    // Test 21: Deeply Nested Tabs
    const deeplyNestedTabsMarkdown = `{{< tabs >}}
{{< tab "level1" >}}
Level 1 content
{{< tabs >}}
{{< tab "level2" >}}
Level 2 content
{{< tabs >}}
{{< tab "level3" >}}
Level 3 content - this is quite deep!
{{< /tab >}}
{{< /tabs >}}
{{< /tab >}}
{{< /tabs >}}
{{< /tab >}}
{{< /tabs >}}`;
    writeTestOutput('Deeply Nested Tabs', deeplyNestedTabsMarkdown, parser.parse(deeplyNestedTabsMarkdown));
    console.log('\n✅ All tests completed! Check the ./test_outputs directory for JSON files.');
}
// Run the tests
runTests();
//# sourceMappingURL=test.js.map