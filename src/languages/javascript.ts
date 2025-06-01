import * as vscode from 'vscode';
import { BaseLanguageHandler, ElementPattern, MultilineStringPattern, ElementType } from './base/baseLanguage';
import {
  getBracedBlockRangeForFunction,
  getIndentedBlockRange,
  findMatchingBrace,
  getVariableDeclarationRange,
  getObjectPropertyRange,
  getClassMemberBodyRange,
  findVariableWithMultilineString
} from '../utils/helpers';

export class JavaScriptHandler extends BaseLanguageHandler {
  // Updated to only handle pure JavaScript and JSX (not TypeScript)
  languageIds = ['javascript', 'jsx', 'javascriptreact'];

  getClassPatterns(): ElementPattern[] {
    return [
      { regex: /class\s+\w+/, type: ElementType.Class, priority: 1 },
    ];
  }

  getFunctionPatterns(): ElementPattern[] {
    return [
      { regex: /function\s+\w+/, type: ElementType.Function, priority: 1 },
      { regex: /const\s+\w+\s*=\s*\(/, type: ElementType.Function, priority: 2 },
      { regex: /let\s+\w+\s*=\s*\(/, type: ElementType.Function, priority: 2 },
      { regex: /var\s+\w+\s*=\s*\(/, type: ElementType.Function, priority: 2 },
      { regex: /\w+\s*:\s*function/, type: ElementType.Function, priority: 2 },
      { regex: /\w+\s*:\s*\(/, type: ElementType.Function, priority: 3 },
      { regex: /\w+\s*=>\s*/, type: ElementType.Function, priority: 3 },
      { regex: /async\s+function\s+\w+/, type: ElementType.Function, priority: 1 },
      { regex: /export\s+function\s+\w+/, type: ElementType.Function, priority: 1 },
      { regex: /export\s+async\s+function\s+\w+/, type: ElementType.Function, priority: 1 }
    ];
  }

  getVariablePatterns(): ElementPattern[] {
    return [
      { regex: /const\s+\w+/, type: ElementType.Variable, priority: 1 },
      { regex: /let\s+\w+/, type: ElementType.Variable, priority: 1 },
      { regex: /var\s+\w+/, type: ElementType.Variable, priority: 1 }
    ];
  }

  getObjectKeyPatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s*:\s*/, type: ElementType.ObjectKey, priority: 1 },
      { regex: /"\w+"\s*:\s*/, type: ElementType.ObjectKey, priority: 1 },
      { regex: /'\w+'\s*:\s*/, type: ElementType.ObjectKey, priority: 1 },
      { regex: /\[\w+\]\s*:\s*/, type: ElementType.ObjectKey, priority: 1 },
      { regex: /\w+\s*\(/, type: ElementType.ObjectKey, priority: 2 },
      { regex: /get\s+\w+/, type: ElementType.ObjectKey, priority: 1 },
      { regex: /set\s+\w+/, type: ElementType.ObjectKey, priority: 1 }
    ];
  }

  getClassMemberPatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s*\(/, type: ElementType.ClassMember, priority: 1 },
      { regex: /\w+\s*=/, type: ElementType.ClassMember, priority: 2 },
      { regex: /get\s+\w+/, type: ElementType.ClassMember, priority: 1 },
      { regex: /set\s+\w+/, type: ElementType.ClassMember, priority: 1 },
      { regex: /static\s+\w+/, type: ElementType.ClassMember, priority: 1 },
      { regex: /async\s+\w+/, type: ElementType.ClassMember, priority: 1 }
    ];
  }

  getMultilineStringPatterns(): MultilineStringPattern[] {
    return [
      { regex: /`/, delimiter: '`', type: 'template' },
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /'/, delimiter: "'", type: 'multiline' }
    ];
  }

  getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const line = document.lineAt(position.line);
    const lineText = line.text;

    // Check if current line contains class declaration
    const classPatterns = this.getClassPatterns();

    for (const pattern of classPatterns) {
      const match = lineText.match(pattern.regex);
      if (match && lineText.includes(word)) {
        return this.getClassBodyRange(document, position.line);
      }
    }

    // Check previous lines for class declaration
    for (let i = position.line - 1; i >= Math.max(0, position.line - 5); i--) {
      const prevLine = document.lineAt(i);
      for (const pattern of classPatterns) {
        const match = prevLine.text.match(pattern.regex);
        if (match && prevLine.text.includes(word)) {
          return this.getClassBodyRange(document, i);
        }
      }
    }

    return null;
  }

  getFunctionRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const patterns = this.getFunctionPatterns();
    const line = document.lineAt(position.line);
    const lineText = line.text;

    // Check if current line contains function declaration
    for (const pattern of patterns) {
      const match = lineText.match(pattern.regex);
      if (match && lineText.includes(word)) {
        return this.getFunctionBodyRange(document, position.line);
      }
    }

    // Check previous lines for function declaration
    for (let i = position.line - 1; i >= Math.max(0, position.line - 5); i--) {
      const prevLine = document.lineAt(i);
      for (const pattern of patterns) {
        const match = prevLine.text.match(pattern.regex);
        if (match && prevLine.text.includes(word)) {
          return this.getFunctionBodyRange(document, i);
        }
      }
    }

    return null;
  }

  getVariableRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const patterns = this.getVariablePatterns();

    for (let i = position.line; i >= Math.max(0, position.line - 10); i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      for (const pattern of patterns) {
        const match = lineText.match(pattern.regex);
        if (match && lineText.includes(word)) {
          return getVariableDeclarationRange(document, i, word);
        }
      }
    }

    return null;
  }

  getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const line = document.lineAt(position.line);
    const lineText = line.text;

    // Check if we're inside an object literal
    if (!this.isInsideObjectLiteral(document, position)) {
      return null;
    }

    const objectKeyPatterns = this.getObjectKeyPatterns();

    for (const pattern of objectKeyPatterns) {
      const match = lineText.match(pattern.regex);
      if (match && lineText.includes(word)) {
        return getObjectPropertyRange(document, position.line, word);
      }
    }

    return null;
  }

  getClassMemberRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Check if we're inside a class
    const classInfo = this.findContainingClass(document, position);
    if (!classInfo) {
      return null;
    }

    const line = document.lineAt(position.line);
    const lineText = line.text;

    const classMemberPatterns = this.getClassMemberPatterns();

    for (const pattern of classMemberPatterns) {
      const match = lineText.match(pattern.regex);
      if (match && lineText.includes(word)) {
        return getClassMemberBodyRange(document, position.line, word);
      }
    }

    // Check previous lines for member declaration
    for (let i = position.line - 1; i >= Math.max(classInfo.startLine, position.line - 5); i--) {
      const prevLine = document.lineAt(i);
      for (const pattern of classMemberPatterns) {
        const match = prevLine.text.match(pattern.regex);
        if (match && prevLine.text.includes(word)) {
          return getClassMemberBodyRange(document, i, word);
        }
      }
    }

    return null;
  }

  getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const variableInfo = findVariableWithMultilineString(document, position, word, this.getMultilineStringPatterns());
    return variableInfo?.range || null;
  }

  // Helper methods
  private getClassBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    if (this.usesBraces()) {
      return getBracedBlockRangeForFunction(document, startLine);
    } else {
      return getIndentedBlockRange(document, startLine);
    }
  }

  private getFunctionBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    if (this.usesBraces()) {
      return getBracedBlockRangeForFunction(document, startLine);
    } else {
      return getIndentedBlockRange(document, startLine);
    }
  }

  private isInsideObjectLiteral(document: vscode.TextDocument, position: vscode.Position): boolean {
    let braceCount = 0;
    let foundOpenBrace = false;

    for (let i = position.line; i >= Math.max(0, position.line - 20); i--) {
      const line = document.lineAt(i);
      const lineText = i === position.line ?
        line.text.substring(0, position.character) :
        line.text;

      for (let j = lineText.length - 1; j >= 0; j--) {
        const char = lineText[j];
        if (char === '}') {
          braceCount++;
        } else if (char === '{') {
          braceCount--;
          if (braceCount < 0) {
            foundOpenBrace = true;
            break;
          }
        }
      }

      if (foundOpenBrace) {
        break;
      }
    }

    return foundOpenBrace && braceCount < 0;
  }

  private findContainingClass(document: vscode.TextDocument, position: vscode.Position): { startLine: number, endLine: number } | null {
    const classPatterns = this.getClassPatterns();
    let classStartLine = -1;

    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      for (const pattern of classPatterns) {
        if (pattern.regex.test(lineText)) {
          classStartLine = i;
          break;
        }
      }

      if (classStartLine !== -1) {
        break;
      }
    }

    if (classStartLine === -1) {
      return null;
    }

    const classEndLine = findMatchingBrace(document, classStartLine, '{', '}');

    return {
      startLine: classStartLine,
      endLine: classEndLine
    };
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}