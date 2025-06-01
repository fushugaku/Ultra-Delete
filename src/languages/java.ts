import * as vscode from 'vscode';
import { BaseLanguageHandler, ElementPattern, MultilineStringPattern, ElementType } from './base/baseLanguage';
import {
  getBracedBlockRangeForFunction,
  getVariableDeclarationRange,
  getObjectPropertyRange,
  getClassMemberBodyRange,
  findMatchingBrace
} from '../utils/helpers';

export class JavaHandler extends BaseLanguageHandler {
  languageIds = ['java'];

  getClassPatterns(): ElementPattern[] {
    return [
      { regex: /(public|private|protected)?\s*(abstract|final)?\s*class\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(public|private|protected)?\s*interface\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(public|private|protected)?\s*enum\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(public|private|protected)?\s*record\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(public|private|protected)?\s*@interface\s+\w+/, type: ElementType.Class, priority: 1 } // annotation
    ];
  }

  getFunctionPatterns(): ElementPattern[] {
    return [
      { regex: /(public|private|protected)?\s*(static)?\s*(final)?\s*(abstract)?\s*\w+\s+\w+\s*\(/, type: ElementType.Function, priority: 1 },
      { regex: /(public|private|protected)?\s*(static)?\s*<.*>\s*\w+\s+\w+\s*\(/, type: ElementType.Function, priority: 1 }, // generic methods
      { regex: /(public|private|protected)?\s*\w+\s*\(/, type: ElementType.Function, priority: 2 }, // constructor
      { regex: /@Override\s*\n\s*(public|private|protected)?\s*\w+\s+\w+\s*\(/, type: ElementType.Function, priority: 1 } // overridden methods
    ];
  }

  getVariablePatterns(): ElementPattern[] {
    return [
      { regex: /(public|private|protected)?\s*(static)?\s*(final)?\s*\w+\s+\w+/, type: ElementType.Variable, priority: 1 },
      { regex: /(public|private|protected)?\s*(static)?\s*(final)?\s*\w+<.*>\s+\w+/, type: ElementType.Variable, priority: 1 }, // generic types
      { regex: /\w+\s+\w+\s*=/, type: ElementType.Variable, priority: 2 }, // local variables
      { regex: /for\s*\(\s*\w+\s+\w+\s*:/, type: ElementType.Variable, priority: 3 } // for-each loop variables
    ];
  }

  getObjectKeyPatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }, // Map.of() style
      { regex: /"\w+"\s*,\s*/, type: ElementType.ObjectKey, priority: 2 } // String keys in collections
    ];
  }

  getClassMemberPatterns(): ElementPattern[] {
    return [
      { regex: /(public|private|protected)?\s*(static)?\s*(final)?\s*\w+\s+\w+\s*\(/, type: ElementType.ClassMember, priority: 1 }, // method
      { regex: /(public|private|protected)?\s*(static)?\s*(final)?\s*\w+\s+\w+\s*[=;]/, type: ElementType.ClassMember, priority: 2 }, // field
      { regex: /(public|private|protected)?\s*(static)?\s*\{\s*/, type: ElementType.ClassMember, priority: 3 }, // static/instance initializer
      { regex: /@\w+\s*\n\s*(public|private|protected)?/, type: ElementType.ClassMember, priority: 1 } // annotated members
    ];
  }

  getMultilineStringPatterns(): MultilineStringPattern[] {
    return [
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /"""/, delimiter: '"""', type: 'multiline' } // Java 15+ text blocks
    ];
  }

  getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const line = document.lineAt(position.line);
    const lineText = line.text;

    const classPatterns = this.getClassPatterns();

    for (const pattern of classPatterns) {
      const match = lineText.match(pattern.regex);
      if (match && lineText.includes(word)) {
        return this.getClassBodyRange(document, position.line);
      }
    }

    // Check previous lines for class declaration (including annotations)
    for (let i = position.line - 1; i >= Math.max(0, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for annotations
      if (prevLineText.startsWith('@')) {
        for (let j = i + 1; j <= Math.min(document.lineCount - 1, i + 5); j++) {
          const nextLine = document.lineAt(j);
          for (const pattern of classPatterns) {
            const match = nextLine.text.match(pattern.regex);
            if (match && nextLine.text.includes(word)) {
              return this.getClassBodyRange(document, j);
            }
          }
        }
      }

      for (const pattern of classPatterns) {
        const match = prevLineText.match(pattern.regex);
        if (match && prevLineText.includes(word)) {
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

    // Check current line
    for (const pattern of patterns) {
      const match = lineText.match(pattern.regex);
      if (match && lineText.includes(word)) {
        return this.getFunctionBodyRange(document, position.line);
      }
    }

    // Check previous lines (including annotations)
    for (let i = position.line - 1; i >= Math.max(0, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for annotations like @Override, @Test, etc.
      if (prevLineText.startsWith('@')) {
        for (let j = i + 1; j <= Math.min(document.lineCount - 1, i + 5); j++) {
          const nextLine = document.lineAt(j);
          for (const pattern of patterns) {
            const match = nextLine.text.match(pattern.regex);
            if (match && nextLine.text.includes(word)) {
              return this.getFunctionBodyRange(document, j);
            }
          }
        }
      }

      for (const pattern of patterns) {
        const match = prevLineText.match(pattern.regex);
        if (match && prevLineText.includes(word)) {
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

    // Check previous lines for member declaration (including annotations)
    for (let i = position.line - 1; i >= Math.max(classInfo.startLine, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for annotations
      if (prevLineText.startsWith('@')) {
        for (let j = i + 1; j <= Math.min(document.lineCount - 1, i + 5); j++) {
          const nextLine = document.lineAt(j);
          for (const pattern of classMemberPatterns) {
            const match = nextLine.text.match(pattern.regex);
            if (match && nextLine.text.includes(word)) {
              return getClassMemberBodyRange(document, j, word);
            }
          }
        }
      }

      for (const pattern of classMemberPatterns) {
        const match = prevLineText.match(pattern.regex);
        if (match && prevLineText.includes(word)) {
          return getClassMemberBodyRange(document, i, word);
        }
      }
    }

    return null;
  }

  getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Java doesn't have complex multiline string assignments like JS/Python
    // but we can handle text blocks (Java 15+)
    return this.findTextBlockRange(document, position, word);
  }

  // Helper methods
  private getClassBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    return getBracedBlockRangeForFunction(document, startLine);
  }

  private getFunctionBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    return getBracedBlockRangeForFunction(document, startLine);
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

  private findTextBlockRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Look for text block assignment (Java 15+)
    for (let i = position.line; i >= Math.max(0, position.line - 5); i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      if (lineText.includes(word) && lineText.includes('"""')) {
        // Found text block start
        return this.getTextBlockEnd(document, i);
      }
    }

    return null;
  }

  private getTextBlockEnd(document: vscode.TextDocument, startLine: number): vscode.Range {
    let endLine = startLine;

    // Find closing """
    for (let i = startLine + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.includes('"""')) {
        endLine = i;
        break;
      }
    }

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

    return new vscode.Range(startPos, endPos);
  }
}