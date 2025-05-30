import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('variableFunctionDeleter.deleteAtCursor', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const document = editor.document;
    const position = editor.selection.active;
    const languageId = document.languageId;

    try {
      const range = getElementRange(document, position, languageId);
      if (range) {
        editor.edit(editBuilder => {
          editBuilder.delete(range);
        });
      } else {
        vscode.window.showInformationMessage('No variable, function, object key, or class member found at cursor position');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error: ${error}`);
    }
  });

  context.subscriptions.push(disposable);
}

function getElementRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  languageId: string
): vscode.Range | null {

  const wordRange = document.getWordRangeAtPosition(position);
  if (!wordRange) {
    return null;
  }

  const word = document.getText(wordRange);

  // Check in order of priority:
  // 1. Object key/property
  // 2. Class member (method or property)
  // 3. Function
  // 4. Variable

  const objectKeyRange = getObjectKeyRange(document, position, word, languageId);
  if (objectKeyRange) {
    return objectKeyRange;
  }

  const classMemberRange = getClassMemberRange(document, position, word, languageId);
  if (classMemberRange) {
    return classMemberRange;
  }

  const functionRange = getFunctionRange(document, position, word, languageId);
  if (functionRange) {
    return functionRange;
  }

  const variableRange = getVariableRange(document, position, word, languageId);
  if (variableRange) {
    return variableRange;
  }

  return null;
}

function getObjectKeyRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string,
  languageId: string
): vscode.Range | null {

  const line = document.lineAt(position.line);
  const lineText = line.text;

  // Check if we're inside an object literal
  if (!isInsideObjectLiteral(document, position)) {
    return null;
  }

  // Patterns for object keys/properties
  const objectKeyPatterns = getObjectKeyPatterns(languageId);

  for (const pattern of objectKeyPatterns) {
    const match = lineText.match(pattern);
    if (match && lineText.includes(word)) {
      return getObjectPropertyRange(document, position.line, word, languageId);
    }
  }

  return null;
}

function getClassMemberRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string,
  languageId: string
): vscode.Range | null {

  // Check if we're inside a class
  const classInfo = findContainingClass(document, position);
  if (!classInfo) {
    return null;
  }

  const line = document.lineAt(position.line);
  const lineText = line.text;

  // Check for class member patterns
  const classMemberPatterns = getClassMemberPatterns(languageId);

  for (const pattern of classMemberPatterns) {
    const match = lineText.match(pattern);
    if (match && lineText.includes(word)) {
      return getClassMemberBodyRange(document, position.line, word, languageId);
    }
  }

  // Check previous lines for member declaration (for multi-line members)
  for (let i = position.line - 1; i >= Math.max(classInfo.startLine, position.line - 5); i--) {
    const prevLine = document.lineAt(i);
    for (const pattern of classMemberPatterns) {
      const match = prevLine.text.match(pattern);
      if (match && prevLine.text.includes(word)) {
        return getClassMemberBodyRange(document, i, word, languageId);
      }
    }
  }

  return null;
}

function getFunctionRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string,
  languageId: string
): vscode.Range | null {

  const patterns = getFunctionPatterns(languageId);
  const line = document.lineAt(position.line);
  const lineText = line.text;

  // Check if current line contains function declaration
  for (const pattern of patterns) {
    const match = lineText.match(pattern);
    if (match && lineText.includes(word)) {
      return getFunctionBodyRange(document, position.line, languageId);
    }
  }

  // Check previous lines for function declaration
  for (let i = position.line - 1; i >= Math.max(0, position.line - 5); i--) {
    const prevLine = document.lineAt(i);
    for (const pattern of patterns) {
      const match = prevLine.text.match(pattern);
      if (match && prevLine.text.includes(word)) {
        return getFunctionBodyRange(document, i, languageId);
      }
    }
  }

  return null;
}

function getVariableRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string,
  languageId: string
): vscode.Range | null {

  const patterns = getVariablePatterns(languageId);

  // Start from current line and search upwards for variable declaration
  for (let i = position.line; i >= Math.max(0, position.line - 10); i--) {
    const line = document.lineAt(i);
    const lineText = line.text;

    for (const pattern of patterns) {
      const match = lineText.match(pattern);
      if (match && lineText.includes(word)) {
        return getVariableDeclarationRange(document, i, word, languageId);
      }
    }
  }

  return null;
}

function isInsideObjectLiteral(document: vscode.TextDocument, position: vscode.Position): boolean {
  let braceCount = 0;
  let foundOpenBrace = false;

  // Search backwards from current position to find opening brace
  for (let i = position.line; i >= Math.max(0, position.line - 20); i--) {
    const line = document.lineAt(i);
    const lineText = i === position.line ?
      line.text.substring(0, position.character) :
      line.text;

    // Count braces from right to left
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

function findContainingClass(document: vscode.TextDocument, position: vscode.Position): { startLine: number, endLine: number } | null {
  const classPatterns = [
    /class\s+\w+/,
    /interface\s+\w+/,
    /type\s+\w+\s*=/,
    /struct\s+\w+/
  ];

  let classStartLine = -1;

  // Search backwards for class declaration
  for (let i = position.line; i >= 0; i--) {
    const line = document.lineAt(i);
    const lineText = line.text;

    for (const pattern of classPatterns) {
      if (pattern.test(lineText)) {
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

  // Find class end
  const classEndLine = findBlockEnd(document, classStartLine);

  return {
    startLine: classStartLine,
    endLine: classEndLine
  };
}

function getObjectPropertyRange(
  document: vscode.TextDocument,
  startLine: number,
  propertyName: string,
  languageId: string
): vscode.Range {

  const line = document.lineAt(startLine);
  const lineText = line.text;
  let endLine = startLine;

  // Check if property has a complex value (object, array, function)
  if (lineText.includes('{') || lineText.includes('[') || lineText.includes('function') || lineText.includes('=>')) {
    if (lineText.includes('{')) {
      endLine = findMatchingBrace(document, startLine, '{', '}');
    } else if (lineText.includes('[')) {
      endLine = findMatchingBrace(document, startLine, '[', ']');
    } else {
      // Function property - find end of function
      endLine = findFunctionPropertyEnd(document, startLine, languageId);
    }
  } else {
    // Simple property - find comma or end of object
    const commaIndex = lineText.indexOf(',', lineText.indexOf(propertyName));
    if (commaIndex !== -1) {
      // Include the comma
      const startPos = new vscode.Position(startLine, 0);
      const endPos = new vscode.Position(startLine, commaIndex + 1);
      return new vscode.Range(startPos, endPos);
    } else {
      // Last property in object or multi-line
      endLine = findPropertyEnd(document, startLine);
    }
  }

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

  return new vscode.Range(startPos, endPos);
}

function getClassMemberBodyRange(
  document: vscode.TextDocument,
  startLine: number,
  memberName: string,
  languageId: string
): vscode.Range {

  const line = document.lineAt(startLine);
  const lineText = line.text;

  // Check if it's a method or property
  if (lineText.includes('(') && (lineText.includes('{') || !lineText.includes(';'))) {
    // Method - find the complete method body
    return getFunctionBodyRange(document, startLine, languageId);
  } else {
    // Property - find end of property declaration
    let endLine = startLine;

    if (lineText.includes('{') || lineText.includes('[')) {
      // Complex property value
      const openChar = lineText.includes('{') ? '{' : '[';
      const closeChar = openChar === '{' ? '}' : ']';
      endLine = findMatchingBrace(document, startLine, openChar, closeChar);
    } else if (lineText.includes(';')) {
      // Simple property with semicolon
      endLine = startLine;
    } else {
      // Multi-line property
      endLine = findPropertyEnd(document, startLine);
    }

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

    return new vscode.Range(startPos, endPos);
  }
}

function findMatchingBrace(
  document: vscode.TextDocument,
  startLine: number,
  openChar: string,
  closeChar: string
): number {
  let braceCount = 0;
  let foundOpen = false;

  for (let i = startLine; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;

    for (const char of line) {
      if (char === openChar) {
        braceCount++;
        foundOpen = true;
      } else if (char === closeChar) {
        braceCount--;
      }
    }

    if (foundOpen && braceCount === 0) {
      return i;
    }
  }

  return startLine;
}

function findFunctionPropertyEnd(
  document: vscode.TextDocument,
  startLine: number,
  languageId: string
): number {
  const line = document.lineAt(startLine);
  const lineText = line.text;

  if (lineText.includes('{')) {
    return findMatchingBrace(document, startLine, '{', '}');
  } else {
    // Arrow function or single line
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

function findBlockEnd(document: vscode.TextDocument, startLine: number): number {
  return findMatchingBrace(document, startLine, '{', '}');
}

function getFunctionBodyRange(document: vscode.TextDocument, startLine: number, languageId: string): vscode.Range {
  const useBraces = ['javascript', 'typescript', 'java', 'csharp', 'cpp', 'c'].includes(languageId);

  if (useBraces) {
    return getBracedBlockRange(document, startLine);
  } else {
    return getIndentedBlockRange(document, startLine);
  }
}

function getVariableDeclarationRange(
  document: vscode.TextDocument,
  startLine: number,
  variableName: string,
  languageId: string
): vscode.Range {

  const line = document.lineAt(startLine);
  let endLine = startLine;

  // For multi-line variable declarations (objects, arrays, etc.)
  if (line.text.includes('{') || line.text.includes('[')) {
    const openChar = line.text.includes('{') ? '{' : '[';
    const closeChar = openChar === '{' ? '}' : ']';
    endLine = findMatchingBrace(document, startLine, openChar, closeChar);
  } else {
    // Single line variable - find the semicolon or end of line
    const lineText = line.text;
    if (lineText.includes(';')) {
      endLine = startLine;
    } else {
      // Multi-line without braces, find next line that doesn't continue
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

function getBracedBlockRange(document: vscode.TextDocument, startLine: number): vscode.Range {
  const endLine = findMatchingBrace(document, startLine, '{', '}');

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

  return new vscode.Range(startPos, endPos);
}

function getIndentedBlockRange(document: vscode.TextDocument, startLine: number): vscode.Range {
  const startLineText = document.lineAt(startLine).text;
  const baseIndent = startLineText.length - startLineText.trimStart().length;
  let endLine = startLine;

  for (let i = startLine + 1; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const lineText = line.text;

    if (lineText.trim() === '') {
      continue; // Skip empty lines
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

function getObjectKeyPatterns(languageId: string): RegExp[] {
  const patterns: { [key: string]: RegExp[] } = {
    'javascript': [
      /\w+\s*:\s*/, // key: value
      /"\w+"\s*:\s*/, // "key": value
      /'\w+'\s*:\s*/, // 'key': value
      /\[\w+\]\s*:\s*/, // [key]: value
      /\w+\s*\(/, // method()
      /get\s+\w+/, // getter
      /set\s+\w+/, // setter
    ],
    'typescript': [
      /\w+\s*:\s*/, // key: value
      /"\w+"\s*:\s*/, // "key": value
      /'\w+'\s*:\s*/, // 'key': value
      /\[\w+\]\s*:\s*/, // [key]: value
      /\w+\s*\(/, // method()
      /get\s+\w+/, // getter
      /set\s+\w+/, // setter
      /\w+\?\s*:\s*/, // optional property
    ],
    'python': [
      /"\w+"\s*:\s*/, // "key": value
      /'\w+'\s*:\s*/, // 'key': value
    ],
    'json': [
      /"\w+"\s*:\s*/, // "key": value
    ]
  };

  return patterns[languageId] || patterns['javascript'];
}

function getClassMemberPatterns(languageId: string): RegExp[] {
  const patterns: { [key: string]: RegExp[] } = {
    'javascript': [
      /\w+\s*\(/, // method()
      /\w+\s*=/, // property =
      /get\s+\w+/, // getter
      /set\s+\w+/, // setter
      /static\s+\w+/, // static member
      /async\s+\w+/, // async method
    ],
    'typescript': [
      /(public|private|protected)?\s*\w+\s*\(/, // method with access modifier
      /(public|private|protected)?\s*\w+\s*[:=]/, // property with access modifier
      /(public|private|protected)?\s*static\s+\w+/, // static member
      /(public|private|protected)?\s*readonly\s+\w+/, // readonly property
      /(public|private|protected)?\s*get\s+\w+/, // getter
      /(public|private|protected)?\s*set\s+\w+/, // setter
      /(public|private|protected)?\s*async\s+\w+/, // async method
    ],
    'python': [
      /def\s+\w+/, // method
      /\w+\s*=/, // property
      /@property/, // property decorator
      /@\w+\.setter/, // setter decorator
      /@staticmethod/, // static method
      /@classmethod/, // class method
    ],
    'java': [
      /(public|private|protected)?\s*(static)?\s*(final)?\s*\w+\s+\w+\s*\(/, // method
      /(public|private|protected)?\s*(static)?\s*(final)?\s*\w+\s+\w+\s*[=;]/, // field
    ],
    'csharp': [
      /(public|private|protected|internal)?\s*(static)?\s*(virtual|override)?\s*\w+\s+\w+\s*\(/, // method
      /(public|private|protected|internal)?\s*(static)?\s*(readonly)?\s*\w+\s+\w+\s*[={]/, // property/field
      /(public|private|protected|internal)?\s*\w+\s+\w+\s*\{\s*(get|set)/, // auto-property
    ]
  };

  return patterns[languageId] || patterns['javascript'];
}

function getFunctionPatterns(languageId: string): RegExp[] {
  const patterns: { [key: string]: RegExp[] } = {
    'javascript': [
      /function\s+\w+/,
      /const\s+\w+\s*=\s*\(/,
      /let\s+\w+\s*=\s*\(/,
      /var\s+\w+\s*=\s*\(/,
      /\w+\s*:\s*function/,
      /\w+\s*:\s*\(/,
      /\w+\s*=>\s*/
    ],
    'typescript': [
      /function\s+\w+/,
      /const\s+\w+\s*=\s*\(/,
      /let\s+\w+\s*=\s*\(/,
      /var\s+\w+\s*=\s*\(/,
      /\w+\s*:\s*function/,
      /\w+\s*:\s*\(/,
      /\w+\s*=>\s*/,
      /(public|private|protected)?\s*\w+\s*\(/
    ],
    'python': [
      /def\s+\w+/,
      /async\s+def\s+\w+/
    ],
    'java': [
      /(public|private|protected)?\s*(static)?\s*\w+\s+\w+\s*\(/
    ],
    'csharp': [
      /(public|private|protected|internal)?\s*(static)?\s*\w+\s+\w+\s*\(/
    ]
  };

  return patterns[languageId] || patterns['javascript'];
}

function getVariablePatterns(languageId: string): RegExp[] {
  const patterns: { [key: string]: RegExp[] } = {
    'javascript': [
      /const\s+\w+/,
      /let\s+\w+/,
      /var\s+\w+/
    ],
    'typescript': [
      /const\s+\w+/,
      /let\s+\w+/,
      /var\s+\w+/
    ],
    'python': [
      /\w+\s*=/
    ],
    'java': [
      /(public|private|protected)?\s*(static)?\s*(final)?\s*\w+\s+\w+/
    ],
    'csharp': [
      /(public|private|protected|internal)?\s*(static)?\s*(readonly)?\s*\w+\s+\w+/
    ]
  };

  return patterns[languageId] || patterns['javascript'];
}

export function deactivate() { }