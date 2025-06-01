import * as vscode from 'vscode';
import { BaseLanguageHandler, ElementPattern, MultilineStringPattern, ElementType } from './base/baseLanguage';
import {
  getBracedBlockRangeForFunction,
  getVariableDeclarationRange,
  getObjectPropertyRange,
  getClassMemberBodyRange,
  findMatchingBrace
} from '../utils/helpers';

export class CSharpHandler extends BaseLanguageHandler {
  languageIds = ['csharp'];

  getClassPatterns(): ElementPattern[] {
    return [
      { regex: /(public|private|protected|internal)?\s*(abstract|sealed|static|partial)?\s*class\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(public|private|protected|internal)?\s*interface\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(public|private|protected|internal)?\s*enum\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(public|private|protected|internal)?\s*struct\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(public|private|protected|internal)?\s*record\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(public|private|protected|internal)?\s*delegate\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /namespace\s+\w+/, type: ElementType.Class, priority: 1 }
    ];
  }

  getFunctionPatterns(): ElementPattern[] {
    return [
      { regex: /(public|private|protected|internal)?\s*(static|virtual|override|abstract|async)?\s*\w+\s+\w+\s*\(/, type: ElementType.Function, priority: 1 },
      { regex: /(public|private|protected|internal)?\s*(static)?\s*\w+\s*\(/, type: ElementType.Function, priority: 2 }, // constructor
      { regex: /(public|private|protected|internal)?\s*~\w+\s*\(/, type: ElementType.Function, priority: 1 }, // destructor
      { regex: /(public|private|protected|internal)?\s*(static)?\s*\w+\s+operator\s*[+\-*/=<>!]+\s*\(/, type: ElementType.Function, priority: 1 }, // operator overload
      { regex: /\[.*\]\s*\n\s*(public|private|protected|internal)?\s*\w+\s+\w+\s*\(/, type: ElementType.Function, priority: 1 } // attributed methods
    ];
  }

  getVariablePatterns(): ElementPattern[] {
    return [
      { regex: /(public|private|protected|internal)?\s*(static|readonly|const)?\s*\w+\s+\w+/, type: ElementType.Variable, priority: 1 },
      { regex: /(public|private|protected|internal)?\s*(static|readonly)?\s*\w+<.*>\s+\w+/, type: ElementType.Variable, priority: 1 }, // generic types
      { regex: /var\s+\w+\s*=/, type: ElementType.Variable, priority: 2 }, // var declarations
      { regex: /\w+\s+\w+\s*=/, type: ElementType.Variable, priority: 3 }, // local variables
      { regex: /using\s+\w+\s*=/, type: ElementType.Variable, priority: 2 }, // using aliases
      { regex: /foreach\s*\(\s*\w+\s+\w+\s+in/, type: ElementType.Variable, priority: 3 } // foreach variables
    ];
  }

  getObjectKeyPatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }, // object initializer
      { regex: /\w+\s*=\s*/, type: ElementType.ObjectKey, priority: 2 }, // property initializer
      { regex: /"\w+"\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }, // dictionary key
      { regex: /\[\s*"\w+"\s*\]\s*=/, type: ElementType.ObjectKey, priority: 1 } // indexer
    ];
  }

  getClassMemberPatterns(): ElementPattern[] {
    return [
      { regex: /(public|private|protected|internal)?\s*(static|virtual|override|abstract|async)?\s*\w+\s+\w+\s*\(/, type: ElementType.ClassMember, priority: 1 }, // method
      { regex: /(public|private|protected|internal)?\s*(static|readonly|const)?\s*\w+\s+\w+\s*[={;]/, type: ElementType.ClassMember, priority: 2 }, // field/property
      { regex: /(public|private|protected|internal)?\s*\w+\s+\w+\s*\{\s*(get|set)/, type: ElementType.ClassMember, priority: 1 }, // auto-property
      { regex: /(public|private|protected|internal)?\s*event\s+\w+/, type: ElementType.ClassMember, priority: 1 }, // event
      { regex: /\[.*\]\s*\n\s*(public|private|protected|internal)?/, type: ElementType.ClassMember, priority: 1 } // attributed members
    ];
  }

  getMultilineStringPatterns(): MultilineStringPattern[] {
    return [
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /@"/, delimiter: '"', type: 'raw' }, // verbatim string
      { regex: /\$"/, delimiter: '"', type: 'multiline' }, // interpolated string
      { regex: /\$@"/, delimiter: '"', type: 'raw' }, // verbatim interpolated string
      { regex: /@\$"/, delimiter: '"', type: 'raw' } // verbatim interpolated string (alternative syntax)
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

    // Check previous lines for class declaration (including attributes)
    for (let i = position.line - 1; i >= Math.max(0, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for attributes
      if (prevLineText.startsWith('[') && prevLineText.endsWith(']')) {
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

    // Check previous lines (including attributes)
    for (let i = position.line - 1; i >= Math.max(0, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for attributes
      if (prevLineText.startsWith('[') && prevLineText.endsWith(']')) {
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

    // Check previous lines for member declaration (including attributes)
    for (let i = position.line - 1; i >= Math.max(classInfo.startLine, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for attributes
      if (prevLineText.startsWith('[') && prevLineText.endsWith(']')) {
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
    // C# string handling - look for verbatim strings and interpolated strings
    return this.findStringLiteralRange(document, position, word);
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

  private findStringLiteralRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Look for string assignment
    for (let i = position.line; i >= Math.max(0, position.line - 5); i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      if (lineText.includes(word) && (lineText.includes('@"') || lineText.includes('$"'))) {
        // Found verbatim or interpolated string
        return this.getStringLiteralEnd(document, i);
      }
    }

    return null;
  }

  private getStringLiteralEnd(document: vscode.TextDocument, startLine: number): vscode.Range {
    const line = document.lineAt(startLine);
    const lineText = line.text;
    let endLine = startLine;

    // Check if string ends on same line
    const quoteCount = (lineText.match(/"/g) || []).length;
    if (quoteCount >= 2) {
      // String likely ends on same line
      const startPos = new vscode.Position(startLine, 0);
      const endPos = new vscode.Position(startLine, lineText.length);
      return new vscode.Range(startPos, endPos);
    }

    // Multi-line string - find closing quote
    for (let i = startLine + 1; i < document.lineCount; i++) {
      const currentLine = document.lineAt(i);
      if (currentLine.text.includes('"')) {
        endLine = i;
        break;
      }
    }

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

    return new vscode.Range(startPos, endPos);
  }
}