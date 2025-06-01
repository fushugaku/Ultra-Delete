import * as vscode from 'vscode';
import { BaseLanguageHandler, ElementPattern, MultilineStringPattern, ElementType } from './base/baseLanguage';
import {
  getBracedBlockRangeForFunction,
  getVariableDeclarationRange,
  getObjectPropertyRange,
  getClassMemberBodyRange,
  findMatchingBrace
} from '../utils/helpers';

export class CppHandler extends BaseLanguageHandler {
  languageIds = ['cpp', 'c'];

  getClassPatterns(): ElementPattern[] {
    return [
      { regex: /class\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /struct\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /union\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /namespace\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /enum\s+(class\s+)?\w+/, type: ElementType.Class, priority: 1 }, // C++11 scoped enums
      { regex: /template\s*<.*>\s*class\s+\w+/, type: ElementType.Class, priority: 1 }, // template class
      { regex: /template\s*<.*>\s*struct\s+\w+/, type: ElementType.Class, priority: 1 } // template struct
    ];
  }

  getFunctionPatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s+\w+\s*\(/, type: ElementType.Function, priority: 1 }, // return_type function_name(
      { regex: /\w+::\w+\s*\(/, type: ElementType.Function, priority: 1 }, // class::method(
      { regex: /virtual\s+\w+\s+\w+\s*\(/, type: ElementType.Function, priority: 1 }, // virtual functions
      { regex: /static\s+\w+\s+\w+\s*\(/, type: ElementType.Function, priority: 1 }, // static functions
      { regex: /inline\s+\w+\s+\w+\s*\(/, type: ElementType.Function, priority: 1 }, // inline functions
      { regex: /template\s*<.*>\s*\w+\s+\w+\s*\(/, type: ElementType.Function, priority: 1 }, // template functions
      { regex: /operator\s*[+\-*/=<>!&|^%~]+\s*\(/, type: ElementType.Function, priority: 1 }, // operator overloads
      { regex: /~\w+\s*\(/, type: ElementType.Function, priority: 1 }, // destructor
      { regex: /\w+\s*\(\s*const\s+\w+&/, type: ElementType.Function, priority: 2 } // copy constructor pattern
    ];
  }

  getVariablePatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s+\w+\s*[=;]/, type: ElementType.Variable, priority: 1 }, // type var = value;
      { regex: /\w+\s*\*+\s*\w+/, type: ElementType.Variable, priority: 1 }, // pointer declarations
      { regex: /\w+\s*&\s*\w+/, type: ElementType.Variable, priority: 1 }, // reference declarations
      { regex: /const\s+\w+\s+\w+/, type: ElementType.Variable, priority: 1 }, // const variables
      { regex: /static\s+\w+\s+\w+/, type: ElementType.Variable, priority: 1 }, // static variables
      { regex: /extern\s+\w+\s+\w+/, type: ElementType.Variable, priority: 1 }, // extern variables
      { regex: /\w+\s*\[\s*\d*\s*\]\s*\w+/, type: ElementType.Variable, priority: 1 }, // array declarations
      { regex: /auto\s+\w+\s*=/, type: ElementType.Variable, priority: 1 }, // C++11 auto
      { regex: /decltype\s*\(.*\)\s+\w+/, type: ElementType.Variable, priority: 1 } // C++11 decltype
    ];
  }

  getObjectKeyPatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }, // struct initialization
      { regex: /\.\w+\s*=/, type: ElementType.ObjectKey, priority: 1 }, // designated initializers (C99/C++20)
      { regex: /\[\s*\w+\s*\]\s*=/, type: ElementType.ObjectKey, priority: 1 } // array designated initializers
    ];
  }

  getClassMemberPatterns(): ElementPattern[] {
    return [
      { regex: /(public|private|protected):\s*/, type: ElementType.ClassMember, priority: 1 }, // access specifiers
      { regex: /\w+\s+\w+\s*\(/, type: ElementType.ClassMember, priority: 1 }, // member function
      { regex: /\w+\s+\w+\s*[=;]/, type: ElementType.ClassMember, priority: 2 }, // member variable
      { regex: /virtual\s+\w+\s+\w+\s*\(/, type: ElementType.ClassMember, priority: 1 }, // virtual member function
      { regex: /static\s+\w+\s+\w+/, type: ElementType.ClassMember, priority: 1 }, // static member
      { regex: /friend\s+\w+/, type: ElementType.ClassMember, priority: 1 }, // friend declarations
      { regex: /operator\s*[+\-*/=<>!&|^%~]+\s*\(/, type: ElementType.ClassMember, priority: 1 }, // member operator overloads
      { regex: /\w+\s*\*+\s*\w+/, type: ElementType.ClassMember, priority: 2 }, // pointer members
      { regex: /mutable\s+\w+\s+\w+/, type: ElementType.ClassMember, priority: 1 } // mutable members
    ];
  }

  getMultilineStringPatterns(): MultilineStringPattern[] {
    return [
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /R"[^(]*\(/, delimiter: 'R"(', type: 'raw' }, // C++11 raw strings
      { regex: /L"/, delimiter: '"', type: 'multiline' }, // wide strings
      { regex: /u"/, delimiter: '"', type: 'multiline' }, // UTF-16 strings
      { regex: /U"/, delimiter: '"', type: 'multiline' }, // UTF-32 strings
      { regex: /u8"/, delimiter: '"', type: 'multiline' } // UTF-8 strings (C++11)
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

    // Check previous lines for class declaration (including templates)
    for (let i = position.line - 1; i >= Math.max(0, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for template declarations
      if (prevLineText.startsWith('template')) {
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

    // Check previous lines (including templates and multi-line signatures)
    for (let i = position.line - 1; i >= Math.max(0, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for template declarations
      if (prevLineText.startsWith('template')) {
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

    // Check previous lines for member declaration
    for (let i = position.line - 1; i >= Math.max(classInfo.startLine, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

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
    // C++ raw string handling
    return this.findRawStringRange(document, position, word);
  }

  // Helper methods
  private getClassBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    return getBracedBlockRangeForFunction(document, startLine);
  }

  private getFunctionBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    const line = document.lineAt(startLine);
    const lineText = line.text;

    // Check if it's a function declaration (ends with ;) vs definition
    if (lineText.includes(';') && !lineText.includes('{')) {
      // Function declaration only
      const startPos = new vscode.Position(startLine, 0);
      const endPos = new vscode.Position(startLine, lineText.length);
      return new vscode.Range(startPos, endPos);
    }

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

  private findRawStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Look for raw string assignment (C++11)
    for (let i = position.line; i >= Math.max(0, position.line - 5); i--) {
      const line = document.lineAt(i);
      const lineText = line.text;

      if (lineText.includes(word) && lineText.includes('R"')) {
        return this.getRawStringEnd(document, i);
      }
    }

    return null;
  }

  private getRawStringEnd(document: vscode.TextDocument, startLine: number): vscode.Range {
    const line = document.lineAt(startLine);
    const lineText = line.text;
    let endLine = startLine;

    // Extract delimiter from R"delimiter(content)delimiter"
    const rawStringMatch = lineText.match(/R"([^(]*)\(/);
    if (rawStringMatch) {
      const delimiter = rawStringMatch[1];
      const closingPattern = ')' + delimiter + '"';

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