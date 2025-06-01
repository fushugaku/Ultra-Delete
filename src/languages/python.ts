import * as vscode from 'vscode';
import { BaseLanguageHandler, ElementPattern, MultilineStringPattern, ElementType } from './base/baseLanguage';
import {
  getIndentedBlockRange,
  getVariableDeclarationRange,
  findVariableWithMultilineString
} from '../utils/helpers';

export class PythonHandler extends BaseLanguageHandler {
  languageIds = ['python'];

  getClassPatterns(): ElementPattern[] {
    return [
      { regex: /class\s+\w+/, type: ElementType.Class, priority: 1 },
      { regex: /class\s+\w+\s*\(/, type: ElementType.Class, priority: 1 } // class with inheritance
    ];
  }

  getFunctionPatterns(): ElementPattern[] {
    return [
      { regex: /def\s+\w+/, type: ElementType.Function, priority: 1 },
      { regex: /async\s+def\s+\w+/, type: ElementType.Function, priority: 1 },
      { regex: /@\w+\s*\n\s*def\s+\w+/, type: ElementType.Function, priority: 1 }, // decorated functions
      { regex: /@property\s*\n\s*def\s+\w+/, type: ElementType.Function, priority: 1 }, // property decorator
      { regex: /@\w+\.setter\s*\n\s*def\s+\w+/, type: ElementType.Function, priority: 1 }, // setter decorator
      { regex: /@staticmethod\s*\n\s*def\s+\w+/, type: ElementType.Function, priority: 1 }, // static method
      { regex: /@classmethod\s*\n\s*def\s+\w+/, type: ElementType.Function, priority: 1 } // class method
    ];
  }

  getVariablePatterns(): ElementPattern[] {
    return [
      { regex: /\w+\s*=/, type: ElementType.Variable, priority: 1 },
      { regex: /\w+\s*:\s*\w+\s*=/, type: ElementType.Variable, priority: 1 }, // type annotated
      { regex: /global\s+\w+/, type: ElementType.Variable, priority: 2 },
      { regex: /nonlocal\s+\w+/, type: ElementType.Variable, priority: 2 }
    ];
  }

  getObjectKeyPatterns(): ElementPattern[] {
    return [
      { regex: /"\w+"\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }, // "key": value
      { regex: /'\w+'\s*:\s*/, type: ElementType.ObjectKey, priority: 1 }, // 'key': value
      { regex: /\w+\s*:\s*/, type: ElementType.ObjectKey, priority: 2 } // key: value (without quotes)
    ];
  }

  getClassMemberPatterns(): ElementPattern[] {
    return [
      { regex: /def\s+\w+/, type: ElementType.ClassMember, priority: 1 }, // method
      { regex: /\w+\s*=/, type: ElementType.ClassMember, priority: 2 }, // class variable
      { regex: /@property/, type: ElementType.ClassMember, priority: 1 }, // property decorator
      { regex: /@\w+\.setter/, type: ElementType.ClassMember, priority: 1 }, // setter decorator
      { regex: /@staticmethod/, type: ElementType.ClassMember, priority: 1 }, // static method
      { regex: /@classmethod/, type: ElementType.ClassMember, priority: 1 }, // class method
      { regex: /async\s+def\s+\w+/, type: ElementType.ClassMember, priority: 1 } // async method
    ];
  }

  getMultilineStringPatterns(): MultilineStringPattern[] {
    return [
      { regex: /"""/, delimiter: '"""', type: 'multiline' },
      { regex: /'''/, delimiter: "'''", type: 'multiline' },
      { regex: /r"""/, delimiter: '"""', type: 'raw' },
      { regex: /r'''/, delimiter: "'''", type: 'raw' },
      { regex: /f"""/, delimiter: '"""', type: 'multiline' }, // f-string
      { regex: /f'''/, delimiter: "'''", type: 'multiline' }, // f-string
      { regex: /rf"""/, delimiter: '"""', type: 'raw' }, // raw f-string
      { regex: /fr"""/, delimiter: '"""', type: 'raw' } // raw f-string
    ];
  }

  usesBraces(): boolean {
    return false; // Python uses indentation
  }

  getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const line = document.lineAt(position.line);
    const lineText = line.text;

    const classPatterns = this.getClassPatterns();

    for (const pattern of classPatterns) {
      const match = lineText.match(pattern.regex);
      if (match && lineText.includes(word)) {
        return getIndentedBlockRange(document, position.line);
      }
    }

    // Check previous lines for class declaration
    for (let i = position.line - 1; i >= Math.max(0, position.line - 5); i--) {
      const prevLine = document.lineAt(i);
      for (const pattern of classPatterns) {
        const match = prevLine.text.match(pattern.regex);
        if (match && prevLine.text.includes(word)) {
          return getIndentedBlockRange(document, i);
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

    // Check previous lines (including decorators)
    for (let i = position.line - 1; i >= Math.max(0, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for decorators
      if (prevLineText.startsWith('@')) {
        // Look for function definition after decorator
        for (let j = i + 1; j <= Math.min(document.lineCount - 1, i + 5); j++) {
          const nextLine = document.lineAt(j);
          if (nextLine.text.includes(`def ${word}`) || nextLine.text.includes(`async def ${word}`)) {
            return this.getFunctionBodyRange(document, j);
          }
        }
      }

      // Regular function check
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
          return this.getVariableDeclarationRange(document, i, word);
        }
      }
    }

    return null;
  }

  getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const line = document.lineAt(position.line);
    const lineText = line.text;

    // Check if we're inside a dictionary
    if (!this.isInsideDictionary(document, position)) {
      return null;
    }

    const objectKeyPatterns = this.getObjectKeyPatterns();

    for (const pattern of objectKeyPatterns) {
      const match = lineText.match(pattern.regex);
      if (match && lineText.includes(word)) {
        return this.getDictionaryEntryRange(document, position.line, word);
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
        return this.getClassMemberBodyRange(document, position.line);
      }
    }

    // Check previous lines for member declaration (including decorators)
    for (let i = position.line - 1; i >= Math.max(classInfo.startLine, position.line - 10); i--) {
      const prevLine = document.lineAt(i);
      const prevLineText = prevLine.text.trim();

      // Check for decorators
      if (prevLineText.startsWith('@')) {
        for (let j = i + 1; j <= Math.min(document.lineCount - 1, i + 5); j++) {
          const nextLine = document.lineAt(j);
          if (nextLine.text.includes(`def ${word}`)) {
            return this.getClassMemberBodyRange(document, j);
          }
        }
      }

      for (const pattern of classMemberPatterns) {
        const match = prevLineText.match(pattern.regex);
        if (match && prevLineText.includes(word)) {
          return this.getClassMemberBodyRange(document, i);
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
  private getFunctionBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    return getIndentedBlockRange(document, startLine);
  }

  private getVariableDeclarationRange(document: vscode.TextDocument, startLine: number, word: string): vscode.Range {
    return getVariableDeclarationRange(document, startLine, word);
  }

  private isInsideDictionary(document: vscode.TextDocument, position: vscode.Position): boolean {
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

  private getDictionaryEntryRange(document: vscode.TextDocument, startLine: number, key: string): vscode.Range {
    const line = document.lineAt(startLine);
    const lineText = line.text;
    let endLine = startLine;

    // Find the colon position
    const colonIndex = lineText.indexOf(':', lineText.indexOf(key));
    if (colonIndex === -1) {
      const startPos = new vscode.Position(startLine, 0);
      const endPos = new vscode.Position(startLine, lineText.length);
      return new vscode.Range(startPos, endPos);
    }

    const valueText = lineText.substring(colonIndex + 1).trim();

    if (valueText.startsWith('{') || valueText.startsWith('[')) {
      // Complex value - find matching brace/bracket
      const openChar = valueText.startsWith('{') ? '{' : '[';
      const closeChar = openChar === '{' ? '}' : ']';
      endLine = this.findMatchingBrace(document, startLine, openChar, closeChar, colonIndex);
    } else if (valueText.includes(',')) {
      // Simple value with comma on same line
      endLine = startLine;
    } else {
      // Multi-line value or last entry
      endLine = this.findDictionaryEntryEnd(document, startLine);
    }

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

    return new vscode.Range(startPos, endPos);
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

    const classEndLine = this.findIndentedBlockEnd(document, classStartLine);

    return {
      startLine: classStartLine,
      endLine: classEndLine
    };
  }

  private getClassMemberBodyRange(document: vscode.TextDocument, startLine: number): vscode.Range {
    return getIndentedBlockRange(document, startLine);
  }

  private findMatchingBrace(document: vscode.TextDocument, startLine: number, openChar: string, closeChar: string, startChar: number = 0): number {
    let braceCount = 0;
    let foundOpen = false;

    for (let i = startLine; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      const searchText = i === startLine ? line.substring(startChar) : line;

      let inString = false;
      let stringChar = '';
      let escaped = false;

      for (let j = 0; j < searchText.length; j++) {
        const char = searchText[j];

        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          continue;
        }

        if (!inString && (char === '"' || char === "'" || char === '`')) {
          inString = true;
          stringChar = char;
          continue;
        }

        if (inString && char === stringChar) {
          inString = false;
          stringChar = '';
          continue;
        }

        if (!inString) {
          if (char === openChar) {
            braceCount++;
            foundOpen = true;
          } else if (char === closeChar) {
            braceCount--;
            if (foundOpen && braceCount === 0) {
              return i;
            }
          }
        }
      }
    }

    return startLine;
  }

  private findDictionaryEntryEnd(document: vscode.TextDocument, startLine: number): number {
    for (let i = startLine + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i).text.trim();

      if (line.endsWith(',') || line.includes('}')) {
        return line.endsWith(',') ? i : i - 1;
      }

      if (line !== '' && !line.startsWith('.') && !line.startsWith('+')) {
        return i - 1;
      }
    }

    return startLine;
  }

  private findIndentedBlockEnd(document: vscode.TextDocument, startLine: number): number {
    const startLineText = document.lineAt(startLine).text;
    const baseIndent = startLineText.length - startLineText.trimStart().length;
    let endLine = startLine;

    for (let i = startLine + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const lineText = line.text;

      if (lineText.trim() === '') {
        continue;
      }

      const currentIndent = lineText.length - lineText.trimStart().length;
      if (currentIndent <= baseIndent) {
        endLine = i - 1;
        break;
      }
      endLine = i;
    }

    return endLine;
  }
}