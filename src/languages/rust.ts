import * as vscode from 'vscode';
import { BaseLanguageHandler, ElementPattern, MultilineStringPattern, ElementType } from './base/baseLanguage';
import {
  getBracedBlockRangeForFunction,
  getVariableDeclarationRange,
  getObjectPropertyRange,
  getClassMemberBodyRange,
  findMatchingBrace
} from '../utils/helpers';

export class RustHandler extends BaseLanguageHandler {
  languageIds = ['rust'];

  getClassPatterns(): ElementPattern[] {
    return [
      { regex: /(pub\s+)?struct\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(pub\s+)?enum\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(pub\s+)?trait\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /(pub\s+)?union\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /impl\s+\w+/, type: ElementType.Class, priority: 1 }, // impl block
      { regex: /impl\s+\w+\s+for\s+\w+/, type: ElementType.Class, priority: 1 }, // trait impl
      { regex: /mod\s+\w+/, type: ElementType.Class, priority: 2 } // module
    ];
  }

  getFunctionPatterns(): ElementPattern[] {
    return [
      { regex: /(pub\s+)?(async\s+)?fn\s+\w+/, type: ElementType.Function, priority: 1 }, // function
      { regex: /(pub\s+)?(unsafe\s+)?fn\s+\w+/, type: ElementType.Function, priority: 1 }, // unsafe function
      { regex: /(pub\s+)?(const\s+)?fn\s+\w+/, type: ElementType.Function, priority: 1 }, // const function
      { regex: /(pub\s+)?(extern\s+)?fn\s+\w+/, type: ElementType.Function, priority: 1 }, // extern function
      { regex: /let\s+\w+\s*=\s*\|/, type: ElementType.Function, priority: 2 }, // closure
      { regex: /let\s+\w+\s*=\s*move\s*\|/, type: ElementType.Function, priority: 2 }, // move closure
      { regex: /\|\w*\|\s*\{/, type: ElementType.Function, priority: 3 } // inline closure
    ];
  }

  getVariablePatterns(): ElementPattern[] {
    return [
      { regex: /let\s+(mut\s+)?\w+/, type: ElementType.Variable, priority: 1 }, // let binding
      { regex: /const\s+\w+/, type: ElementType.Variable, priority: 1 }, // const
      { regex: /static\s+(mut\s+)?\w+/, type: ElementType.Variable, priority: 1 }, // static
      { regex: /(pub\s+)?(const\s+|static\s+)\w+/, type: ElementType.Variable, priority: 1 }, // pub const/static
      { regex: /for\s+\w+\s+in/, type: ElementType.Variable, priority: 2 }, // for loop variable
      { regex: /if\s+let\s+\w+/, type: ElementType.Variable, priority: 2 }, // if let pattern
      { regex: /while\s+let\s+\w+/, type: ElementType.Variable, priority: 2 } // while let pattern
    ];
  }

  getObjectKeyPatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }, // struct field initialization
      { regex: /"\w+"\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }, // map key (in macros)
      { regex: /\w+\s*=>\s*/, type: ElementType.ObjectKey, priority: 2 } // match arm
    ];
  }

  getClassMemberPatterns(): ElementPattern[] {
    return [
      { regex: /(pub\s+)?\w+\s*:\s*\w+/, type: ElementType.ClassMember, priority: 1 }, // struct field
      { regex: /(pub\s+)?(async\s+)?fn\s+\w+/, type: ElementType.ClassMember, priority: 1 }, // method
      { regex: /(pub\s+)?(unsafe\s+)?fn\s+\w+/, type: ElementType.ClassMember, priority: 1 }, // unsafe method
      { regex: /(pub\s+)?(const\s+)?fn\s+\w+/, type: ElementType.ClassMember, priority: 1 }, // const method
      { regex: /type\s+\w+/, type: ElementType.ClassMember, priority: 2 }, // associated type
      { regex: /const\s+\w+/, type: ElementType.ClassMember, priority: 2 }, // associated const
      { regex: /\w+\s*\([^)]*\)\s*->\s*\w+/, type: ElementType.ClassMember, priority: 2 } // function pointer field
    ];
  }

  getMultilineStringPatterns(): MultilineStringPattern[] {
    return [
      { regex: /r#*"/, delimiter: '"', type: 'raw' }, // raw string literals
      { regex: /"/, delimiter: '"', type: 'multiline' }, // regular strings
      { regex: /b"/, delimiter: '"', type: 'multiline' }, // byte strings
      { regex: /br#*"/, delimiter: '"', type: 'raw' } // raw byte strings
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

    // Check previous lines for type declaration (including attributes)
    for (let i = position.line - 1; i >= Math.max(0, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for attributes
      if (prevLineText.startsWith('#[')) {
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
      if (prevLineText.startsWith('#[')) {
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

    // Check if we're inside a struct literal or match expression
    if (!this.isInsideStructOrMatch(document, position)) {
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
    const structInfo = this.findContainingStructOrImpl(document, position);
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

    // Check previous lines for member declaration (including attributes)
    for (let i = position.line - 1; i >= Math.max(structInfo.startLine, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for attributes
      if (prevLineText.startsWith('#[')) {
        for (let j = i + 1; j <= Math.min(document.lineCount - 1, i + 5); j++) {
          const nextLine = document.lineAt(j);
          for (const pattern of classMemberPatterns) {
            const match = nextLine.text.match(pattern.regex);
            if (match && nextLine.text.includes(word)) {
              return this.getStructMemberRange(document, j, word);
            }
          }
        }
      }

      for (const pattern of classMemberPatterns) {
        const match = prevLineText.match(pattern.regex);
        if (match && prevLineText.includes(word)) {
          return this.getStructMemberRange(document, i, word);
        }
      }
    }

    return null;
  }

  getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Rust raw string handling
    return this.findRawStringRange(document, position, word);
  }

  // Helper methods
  private getClassBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    return getBracedBlockRangeForFunction(document, startLine);
  }

  private getFunctionBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    return getBracedBlockRangeForFunction(document, startLine);
  }

  private isInsideStructOrMatch(document: vscode.TextDocument, position: vscode.Position): boolean {
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

  private findContainingStructOrImpl(document: vscode.TextDocument, position: vscode.Position): { startLine: number, endLine: number } | null {
    const classPatterns = this.getClassPatterns();
    let structStartLine = -1;

    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      for (const pattern of classPatterns) {
        if (pattern.regex.test(lineText)) {
          structStartLine = i;
          break;
        }
      }

      if (structStartLine !== -1) {
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

    // Check if it's a method (has function body)
    if (lineText.includes('fn ') && lineText.includes('{')) {
      return getBracedBlockRangeForFunction(document, startLine);
    }

    // Struct field or simple declaration
    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(startLine, lineText.length);

    return new vscode.Range(startPos, endPos);
  }

  private findRawStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Look for raw string assignment
    for (let i = position.line; i >= Math.max(0, position.line - 5); i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      if (lineText.includes(word) && lineText.includes('r#')) {
        return this.getRawStringEnd(document, i);
      }
    }

    return null;
  }

  private getRawStringEnd(document: vscode.TextDocument, startLine: number): vscode.Range {
    const line = document.lineAt(startLine);
    const lineText = line.text;
    let endLine = startLine;

    // Extract the number of # characters
    const rawStringMatch = lineText.match(/r(#+)"/);
    if (rawStringMatch) {
      const hashes = rawStringMatch[1];
      const closingPattern = '"' + hashes;

      // Check if it ends on same line
      if (lineText.includes(closingPattern)) {
        const startPos = new vscode.Position(startLine, 0);
        const endPos = new vscode.Position(startLine, lineText.length);
        return new vscode.Range(startPos, endPos);
      }

      // Multi-line raw string
      for (let i = startLine + 1; i < document.lineCount; i++) {
        const currentLine = document.lineAt(i);
        if (currentLine.text.includes(closingPattern)) {
          endLine = i;
          break;
        }
      }
    }

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

    return new vscode.Range(startPos, endPos);
  }
}