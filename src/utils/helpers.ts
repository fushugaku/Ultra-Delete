import * as vscode from 'vscode';
import { MultilineStringPattern } from '../languages/base/baseLanguage';

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getBracedBlockRangeForFunction(
  document: vscode.TextDocument,
  startLine: number
): vscode.Range {
  let currentLine = startLine;
  let foundOpenBrace = false;
  let braceStartLine = -1;

  // Search for the opening brace
  while (currentLine < document.lineCount && currentLine < startLine + 20) {
    const line = document.lineAt(currentLine);
    const lineText = line.text;

    if (lineText.includes('{')) {
      braceStartLine = currentLine;
      foundOpenBrace = true;
      break;
    }

    if (currentLine > startLine) {
      const trimmedLine = lineText.trim();
      if (trimmedLine.startsWith('function ') ||
        trimmedLine.startsWith('class ') ||
        trimmedLine.startsWith('interface ') ||
        trimmedLine.startsWith('type ') ||
        trimmedLine.startsWith('const ') ||
        trimmedLine.startsWith('let ') ||
        trimmedLine.startsWith('var ') ||
        trimmedLine.startsWith('export ') ||
        trimmedLine.startsWith('import ')) {
        break;
      }
    }

    currentLine++;
  }

  if (!foundOpenBrace) {
    let endLine = startLine;
    for (let i = startLine; i < Math.min(document.lineCount, startLine + 15); i++) {
      const line = document.lineAt(i);
      const lineText = line.text;

      if (lineText.includes(';')) {
        endLine = i;
        break;
      }

      const trimmedLine = lineText.trim();
      if (i > startLine && trimmedLine !== '' &&
        !trimmedLine.includes(')') &&
        !trimmedLine.includes(':') &&
        !trimmedLine.includes(',')) {
        endLine = i - 1;
        break;
      }

      endLine = i;
    }

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);
    return new vscode.Range(startPos, endPos);
  }

  const endLine = findMatchingBrace(document, braceStartLine, '{', '}');
  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

  return new vscode.Range(startPos, endPos);
}

export function getIndentedBlockRange(
  document: vscode.TextDocument,
  startLine: number
): vscode.Range {
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

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

  return new vscode.Range(startPos, endPos);
}

export function findMatchingBrace(
  document: vscode.TextDocument,
  startLine: number,
  openChar: string,
  closeChar: string
): number {
  let braceCount = 0;
  let foundOpen = false;

  for (let i = startLine; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;

    let inString = false;
    let stringChar = '';
    let escaped = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];

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

export function getVariableDeclarationRange(
  document: vscode.TextDocument,
  startLine: number,
  variableName: string
): vscode.Range {
  const line = document.lineAt(startLine);
  let endLine = startLine;

  if (line.text.includes('{') || line.text.includes('[')) {
    const openChar = line.text.includes('{') ? '{' : '[';
    const closeChar = openChar === '{' ? '}' : ']';
    endLine = findMatchingBrace(document, startLine, openChar, closeChar);
  } else {
    const lineText = line.text;
    if (lineText.includes(';')) {
      endLine = startLine;
    } else {
      for (let i = startLine + 1; i < document.lineCount; i++) {
        const nextLine = document.lineAt(i).text.trim();
        if (nextLine === '' || !nextLine.startsWith('.') && !nextLine.startsWith(',')) {
          endLine = i - 1;
          break;
        }
        endLine = i;
      }
    }
  }

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

  return new vscode.Range(startPos, endPos);
}

export function getObjectPropertyRange(
  document: vscode.TextDocument,
  startLine: number,
  propertyName: string
): vscode.Range {
  const line = document.lineAt(startLine);
  const lineText = line.text;
  let endLine = startLine;
  let endCharacter = lineText.length;

  const propertyKeyPattern = new RegExp(`(['"]?)${escapeRegExp(propertyName)}\\1\\s*:`);
  const propertyMatch = lineText.match(propertyKeyPattern);

  if (!propertyMatch) {
    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(startLine, lineText.length);
    return new vscode.Range(startPos, endPos);
  }

  const colonIndex = lineText.indexOf(':', propertyMatch.index!);
  const valueStartIndex = colonIndex + 1;
  const valueText = lineText.substring(valueStartIndex).trim();

  if (valueText.startsWith('{')) {
    endLine = findMatchingBrace(document, startLine, '{', '}');
  } else if (valueText.startsWith('[')) {
    endLine = findMatchingBrace(document, startLine, '[', ']');
  } else if (valueText.includes('function') || valueText.includes('=>')) {
    endLine = findFunctionPropertyEnd(document, startLine);
  } else {
    const commaIndex = lineText.indexOf(',', colonIndex);
    if (commaIndex !== -1) {
      endCharacter = commaIndex + 1;
    } else {
      endLine = findPropertyEnd(document, startLine);
    }
  }

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, endCharacter);

  return new vscode.Range(startPos, endPos);
}

export function getClassMemberBodyRange(
  document: vscode.TextDocument,
  startLine: number,
  memberName: string
): vscode.Range {
  const line = document.lineAt(startLine);
  const lineText = line.text;

  if (lineText.includes('(') && (lineText.includes('{') || !lineText.includes(';'))) {
    return getBracedBlockRangeForFunction(document, startLine);
  } else {
    let endLine = startLine;

    if (lineText.includes('{') || lineText.includes('[')) {
      const openChar = lineText.includes('{') ? '{' : '[';
      const closeChar = openChar === '{' ? '}' : ']';
      endLine = findMatchingBrace(document, startLine, openChar, closeChar);
    } else if (lineText.includes(';')) {
      endLine = startLine;
    } else {
      endLine = findPropertyEnd(document, startLine);
    }

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

    return new vscode.Range(startPos, endPos);
  }
}

export function findVariableWithMultilineString(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string,
  patterns: MultilineStringPattern[]
): { range: vscode.Range, stringType: string } | null {
  // Implementation for finding multiline strings
  // This would be similar to your existing implementation
  return null;
}

function findFunctionPropertyEnd(document: vscode.TextDocument, startLine: number): number {
  const line = document.lineAt(startLine);
  const lineText = line.text;

  if (lineText.includes('{')) {
    return findMatchingBrace(document, startLine, '{', '}');
  } else {
    for (let i = startLine; i < document.lineCount; i++) {
      const currentLine = document.lineAt(i).text;
      if (currentLine.includes(',') || currentLine.includes('}')) {
        return i;
      }
    }
  }

  return startLine;
}

function findPropertyEnd(document: vscode.TextDocument, startLine: number): number {
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