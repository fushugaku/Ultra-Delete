import * as vscode from 'vscode';
import { BaseLanguageHandler, ElementPattern, MultilineStringPattern, ElementType } from './base/baseLanguage';
import { escapeRegExp } from '../utils/helpers';

export class HtmlHandler extends BaseLanguageHandler {
  languageIds = ['html', 'xml', 'jsx', 'tsx', 'javascriptreact', 'typescriptreact', 'vue', 'svelte'];

  getClassPatterns(): ElementPattern[] {
    return [];
  }

  getFunctionPatterns(): ElementPattern[] {
    return [];
  }

  getVariablePatterns(): ElementPattern[] {
    return [];
  }

  getObjectKeyPatterns(): ElementPattern[] {
    return [];
  }

  getClassMemberPatterns(): ElementPattern[] {
    return [];
  }

  getMultilineStringPatterns(): MultilineStringPattern[] {
    return [];
  }

  isHtmlLike(): boolean {
    return true;
  }

  getClassRange(): vscode.Range | null {
    return null;
  }

  getFunctionRange(): vscode.Range | null {
    return null;
  }

  getVariableRange(): vscode.Range | null {
    return null;
  }

  getObjectKeyRange(): vscode.Range | null {
    return null;
  }

  getClassMemberRange(): vscode.Range | null {
    return null;
  }

  getMultilineStringRange(): vscode.Range | null {
    return null;
  }

  getHtmlElementRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string
  ): vscode.Range | null {
    const tagInfo = this.findTagAtPosition(document, position, word);
    if (tagInfo) {
      return this.getCompleteTagRange(document, tagInfo);
    }
    return null;
  }

  private findTagAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string
  ): { tagName: string, startLine: number, startChar: number, isClosing: boolean } | null {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const character = position.character;

    // Check for opening tag
    const openingTagPattern = /<(\w+)([^>]*)>/g;
    let match;

    while ((match = openingTagPattern.exec(lineText)) !== null) {
      const tagName = match[1];
      const tagStart = match.index;
      const tagEnd = match.index + match[0].length;

      if (character >= tagStart && character <= tagEnd && tagName === word) {
        return {
          tagName: tagName,
          startLine: position.line,
          startChar: tagStart,
          isClosing: false
        };
      }
    }

    // Check for closing tag
    const closingTagPattern = /<\/(\w+)>/g;
    while ((match = closingTagPattern.exec(lineText)) !== null) {
      const tagName = match[1];
      const tagStart = match.index;
      const tagEnd = match.index + match[0].length;

      if (character >= tagStart && character <= tagEnd && tagName === word) {
        return {
          tagName: tagName,
          startLine: position.line,
          startChar: tagStart,
          isClosing: true
        };
      }
    }

    // Check for self-closing tag
    const selfClosingTagPattern = /<(\w+)([^>]*)\s*\/>/g;
    while ((match = selfClosingTagPattern.exec(lineText)) !== null) {
      const tagName = match[1];
      const tagStart = match.index;
      const tagEnd = match.index + match[0].length;

      if (character >= tagStart && character <= tagEnd && tagName === word) {
        const startPos = new vscode.Position(position.line, tagStart);
        const endPos = new vscode.Position(position.line, tagEnd);
        return null; // Handle directly as self-closing
      }
    }

    return this.findTagInSurroundingLines(document, position, word);
  }

  private findTagInSurroundingLines(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string
  ): { tagName: string, startLine: number, startChar: number, isClosing: boolean } | null {
    // Search backwards for opening tag
    for (let i = position.line; i >= Math.max(0, position.line - 20); i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      const openingTagPattern = new RegExp(`<(${escapeRegExp(word)})([^>]*)>`, 'g');
      let match;

      while ((match = openingTagPattern.exec(lineText)) !== null) {
        const tagName = match[1];
        const tagStart = match.index;

        const tagRange = this.findTagEndFromStart(document, i, tagStart, tagName);
        if (tagRange && this.isPositionInRange(position, tagRange)) {
          return {
            tagName: tagName,
            startLine: i,
            startChar: tagStart,
            isClosing: false
          };
        }
      }
    }

    return null;
  }

  private findTagEndFromStart(
    document: vscode.TextDocument,
    startLine: number,
    startChar: number,
    tagName: string
  ): vscode.Range | null {
    const startPos = new vscode.Position(startLine, startChar);

    // Check if it's a self-closing tag first
    const startLineText = document.lineAt(startLine).text;
    const tagStartText = startLineText.substring(startChar);
    const selfClosingMatch = tagStartText.match(new RegExp(`<${escapeRegExp(tagName)}[^>]*\\s*\\/>`));

    if (selfClosingMatch) {
      const endPos = new vscode.Position(startLine, startChar + selfClosingMatch[0].length);
      return new vscode.Range(startPos, endPos);
    }

    // Look for closing tag
    const closingTag = `</${tagName}>`;
    let tagDepth = 1;
    let currentLine = startLine;
    let currentChar = startChar;

    // Skip the opening tag
    const openingTagMatch = startLineText.substring(startChar).match(new RegExp(`<${escapeRegExp(tagName)}[^>]*>`));
    if (openingTagMatch) {
      currentChar += openingTagMatch[0].length;
    }

    while (currentLine < document.lineCount) {
      const line = document.lineAt(currentLine);
      const lineText = line.text;
      const searchText = currentLine === startLine ? lineText.substring(currentChar) : lineText;
      const offset = currentLine === startLine ? currentChar : 0;

      const openingPattern = new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^>]*)?>`, 'g');
      const closingPattern = new RegExp(`<\\/${escapeRegExp(tagName)}>`, 'g');

      let match;
      const tags: { type: 'open' | 'close', index: number, length: number }[] = [];

      // Find opening tags
      while ((match = openingPattern.exec(searchText)) !== null) {
        if (!match[0].includes('/>')) {
          tags.push({ type: 'open', index: offset + match.index, length: match[0].length });
        }
      }

      // Find closing tags
      while ((match = closingPattern.exec(searchText)) !== null) {
        tags.push({ type: 'close', index: offset + match.index, length: match[0].length });
      }

      tags.sort((a, b) => a.index - b.index);

      for (const tag of tags) {
        if (tag.type === 'open') {
          tagDepth++;
        } else if (tag.type === 'close') {
          tagDepth--;
          if (tagDepth === 0) {
            const endPos = new vscode.Position(currentLine, tag.index + tag.length);
            return new vscode.Range(startPos, endPos);
          }
        }
      }

      currentLine++;
      currentChar = 0;
    }

    return null;
  }

  private isPositionInRange(position: vscode.Position, range: vscode.Range): boolean {
    return range.contains(position);
  }

  private getCompleteTagRange(
    document: vscode.TextDocument,
    tagInfo: { tagName: string, startLine: number, startChar: number, isClosing: boolean }
  ): vscode.Range | null {
    if (tagInfo.isClosing) {
      return this.findOpeningTagFromClosing(document, tagInfo);
    } else {
      return this.findTagEndFromStart(document, tagInfo.startLine, tagInfo.startChar, tagInfo.tagName);
    }
  }

  private findOpeningTagFromClosing(
    document: vscode.TextDocument,
    tagInfo: { tagName: string, startLine: number, startChar: number, isClosing: boolean }
  ): vscode.Range | null {
    const tagName = tagInfo.tagName;
    let tagDepth = 1;

    for (let i = tagInfo.startLine; i >= 0; i--) {
      const line = document.lineAt(i);
      const lineText = line.text;
      const searchText = i === tagInfo.startLine ? lineText.substring(0, tagInfo.startChar) : lineText;

      const openingPattern = new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^>]*)?>`, 'g');
      const closingPattern = new RegExp(`<\\/${escapeRegExp(tagName)}>`, 'g');

      let match;
      const tags: { type: 'open' | 'close', index: number }[] = [];

      while ((match = openingPattern.exec(searchText)) !== null) {
        if (!match[0].includes('/>')) {
          tags.push({ type: 'open', index: match.index });
        }
      }

      while ((match = closingPattern.exec(searchText)) !== null) {
        tags.push({ type: 'close', index: match.index });
      }

      tags.sort((a, b) => b.index - a.index);

      for (const tag of tags) {
        if (tag.type === 'close') {
          tagDepth++;
        } else if (tag.type === 'open') {
          tagDepth--;
          if (tagDepth === 0) {
            return this.findTagEndFromStart(document, i, tag.index, tagName);
          }
        }
      }
    }

    return null;
  }
}