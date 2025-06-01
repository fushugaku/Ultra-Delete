import * as vscode from 'vscode';
import { BaseLanguageHandler, ElementPattern, MultilineStringPattern, ElementType } from './base/baseLanguage';
import {
  getBracedBlockRangeForFunction,
  getVariableDeclarationRange,
  getObjectPropertyRange,
  getClassMemberBodyRange,
  findMatchingBrace
} from '../utils/helpers';

export class GoHandler extends BaseLanguageHandler {
  languageIds = ['go'];

  getClassPatterns(): ElementPattern[] {
    return [
      { regex: /type\s+\w+\s+struct/, type: ElementType.Class, priority: 1 },
      { regex: /type\s+\w+\s+interface/, type: ElementType.Class, priority: 1 },
      { regex: /type\s+\w+\s+\w+/, type: ElementType.Class, priority: 2 }, // type aliases
      { regex: /package\s+\w+/, type: ElementType.Class, priority: 3 } // package declaration
    ];
  }

  getFunctionPatterns(): ElementPattern[] {
    return [
      { regex: /func\s+\w+\s*\(/, type: ElementType.Function, priority: 1 }, // regular function
      { regex: /func\s*\([^)]*\)\s*\w+\s*\(/, type: ElementType.Function, priority: 1 }, // method with receiver
      { regex: /func\s+\([^)]*\)\s+\w+\s*\(/, type: ElementType.Function, priority: 1 }, // method (alternative syntax)
      { regex: /var\s+\w+\s*=\s*func\s*\(/, type: ElementType.Function, priority: 2 }, // function variable
      { regex: /\w+\s*:=\s*func\s*\(/, type: ElementType.Function, priority: 2 } // function assignment
    ];
  }

  getVariablePatterns(): ElementPattern[] {
    return [
      { regex: /var\s+\w+/, type: ElementType.Variable, priority: 1 }, // var declaration
      { regex: /\w+\s*:=/, type: ElementType.Variable, priority: 1 }, // short variable declaration
      { regex: /const\s+\w+/, type: ElementType.Variable, priority: 1 }, // const declaration
      { regex: /var\s*\(/, type: ElementType.Variable, priority: 2 }, // var block
      { regex: /const\s*\(/, type: ElementType.Variable, priority: 2 } // const block
    ];
  }

  getObjectKeyPatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }, // struct literal field
      { regex: /"\w+"\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }, // map key
      { regex: /`\w+`\s*:\s*/, type: ElementType.ObjectKey, priority: 1 } // map key with backticks
    ];
  }

  getClassMemberPatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s+\w+/, type: ElementType.ClassMember, priority: 1 }, // struct field
      { regex: /\w+\s+\w+\s+`.*`/, type: ElementType.ClassMember, priority: 1 }, // struct field with tags
      { regex: /func\s*\([^)]*\)\s*\w+\s*\(/, type: ElementType.ClassMember, priority: 1 }, // method
      { regex: /\*\w+/, type: ElementType.ClassMember, priority: 2 }, // pointer field
      { regex: /\[\]\w+/, type: ElementType.ClassMember, priority: 2 }, // slice field
      { regex: /map\[\w+\]\w+/, type: ElementType.ClassMember, priority: 2 } // map field
    ];
  }

  getMultilineStringPatterns(): MultilineStringPattern[] {
    return [
      { regex: /`/, delimiter: '`', type: 'raw' }, // raw string literals
      { regex: /"/, delimiter: '"', type: 'multiline' } // regular strings
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

    // Check previous lines for type declaration
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

    // Check current line
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
          // Handle var/const blocks
          if (lineText.includes('(')) {
            return this.getVariableBlockRange(document, i);
          }
          return getVariableDeclarationRange(document, i, word);
        }
      }
    }

    return null;
  }

  getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const line = document.lineAt(position.line);
    const lineText = line.text;

    // Check if we're inside a struct literal or map
    if (!this.isInsideStructOrMap(document, position)) {
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
    const structInfo = this.findContainingStruct(document, position);
    if (!structInfo) {
      return null;
    }

    const line = document.lineAt(position.line);
    const lineText = line.text;

    const classMemberPatterns = this.getClassMemberPatterns();

    for (const pattern of classMemberPatterns) {
      const match = lineText.match(pattern.regex);
      if (match && lineText.includes(word)) {
        return this.getStructMemberRange(document, position.line, word);
      }
    }

    return null;
  }

  getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Go raw string handling
    return this.findRawStringRange(document, position, word);
  }

  // Helper methods
  private getClassBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    return getBracedBlockRangeForFunction(document, startLine);
  }

  private getFunctionBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    return getBracedBlockRangeForFunction(document, startLine);
  }

  private getVariableBlockRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    // Handle var ( ... ) or const ( ... ) blocks
    const endLine = findMatchingBrace(document, startLine, '(', ')');
    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);
    return new vscode.Range(startPos, endPos);
  }

  private isInsideStructOrMap(document: vscode.TextDocument, position: vscode.Position): boolean {
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

  private findContainingStruct(document: vscode.TextDocument, position: vscode.Position): { startLine: number, endLine: number } | null {
    let structStartLine = -1;

    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      if (/type\s+\w+\s+struct/.test(lineText)) {
        structStartLine = i;
        break;
      }
    }

    if (structStartLine === -1) {
      return null;
    }

    const structEndLine = findMatchingBrace(document, structStartLine, '{', '}');

    return {
      startLine: structStartLine,
      endLine: structEndLine
    };
  }

  private getStructMemberRange(document: vscode.TextDocument, startLine: number, memberName: string): vscode.Range {
    const line = document.lineAt(startLine);
    const lineText = line.text;

    // Go struct fields are typically single-line
    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(startLine, lineText.length);

    return new vscode.Range(startPos, endPos);
  }

  private findRawStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Look for raw string assignment
    for (let i = position.line; i >= Math.max(0, position.line - 5); i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      if (lineText.includes(word) && lineText.includes('`')) {
        return this.getRawStringEnd(document, i);
      }
    }

    return null;
  }

  private getRawStringEnd(document: vscode.TextDocument, startLine: number): vscode.Range {
    const line = document.lineAt(startLine);
    const lineText = line.text;
    let endLine = startLine;

    // Check if raw string ends on same line
    const backtickCount = (lineText.match(/`/g) || []).length;
    if (backtickCount >= 2) {
      const startPos = new vscode.Position(startLine, 0);
      const endPos = new vscode.Position(startLine, lineText.length);
      return new vscode.Range(startPos, endPos);
    }

    // Multi-line raw string
    for (let i = startLine + 1; i < document.lineCount; i++) {
      const currentLine = document.lineAt(i);
      if (currentLine.text.includes('`')) {
        endLine = i;
        break;
      }
    }

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

    return new vscode.Range(startPos, endPos);
  }
}