import * as vscode from 'vscode';
import { BaseLanguageHandler, ElementPattern, MultilineStringPattern, ElementType } from './base/baseLanguage';
import { escapeRegExp } from '../utils/helpers';

export class JsonHandler extends BaseLanguageHandler {
  languageIds = ['json', 'jsonc'];

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
    return [
      { regex: /"\w+"\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }
    ];
  }

  getClassMemberPatterns(): ElementPattern[] {
    return [];
  }

  getMultilineStringPatterns(): MultilineStringPattern[] {
    return [];
  }

  usesBraces(): boolean {
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

  getJsonPropertyRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string
  ): vscode.Range | null {
    const line = document.lineAt(position.line);
    const lineText = line.text;

    // Check if we're on a JSON property key
    if (this.isJsonPropertyKey(lineText, word, position.character)) {
      return this.getJsonPropertyValueRange(document, position.line, word);
    }

    // Check if we're inside a JSON value that spans multiple lines
    const propertyInfo = this.findJsonPropertyFromValue(document, position, word);
    if (propertyInfo) {
      return propertyInfo.range;
    }

    return null;
  }

  private isJsonPropertyKey(lineText: string, word: string, character: number): boolean {
    const patterns = [
      new RegExp(`"${escapeRegExp(word)}"\\s*:`),
      new RegExp(`'${escapeRegExp(word)}'\\s*:`)
    ];

    for (const pattern of patterns) {
      const match = lineText.match(pattern);
      if (match) {
        const keyStart = lineText.indexOf(match[0]);
        const keyEnd = keyStart + match[0].length;
        return character >= keyStart && character <= keyEnd;
      }
    }

    return false;
  }

  private findJsonPropertyFromValue(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string
  ): { range: vscode.Range } | null {
    for (let i = position.line; i >= Math.max(0, position.line - 10); i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      const propertyMatch = lineText.match(/"([^"]+)"\s*:/);
      if (propertyMatch) {
        const propertyKey = propertyMatch[1];
        if (propertyKey.includes(word) || lineText.includes(word)) {
          return {
            range: this.getJsonPropertyValueRange(document, i, propertyKey)
          };
        }
      }
    }

    return null;
  }

  private getJsonPropertyValueRange(
    document: vscode.TextDocument,
    startLine: number,
    propertyKey: string
  ): vscode.Range {
    const line = document.lineAt(startLine);
    const lineText = line.text;
    let endLine = startLine;

    const colonIndex = lineText.indexOf(':', lineText.indexOf(`"${propertyKey}"`));
    if (colonIndex === -1) {
      const startPos = new vscode.Position(startLine, 0);
      const endPos = new vscode.Position(startLine, lineText.length);
      return new vscode.Range(startPos, endPos);
    }

    const valueStart = colonIndex + 1;
    const valueText = lineText.substring(valueStart).trim();

    if (valueText.startsWith('{')) {
      endLine = this.findJsonObjectEnd(document, startLine, colonIndex);
    } else if (valueText.startsWith('[')) {
      endLine = this.findJsonArrayEnd(document, startLine, colonIndex);
    } else if (valueText.startsWith('"')) {
      endLine = this.findJsonStringEnd(document, startLine, valueStart);
    } else {
      endLine = this.findJsonPrimitiveEnd(document, startLine);
    }

    const endLineText = document.lineAt(endLine).text;
    let endCharacter = endLineText.length;

    if (endLineText.trimEnd().endsWith(',')) {
      endCharacter = endLineText.length;
    } else if (endLine + 1 < document.lineCount) {
      const nextLine = document.lineAt(endLine + 1);
      const nextLineText = nextLine.text.trim();
      if (nextLineText.startsWith(',')) {
        endLine = endLine + 1;
        endCharacter = nextLine.text.indexOf(',') + 1;
      }
    }

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, endCharacter);

    return new vscode.Range(startPos, endPos);
  }

  private findJsonObjectEnd(document: vscode.TextDocument, startLine: number, colonIndex: number): number {
    const startLineText = document.lineAt(startLine).text;
    const afterColon = startLineText.substring(colonIndex + 1);

    const openBraceIndex = afterColon.indexOf('{');
    if (openBraceIndex !== -1) {
      const closeBraceIndex = afterColon.lastIndexOf('}');
      if (closeBraceIndex > openBraceIndex) {
        return startLine;
      }
    }

    let braceCount = 0;
    let foundOpen = false;

    for (let i = startLine; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const lineText = i === startLine ?
        line.text.substring(colonIndex + 1) :
        line.text;

      for (const char of lineText) {
        if (char === '{') {
          braceCount++;
          foundOpen = true;
        } else if (char === '}') {
          braceCount--;
          if (foundOpen && braceCount === 0) {
            return i;
          }
        }
      }
    }

    return startLine;
  }

  private findJsonArrayEnd(document: vscode.TextDocument, startLine: number, colonIndex: number): number {
    const startLineText = document.lineAt(startLine).text;
    const afterColon = startLineText.substring(colonIndex + 1);

    const openBracketIndex = afterColon.indexOf('[');
    if (openBracketIndex !== -1) {
      const closeBracketIndex = afterColon.lastIndexOf(']');
      if (closeBracketIndex > openBracketIndex) {
        return startLine;
      }
    }

    let bracketCount = 0;
    let foundOpen = false;

    for (let i = startLine; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const lineText = i === startLine ?
        line.text.substring(colonIndex + 1) :
        line.text;

      for (const char of lineText) {
        if (char === '[') {
          bracketCount++;
          foundOpen = true;
        } else if (char === ']') {
          bracketCount--;
          if (foundOpen && bracketCount === 0) {
            return i;
          }
        }
      }
    }

    return startLine;
  }

  private findJsonStringEnd(document: vscode.TextDocument, startLine: number, valueStart: number): number {
    const startLineText = document.lineAt(startLine).text;
    const afterValueStart = startLineText.substring(valueStart);

    const openQuoteIndex = afterValueStart.indexOf('"');
    if (openQuoteIndex === -1) {
      return startLine;
    }

    let inString = false;
    let escaped = false;

    for (let i = startLine; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const lineText = i === startLine ?
        line.text.substring(valueStart + openQuoteIndex) :
        line.text;

      for (let j = 0; j < lineText.length; j++) {
        const char = lineText[j];

        if (!inString && char === '"') {
          inString = true;
        } else if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === '\\') {
            escaped = true;
          } else if (char === '"') {
            return i;
          }
        }
      }
    }

    return startLine;
  }

  private findJsonPrimitiveEnd(document: vscode.TextDocument, startLine: number): number {
    const line = document.lineAt(startLine);
    const lineText = line.text;

    const commaIndex = lineText.indexOf(',');
    const braceIndex = lineText.indexOf('}');
    const bracketIndex = lineText.indexOf(']');

    const terminators = [commaIndex, braceIndex, bracketIndex].filter(index => index !== -1);

    if (terminators.length > 0) {
      return startLine;
    }

    for (let i = startLine + 1; i < document.lineCount; i++) {
      const nextLine = document.lineAt(i);
      const nextLineText = nextLine.text.trim();

      if (nextLineText.startsWith(',') ||
        nextLineText.startsWith('}') ||
        nextLineText.startsWith(']')) {
        return i - 1;
      }

      if (nextLineText.includes(',') ||
        nextLineText.includes('}') ||
        nextLineText.includes(']')) {
        return i;
      }
    }

    return startLine;
  }
}