import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Delete command
  let deleteDisposable = vscode.commands.registerCommand('variableFunctionDeleter.deleteAtCursor', () => {
    executeAction('delete');
  });

  // Cut command
  let cutDisposable = vscode.commands.registerCommand('variableFunctionDeleter.cutAtCursor', () => {
    executeAction('cut');
  });

  context.subscriptions.push(deleteDisposable, cutDisposable);
}

function executeAction(action: 'delete' | 'cut') {
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
      const text = document.getText(range);

      if (action === 'cut') {
        // Copy to clipboard before deleting
        vscode.env.clipboard.writeText(text);
      }

      editor.edit(editBuilder => {
        editBuilder.delete(range);
      });
    } else {
      vscode.window.showInformationMessage('No element found at cursor position');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error}`);
  }
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

  // Special handling for different file types
  if (languageId === 'json' || languageId === 'jsonc') {
    return getJsonPropertyRange(document, position, word);
  }

  // HTML/JSX/TSX support
  if (isHtmlLikeLanguage(languageId)) {
    const htmlRange = getHtmlElementRange(document, position, word, languageId);
    if (htmlRange) {
      return htmlRange;
    }
  }

  // Check in order of priority for other languages:
  // 1. Class definition
  // 2. Function
  // 3. Multiline string assignment
  // 4. Object key/property
  // 5. Class member (method or property)
  // 6. Variable

  const classRange = getClassRange(document, position, word, languageId);
  if (classRange) {
    return classRange;
  }

  const functionRange = getFunctionRange(document, position, word, languageId);
  if (functionRange) {
    return functionRange;
  }

  const multilineStringRange = getMultilineStringRange(document, position, word, languageId);
  if (multilineStringRange) {
    return multilineStringRange;
  }

  const objectKeyRange = getObjectKeyRange(document, position, word, languageId);
  if (objectKeyRange) {
    return objectKeyRange;
  }

  const classMemberRange = getClassMemberRange(document, position, word, languageId);
  if (classMemberRange) {
    return classMemberRange;
  }

  const variableRange = getVariableRange(document, position, word, languageId);
  if (variableRange) {
    return variableRange;
  }

  return null;
}

function isHtmlLikeLanguage(languageId: string): boolean {
  return ['html', 'xml', 'jsx', 'tsx', 'javascriptreact', 'typescriptreact', 'vue', 'svelte'].includes(languageId);
}

function getHtmlElementRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string,
  languageId: string
): vscode.Range | null {

  const line = document.lineAt(position.line);
  const lineText = line.text;
  const character = position.character;

  // Check if we're inside an HTML/JSX tag
  const tagInfo = findTagAtPosition(document, position, word);
  if (tagInfo) {
    return getCompleteTagRange(document, tagInfo, languageId);
  }

  return null;
}

function findTagAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string
): { tagName: string, startLine: number, startChar: number, isClosing: boolean } | null {

  const line = document.lineAt(position.line);
  const lineText = line.text;
  const character = position.character;

  // Look for tag patterns around the cursor position
  // Check if we're in an opening tag
  const openingTagPattern = /<(\w+)([^>]*)>/g;
  let match;

  while ((match = openingTagPattern.exec(lineText)) !== null) {
    const tagName = match[1];
    const tagStart = match.index;
    const tagEnd = match.index + match[0].length;

    // Check if cursor is within this tag and the word matches the tag name
    if (character >= tagStart && character <= tagEnd && tagName === word) {
      return {
        tagName: tagName,
        startLine: position.line,
        startChar: tagStart,
        isClosing: false
      };
    }
  }

  // Check if we're in a closing tag
  const closingTagPattern = /<\/(\w+)>/g;
  while ((match = closingTagPattern.exec(lineText)) !== null) {
    const tagName = match[1];
    const tagStart = match.index;
    const tagEnd = match.index + match[0].length;

    // Check if cursor is within this tag and the word matches the tag name
    if (character >= tagStart && character <= tagEnd && tagName === word) {
      return {
        tagName: tagName,
        startLine: position.line,
        startChar: tagStart,
        isClosing: true
      };
    }
  }

  // Check if we're in a self-closing tag
  const selfClosingTagPattern = /<(\w+)([^>]*)\s*\/>/g;
  while ((match = selfClosingTagPattern.exec(lineText)) !== null) {
    const tagName = match[1];
    const tagStart = match.index;
    const tagEnd = match.index + match[0].length;

    // Check if cursor is within this tag and the word matches the tag name
    if (character >= tagStart && character <= tagEnd && tagName === word) {
      // For self-closing tags, return the entire tag
      const startPos = new vscode.Position(position.line, tagStart);
      const endPos = new vscode.Position(position.line, tagEnd);
      return null; // We'll handle this directly
    }
  }

  // Search in surrounding lines for tag boundaries
  return findTagInSurroundingLines(document, position, word);
}

function findTagInSurroundingLines(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string
): { tagName: string, startLine: number, startChar: number, isClosing: boolean } | null {

  // Search backwards for opening tag
  for (let i = position.line; i >= Math.max(0, position.line - 20); i--) {
    const line = document.lineAt(i);
    const lineText = line.text;

    // Look for opening tag with our word
    const openingTagPattern = new RegExp(`<(${escapeRegExp(word)})([^>]*)>`, 'g');
    let match;

    while ((match = openingTagPattern.exec(lineText)) !== null) {
      const tagName = match[1];
      const tagStart = match.index;

      // Check if this tag contains our current position
      const tagRange = findTagEndFromStart(document, i, tagStart, tagName);
      if (tagRange && isPositionInRange(position, tagRange)) {
        return {
          tagName: tagName,
          startLine: i,
          startChar: tagStart,
          isClosing: false
        };
      }
    }
  }

  return null;
}

function findTagEndFromStart(
  document: vscode.TextDocument,
  startLine: number,
  startChar: number,
  tagName: string
): vscode.Range | null {

  const startPos = new vscode.Position(startLine, startChar);

  // Check if it's a self-closing tag first
  const startLineText = document.lineAt(startLine).text;
  const tagStartText = startLineText.substring(startChar);
  const selfClosingMatch = tagStartText.match(new RegExp(`<${escapeRegExp(tagName)}[^>]*\\s*\\/>`));

  if (selfClosingMatch) {
    const endPos = new vscode.Position(startLine, startChar + selfClosingMatch[0].length);
    return new vscode.Range(startPos, endPos);
  }

  // Look for closing tag
  const closingTag = `</${tagName}>`;
  let tagDepth = 1;

  // Start searching from the character after the opening tag
  let currentLine = startLine;
  let currentChar = startChar;

  // Skip the opening tag
  const openingTagMatch = startLineText.substring(startChar).match(new RegExp(`<${escapeRegExp(tagName)}[^>]*>`));
  if (openingTagMatch) {
    currentChar += openingTagMatch[0].length;
  }

  while (currentLine < document.lineCount) {
    const line = document.lineAt(currentLine);
    const lineText = line.text;
    const searchText = currentLine === startLine ? lineText.substring(currentChar) : lineText;
    const offset = currentLine === startLine ? currentChar : 0;

    // Find all opening and closing tags in this line
    const openingPattern = new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^>]*)?>`, 'g');
    const closingPattern = new RegExp(`<\\/${escapeRegExp(tagName)}>`, 'g');

    let match;
    const tags: { type: 'open' | 'close', index: number, length: number }[] = [];

    // Find opening tags
    while ((match = openingPattern.exec(searchText)) !== null) {
      // Skip self-closing tags
      if (!match[0].includes('/>')) {
        tags.push({ type: 'open', index: offset + match.index, length: match[0].length });
      }
    }

    // Find closing tags
    while ((match = closingPattern.exec(searchText)) !== null) {
      tags.push({ type: 'close', index: offset + match.index, length: match[0].length });
    }

    // Sort tags by position
    tags.sort((a, b) => a.index - b.index);

    // Process tags in order
    for (const tag of tags) {
      if (tag.type === 'open') {
        tagDepth++;
      } else if (tag.type === 'close') {
        tagDepth--;
        if (tagDepth === 0) {
          // Found matching closing tag
          const endPos = new vscode.Position(currentLine, tag.index + tag.length);
          return new vscode.Range(startPos, endPos);
        }
      }
    }

    currentLine++;
    currentChar = 0;
  }

  return null;
}

function isPositionInRange(position: vscode.Position, range: vscode.Range): boolean {
  return range.contains(position);
}

function getCompleteTagRange(
  document: vscode.TextDocument,
  tagInfo: { tagName: string, startLine: number, startChar: number, isClosing: boolean },
  languageId: string
): vscode.Range | null {

  if (tagInfo.isClosing) {
    // If we clicked on a closing tag, find the opening tag
    return findOpeningTagFromClosing(document, tagInfo);
  } else {
    // If we clicked on an opening tag, find the complete element
    return findTagEndFromStart(document, tagInfo.startLine, tagInfo.startChar, tagInfo.tagName);
  }
}

function findOpeningTagFromClosing(
  document: vscode.TextDocument,
  tagInfo: { tagName: string, startLine: number, startChar: number, isClosing: boolean }
): vscode.Range | null {

  const tagName = tagInfo.tagName;
  let tagDepth = 1;

  // Search backwards for the opening tag
  for (let i = tagInfo.startLine; i >= 0; i--) {
    const line = document.lineAt(i);
    const lineText = line.text;
    const searchText = i === tagInfo.startLine ? lineText.substring(0, tagInfo.startChar) : lineText;

    // Find all opening and closing tags in this line (in reverse order)
    const openingPattern = new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^>]*)?>`, 'g');
    const closingPattern = new RegExp(`<\\/${escapeRegExp(tagName)}>`, 'g');

    let match;
    const tags: { type: 'open' | 'close', index: number }[] = [];

    // Find opening tags
    while ((match = openingPattern.exec(searchText)) !== null) {
      // Skip self-closing tags
      if (!match[0].includes('/>')) {
        tags.push({ type: 'open', index: match.index });
      }
    }

    // Find closing tags
    while ((match = closingPattern.exec(searchText)) !== null) {
      tags.push({ type: 'close', index: match.index });
    }

    // Sort tags by position (reverse order for this line)
    tags.sort((a, b) => b.index - a.index);

    // Process tags in reverse order
    for (const tag of tags) {
      if (tag.type === 'close') {
        tagDepth++;
      } else if (tag.type === 'open') {
        tagDepth--;
        if (tagDepth === 0) {
          // Found matching opening tag
          return findTagEndFromStart(document, i, tag.index, tagName);
        }
      }
    }
  }

  return null;
}

function handleSelfClosingTag(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string
): vscode.Range | null {

  const line = document.lineAt(position.line);
  const lineText = line.text;

  const selfClosingPattern = new RegExp(`<(${escapeRegExp(word)})([^>]*\\s*\\/>)`, 'g');
  let match;

  while ((match = selfClosingPattern.exec(lineText)) !== null) {
    const tagStart = match.index;
    const tagEnd = match.index + match[0].length;

    if (position.character >= tagStart && position.character <= tagEnd) {
      const startPos = new vscode.Position(position.line, tagStart);
      const endPos = new vscode.Position(position.line, tagEnd);
      return new vscode.Range(startPos, endPos);
    }
  }

  return null;
}

// Keep all existing functions from the previous implementation...
// (getJsonPropertyRange, getClassRange, getFunctionRange, etc.)

function getJsonPropertyRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string
): vscode.Range | null {

  const line = document.lineAt(position.line);
  const lineText = line.text;

  // Check if we're on a JSON property key
  if (isJsonPropertyKey(lineText, word, position.character)) {
    return getJsonPropertyValueRange(document, position.line, word);
  }

  // Check if we're inside a JSON value that spans multiple lines
  const propertyInfo = findJsonPropertyFromValue(document, position, word);
  if (propertyInfo) {
    return propertyInfo.range;
  }

  return null;
}

function isJsonPropertyKey(lineText: string, word: string, character: number): boolean {
  // Check if the word is a JSON property key (quoted string followed by colon)
  const patterns = [
    new RegExp(`"${escapeRegExp(word)}"\\s*:`),  // "key":
    new RegExp(`'${escapeRegExp(word)}'\\s*:`),  // 'key': (for JSONC)
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

function findJsonPropertyFromValue(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string
): { range: vscode.Range } | null {

  // Search backwards to find the property key for this value
  for (let i = position.line; i >= Math.max(0, position.line - 10); i--) {
    const line = document.lineAt(i);
    const lineText = line.text;

    // Look for property patterns
    const propertyMatch = lineText.match(/"([^"]+)"\s*:/);
    if (propertyMatch) {
      const propertyKey = propertyMatch[1];
      if (propertyKey.includes(word) || lineText.includes(word)) {
        return {
          range: getJsonPropertyValueRange(document, i, propertyKey)
        };
      }
    }
  }

  return null;
}

function getJsonPropertyValueRange(
  document: vscode.TextDocument,
  startLine: number,
  propertyKey: string
): vscode.Range {

  const line = document.lineAt(startLine);
  const lineText = line.text;
  let endLine = startLine;

  // Find the colon position
  const colonIndex = lineText.indexOf(':', lineText.indexOf(`"${propertyKey}"`));
  if (colonIndex === -1) {
    // Fallback: use the entire line
    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(startLine, lineText.length);
    return new vscode.Range(startPos, endPos);
  }

  // Determine the value type and find its end
  const valueStart = colonIndex + 1;
  const valueText = lineText.substring(valueStart).trim();

  if (valueText.startsWith('{')) {
    // Object value
    endLine = findJsonObjectEnd(document, startLine, colonIndex);
  } else if (valueText.startsWith('[')) {
    // Array value
    endLine = findJsonArrayEnd(document, startLine, colonIndex);
  } else if (valueText.startsWith('"')) {
    // String value
    endLine = findJsonStringEnd(document, startLine, valueStart);
  } else {
    // Primitive value (number, boolean, null)
    endLine = findJsonPrimitiveEnd(document, startLine);
  }

  // Include trailing comma if present
  const endLineText = document.lineAt(endLine).text;
  let endCharacter = endLineText.length;

  // Check if there's a comma after the value on the same line or next line
  if (endLineText.trimEnd().endsWith(',')) {
    // Comma is on the same line
    endCharacter = endLineText.length;
  } else if (endLine + 1 < document.lineCount) {
    const nextLine = document.lineAt(endLine + 1);
    const nextLineText = nextLine.text.trim();
    if (nextLineText.startsWith(',')) {
      // Comma is on the next line
      endLine = endLine + 1;
      endCharacter = nextLine.text.indexOf(',') + 1;
    }
  }

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, endCharacter);

  return new vscode.Range(startPos, endPos);
}

function findJsonObjectEnd(
  document: vscode.TextDocument,
  startLine: number,
  colonIndex: number
): number {
  const startLineText = document.lineAt(startLine).text;
  const afterColon = startLineText.substring(colonIndex + 1);

  // Check if object starts and ends on the same line
  const openBraceIndex = afterColon.indexOf('{');
  if (openBraceIndex !== -1) {
    const closeBraceIndex = afterColon.lastIndexOf('}');
    if (closeBraceIndex > openBraceIndex) {
      return startLine; // Single line object
    }
  }

  // Multi-line object - find matching closing brace
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

function findJsonArrayEnd(
  document: vscode.TextDocument,
  startLine: number,
  colonIndex: number
): number {
  const startLineText = document.lineAt(startLine).text;
  const afterColon = startLineText.substring(colonIndex + 1);

  // Check if array starts and ends on the same line
  const openBracketIndex = afterColon.indexOf('[');
  if (openBracketIndex !== -1) {
    const closeBracketIndex = afterColon.lastIndexOf(']');
    if (closeBracketIndex > openBracketIndex) {
      return startLine; // Single line array
    }
  }

  // Multi-line array - find matching closing bracket
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

function findJsonStringEnd(
  document: vscode.TextDocument,
  startLine: number,
  valueStart: number
): number {
  const startLineText = document.lineAt(startLine).text;
  const afterValueStart = startLineText.substring(valueStart);

  // Find the opening quote
  const openQuoteIndex = afterValueStart.indexOf('"');
  if (openQuoteIndex === -1) {
    return startLine;
  }

  // Look for closing quote, handling escaped quotes
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
          return i; // Found closing quote
        }
      }
    }
  }

  return startLine;
}

function findJsonPrimitiveEnd(
  document: vscode.TextDocument,
  startLine: number
): number {
  const line = document.lineAt(startLine);
  const lineText = line.text;

  // For primitive values, they typically end at comma, closing brace, or end of line
  const commaIndex = lineText.indexOf(',');
  const braceIndex = lineText.indexOf('}');
  const bracketIndex = lineText.indexOf(']');

  // Find the earliest terminator
  const terminators = [commaIndex, braceIndex, bracketIndex].filter(index => index !== -1);

  if (terminators.length > 0) {
    return startLine; // Value ends on same line
  }

  // Check next lines for terminators
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

function getClassRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string,
  languageId: string
): vscode.Range | null {

  const line = document.lineAt(position.line);
  const lineText = line.text;

  // Check if current line contains class declaration
  const classPatterns = getClassPatterns(languageId);

  for (const pattern of classPatterns) {
    const match = lineText.match(pattern);
    if (match && lineText.includes(word)) {
      return getClassBodyRange(document, position.line, languageId);
    }
  }

  // Check previous lines for class declaration (in case cursor is inside class)
  for (let i = position.line - 1; i >= Math.max(0, position.line - 5); i--) {
    const prevLine = document.lineAt(i);
    for (const pattern of classPatterns) {
      const match = prevLine.text.match(pattern);
      if (match && prevLine.text.includes(word)) {
        return getClassBodyRange(document, i, languageId);
      }
    }
  }

  return null;
}

function getClassBodyRange(
  document: vscode.TextDocument,
  startLine: number,
  languageId: string
): vscode.Range {

  const useBraces = ['javascript', 'typescript', 'java', 'csharp', 'cpp', 'c', 'jsx', 'tsx', 'javascriptreact', 'typescriptreact'].includes(languageId);

  if (useBraces) {
    return getBracedBlockRangeForFunction(document, startLine);
  } else {
    return getIndentedBlockRange(document, startLine);
  }
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

  // Enhanced check for TypeScript/JavaScript functions with complex signatures
  if (['typescript', 'javascript', 'tsx', 'jsx', 'typescriptreact', 'javascriptreact'].includes(languageId)) {
    // Check for function keyword followed by the word we're looking for
    const functionKeywordPattern = new RegExp(`function\\s+${escapeRegExp(word)}\\s*[<(]`);
    if (functionKeywordPattern.test(lineText)) {
      return getFunctionBodyRange(document, position.line, languageId);
    }

    // Check for function with return type annotation
    const functionWithReturnTypePattern = new RegExp(`function\\s+${escapeRegExp(word)}\\s*\\([^)]*\\)\\s*:`);
    if (functionWithReturnTypePattern.test(lineText)) {
      return getFunctionBodyRange(document, position.line, languageId);
    }

    // Check for function with generic parameters
    const functionWithGenericsPattern = new RegExp(`function\\s+${escapeRegExp(word)}\\s*<[^>]*>\\s*\\(`);
    if (functionWithGenericsPattern.test(lineText)) {
      return getFunctionBodyRange(document, position.line, languageId);
    }

    // Check for function with default parameters
    const functionWithDefaultsPattern = new RegExp(`function\\s+${escapeRegExp(word)}\\s*\\([^)]*=\\s*[^)]*\\)`);
    if (functionWithDefaultsPattern.test(lineText)) {
      return getFunctionBodyRange(document, position.line, languageId);
    }

    // Check for function with complex return type
    const functionWithComplexReturnPattern = new RegExp(`function\\s+${escapeRegExp(word)}\\s*\\([^)]*\\)\\s*:\\s*\\{[^}]*\\}\\[\\]`);
    if (functionWithComplexReturnPattern.test(lineText)) {
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

    // Enhanced check for previous lines with TypeScript
    if (['typescript', 'javascript', 'tsx', 'jsx', 'typescriptreact', 'javascriptreact'].includes(languageId)) {
      const prevLineText = prevLine.text;
      const functionKeywordPattern = new RegExp(`function\\s+${escapeRegExp(word)}\\s*[<(]`);
      if (functionKeywordPattern.test(prevLineText)) {
        return getFunctionBodyRange(document, i, languageId);
      }
    }
  }

  return null;
}

function getFunctionBodyRange(document: vscode.TextDocument, startLine: number, languageId: string): vscode.Range {
  const useBraces = ['javascript', 'typescript', 'java', 'csharp', 'cpp', 'c', 'jsx', 'tsx', 'javascriptreact', 'typescriptreact'].includes(languageId);

  if (useBraces) {
    return getBracedBlockRangeForFunction(document, startLine);
  } else {
    return getIndentedBlockRange(document, startLine);
  }
}

function getBracedBlockRangeForFunction(document: vscode.TextDocument, startLine: number): vscode.Range {
  let currentLine = startLine;
  let foundOpenBrace = false;
  let braceStartLine = -1;

  // Search for the opening brace, considering multi-line function signatures
  while (currentLine < document.lineCount && currentLine < startLine + 20) {
    const line = document.lineAt(currentLine);
    const lineText = line.text;

    // Check if this line contains an opening brace
    if (lineText.includes('{')) {
      braceStartLine = currentLine;
      foundOpenBrace = true;
      break;
    }

    // If we encounter another function declaration or other constructs, stop searching
    if (currentLine > startLine) {
      const trimmedLine = lineText.trim();

      // Stop if we hit another function, class, or other major construct
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

      // Continue if line seems to be part of function signature
      if (trimmedLine === '' ||
        trimmedLine.includes(')') ||
        trimmedLine.includes(':') ||
        trimmedLine.includes(',') ||
        trimmedLine.includes('//') ||
        trimmedLine.includes('/*') ||
        trimmedLine.includes('*/') ||
        trimmedLine.includes('=>') ||
        trimmedLine.includes('[]') ||
        trimmedLine.includes('{}') ||
        trimmedLine.includes('=') ||
        trimmedLine.includes('|') ||
        trimmedLine.includes('&') ||
        trimmedLine.includes('<') ||
        trimmedLine.includes('>')) {
        // Continue searching - this looks like part of function signature
      } else {
        // This doesn't look like part of a function signature
        break;
      }
    }

    currentLine++;
  }

  if (!foundOpenBrace) {
    // This might be a function declaration without implementation
    // Find the end of the declaration (semicolon or end of signature)
    let endLine = startLine;
    for (let i = startLine; i < Math.min(document.lineCount, startLine + 15); i++) {
      const line = document.lineAt(i);
      const lineText = line.text;

      // Look for end of declaration
      if (lineText.includes(';')) {
        endLine = i;
        break;
      }

      // Check if this line seems to be part of the function signature
      const trimmedLine = lineText.trim();
      if (i > startLine && trimmedLine !== '' &&
        !trimmedLine.includes(')') &&
        !trimmedLine.includes(':') &&
        !trimmedLine.includes(',') &&
        !trimmedLine.includes('//') &&
        !trimmedLine.includes('/*') &&
        !trimmedLine.includes('*/') &&
        !trimmedLine.includes('=>') &&
        !trimmedLine.includes('[]') &&
        !trimmedLine.includes('{}') &&
        !trimmedLine.includes('=') &&
        !trimmedLine.includes('|') &&
        !trimmedLine.includes('&') &&
        !trimmedLine.includes('<') &&
        !trimmedLine.includes('>')) {
        endLine = i - 1;
        break;
      }

      endLine = i;
    }

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);
    return new vscode.Range(startPos, endPos);
  }

  // Find the matching closing brace
  const endLine = findMatchingBrace(document, braceStartLine, '{', '}');

  // Return range from the original start line to the closing brace
  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

  return new vscode.Range(startPos, endPos);
}


function getMultilineStringRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string,
  languageId: string
): vscode.Range | null {

  // Check if we're dealing with a variable that contains a multiline string
  const variableInfo = findVariableWithMultilineString(document, position, word, languageId);
  if (variableInfo) {
    return variableInfo.range;
  }

  return null;
}

function findVariableWithMultilineString(
  document: vscode.TextDocument,
  position: vscode.Position,
  word: string,
  languageId: string
): { range: vscode.Range, stringType: string } | null {

  // Search upwards from current position to find variable declaration
  for (let i = position.line; i >= Math.max(0, position.line - 10); i--) {
    const line = document.lineAt(i);
    const lineText = line.text;

    // Check if this line contains a variable declaration with our word
    const variablePatterns = getVariablePatterns(languageId);
    for (const pattern of variablePatterns) {
      const match = lineText.match(pattern);
      if (match && lineText.includes(word)) {
        // Found variable declaration, now check if it contains multiline string
        const stringInfo = detectMultilineStringAssignment(document, i, languageId);
        if (stringInfo) {
          return {
            range: stringInfo.range,
            stringType: stringInfo.stringType
          };
        }
      }
    }
  }

  return null;
}

function detectMultilineStringAssignment(
  document: vscode.TextDocument,
  startLine: number,
  languageId: string
): { range: vscode.Range, stringType: string } | null {

  const line = document.lineAt(startLine);
  const lineText = line.text;

  // Detect different types of multiline strings
  const stringPatterns = getMultilineStringPatterns(languageId);

  for (const pattern of stringPatterns) {
    const match = lineText.match(pattern.regex);
    if (match) {
      const stringRange = findMultilineStringEnd(document, startLine, pattern.delimiter, pattern.type);
      if (stringRange) {
        return {
          range: stringRange,
          stringType: pattern.type
        };
      }
    }
  }

  return null;
}

function findMultilineStringEnd(
  document: vscode.TextDocument,
  startLine: number,
  delimiter: string,
  stringType: string
): vscode.Range | null {

  const startLineText = document.lineAt(startLine).text;
  let endLine = startLine;
  let found = false;

  // Handle different string types
  switch (stringType) {
    case 'template':
      endLine = findTemplateStringEnd(document, startLine);
      found = endLine > startLine || startLineText.includes('`') && startLineText.lastIndexOf('`') > startLineText.indexOf('`');
      break;

    case 'multiline':
      endLine = findMultilineQuoteEnd(document, startLine, delimiter);
      found = endLine > startLine || (startLineText.split(delimiter).length - 1) >= 2;
      break;

    case 'heredoc':
      endLine = findHeredocEnd(document, startLine, delimiter);
      found = endLine > startLine;
      break;

    case 'raw':
      endLine = findRawStringEnd(document, startLine, delimiter);
      found = endLine > startLine;
      break;
  }

  if (found) {
    const startPos = new vscode.Position(startLine, 0);
    const endLineText = document.lineAt(endLine).text;
    const endPos = new vscode.Position(endLine, endLineText.length);
    return new vscode.Range(startPos, endPos);
  }

  return null;
}

function findTemplateStringEnd(document: vscode.TextDocument, startLine: number): number {
  const startLineText = document.lineAt(startLine).text;
  const firstBacktick = startLineText.indexOf('`');

  if (firstBacktick === -1) {
    return startLine;
  }

  // Check if template string ends on same line
  const lastBacktick = startLineText.lastIndexOf('`');
  if (lastBacktick > firstBacktick) {
    return startLine;
  }

  // Search for closing backtick in subsequent lines
  for (let i = startLine + 1; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;
    if (line.includes('`')) {
      return i;
    }
  }

  return startLine;
}

function findMultilineQuoteEnd(document: vscode.TextDocument, startLine: number, delimiter: string): number {
  const startLineText = document.lineAt(startLine).text;

  // Count delimiters on start line
  const startDelimiterCount = (startLineText.match(new RegExp(escapeRegExp(delimiter), 'g')) || []).length;

  // If even number of delimiters on start line, string is complete
  if (startDelimiterCount >= 2 && startDelimiterCount % 2 === 0) {
    return startLine;
  }

  // Search for closing delimiter
  for (let i = startLine + 1; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;
    if (line.includes(delimiter)) {
      return i;
    }
  }

  return startLine;
}

function findHeredocEnd(document: vscode.TextDocument, startLine: number, delimiter: string): number {
  // For heredoc syntax like <<EOF ... EOF
  for (let i = startLine + 1; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();
    if (line === delimiter) {
      return i;
    }
  }

  return startLine;
}

function findRawStringEnd(document: vscode.TextDocument, startLine: number, delimiter: string): number {
  // For raw strings like r"""...""" or R"(...)"
  const startLineText = document.lineAt(startLine).text;

  // Extract the closing pattern
  let closingPattern = delimiter;
  if (delimiter.includes('(')) {
    // C++ raw string R"delimiter(content)delimiter"
    const match = delimiter.match(/R"([^(]*)\(/);
    if (match) {
      closingPattern = ')' + match[1] + '"';
    }
  }

  // Check if it ends on the same line
  if (startLineText.includes(closingPattern) &&
    startLineText.lastIndexOf(closingPattern) > startLineText.indexOf(delimiter)) {
    return startLine;
  }

  // Search subsequent lines
  for (let i = startLine + 1; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;
    if (line.includes(closingPattern)) {
      return i;
    }
  }

  return startLine;
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

// Pattern functions
function getClassPatterns(languageId: string): RegExp[] {
  const patterns: { [key: string]: RegExp[] } = {
    'javascript': [
      /class\s+\w+/,
    ],
    'typescript': [
      /class\s+\w+/,
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /enum\s+\w+/,
      /namespace\s+\w+/,
      /module\s+\w+/,
      /abstract\s+class\s+\w+/,
    ],
    'jsx': [
      /class\s+\w+/,
    ],
    'tsx': [
      /class\s+\w+/,
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /enum\s+\w+/,
      /namespace\s+\w+/,
      /module\s+\w+/,
      /abstract\s+class\s+\w+/,
    ],
    'javascriptreact': [
      /class\s+\w+/,
    ],
    'typescriptreact': [
      /class\s+\w+/,
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /enum\s+\w+/,
      /namespace\s+\w+/,
      /module\s+\w+/,
      /abstract\s+class\s+\w+/,
    ],
    'python': [
      /class\s+\w+/,
    ],
    'java': [
      /(public|private|protected)?\s*(abstract)?\s*class\s+\w+/,
      /(public|private|protected)?\s*interface\s+\w+/,
      /(public|private|protected)?\s*enum\s+\w+/,
      /(public|private|protected)?\s*record\s+\w+/,
    ],
    'csharp': [
      /(public|private|protected|internal)?\s*(abstract|sealed)?\s*class\s+\w+/,
      /(public|private|protected|internal)?\s*interface\s+\w+/,
      /(public|private|protected|internal)?\s*enum\s+\w+/,
      /(public|private|protected|internal)?\s*struct\s+\w+/,
      /(public|private|protected|internal)?\s*record\s+\w+/,
    ],
    'cpp': [
      /class\s+\w+/,
      /struct\s+\w+/,
      /namespace\s+\w+/,
    ],
    'c': [
      /struct\s+\w+/,
      /union\s+\w+/,
      /enum\s+\w+/,
    ],
    'go': [
      /type\s+\w+\s+struct/,
      /type\s+\w+\s+interface/,
    ],
    'rust': [
      /struct\s+\w+/,
      /enum\s+\w+/,
      /trait\s+\w+/,
      /impl\s+\w+/,
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
      /\w+\s*=>\s*/,
      /async\s+function\s+\w+/,
      /export\s+function\s+\w+/,
      /export\s+async\s+function\s+\w+/
    ],
    'typescript': [
      /function\s+\w+/,
      /const\s+\w+\s*=\s*\(/,
      /let\s+\w+\s*=\s*\(/,
      /var\s+\w+\s*=\s*\(/,
      /\w+\s*:\s*function/,
      /\w+\s*:\s*\(/,
      /\w+\s*=>\s*/,
      /async\s+function\s+\w+/,
      /export\s+function\s+\w+/,
      /export\s+async\s+function\s+\w+/,
      // Enhanced TypeScript specific patterns
      /function\s+\w+\s*\(/,  // function name(
      /function\s+\w+\s*<.*>\s*\(/,  // function name<T>(
      /(public|private|protected)?\s*\w+\s*\(/,
      /(public|private|protected)?\s*async\s+\w+\s*\(/,
      /(public|private|protected)?\s*static\s+\w+\s*\(/,
      /(export\s+)?(async\s+)?function\s+\w+/,
      // Handle TypeScript function with return type and complex signatures
      /function\s+\w+\s*\([^)]*\)\s*:\s*[^{;]+/,
      // Handle function with generic types and complex return types
      /function\s+\w+\s*<[^>]*>\s*\([^)]*\)\s*:\s*[^{;]+/,
      // Handle functions with default parameters
      /function\s+\w+\s*\([^)]*=\s*[^)]*\)/,
    ],
    'jsx': [
      /function\s+\w+/,
      /const\s+\w+\s*=\s*\(/,
      /let\s+\w+\s*=\s*\(/,
      /var\s+\w+\s*=\s*\(/,
      /\w+\s*:\s*function/,
      /\w+\s*:\s*\(/,
      /\w+\s*=>\s*/,
      /async\s+function\s+\w+/,
      /export\s+function\s+\w+/,
      /export\s+async\s+function\s+\w+/
    ],
    'tsx': [
      /function\s+\w+/,
      /const\s+\w+\s*=\s*\(/,
      /let\s+\w+\s*=\s*\(/,
      /var\s+\w+\s*=\s*\(/,
      /\w+\s*:\s*function/,
      /\w+\s*:\s*\(/,
      /\w+\s*=>\s*/,
      /async\s+function\s+\w+/,
      /export\s+function\s+\w+/,
      /export\s+async\s+function\s+\w+/,
      // Enhanced TypeScript specific patterns
      /function\s+\w+\s*\(/,  // function name(
      /function\s+\w+\s*<.*>\s*\(/,  // function name<T>(
      /(public|private|protected)?\s*\w+\s*\(/,
      /(public|private|protected)?\s*async\s+\w+\s*\(/,
      /(public|private|protected)?\s*static\s+\w+\s*\(/,
      /(export\s+)?(async\s+)?function\s+\w+/,
      // Handle TypeScript function with return type and complex signatures
      /function\s+\w+\s*\([^)]*\)\s*:\s*[^{;]+/,
      // Handle function with generic types and complex return types
      /function\s+\w+\s*<[^>]*>\s*\([^)]*\)\s*:\s*[^{;]+/,
      // Handle functions with default parameters
      /function\s+\w+\s*\([^)]*=\s*[^)]*\)/,
    ],
    'javascriptreact': [
      /function\s+\w+/,
      /const\s+\w+\s*=\s*\(/,
      /let\s+\w+\s*=\s*\(/,
      /var\s+\w+\s*=\s*\(/,
      /\w+\s*:\s*function/,
      /\w+\s*:\s*\(/,
      /\w+\s*=>\s*/,
      /async\s+function\s+\w+/,
      /export\s+function\s+\w+/,
      /export\s+async\s+function\s+\w+/
    ],
    'typescriptreact': [
      /function\s+\w+/,
      /const\s+\w+\s*=\s*\(/,
      /let\s+\w+\s*=\s*\(/,
      /var\s+\w+\s*=\s*\(/,
      /\w+\s*:\s*function/,
      /\w+\s*:\s*\(/,
      /\w+\s*=>\s*/,
      /async\s+function\s+\w+/,
      /export\s+function\s+\w+/,
      /export\s+async\s+function\s+\w+/,
      // Enhanced TypeScript specific patterns
      /function\s+\w+\s*\(/,  // function name(
      /function\s+\w+\s*<.*>\s*\(/,  // function name<T>(
      /(public|private|protected)?\s*\w+\s*\(/,
      /(public|private|protected)?\s*async\s+\w+\s*\(/,
      /(public|private|protected)?\s*static\s+\w+\s*\(/,
      /(export\s+)?(async\s+)?function\s+\w+/,
      // Handle TypeScript function with return type and complex signatures
      /function\s+\w+\s*\([^)]*\)\s*:\s*[^{;]+/,
      // Handle function with generic types and complex return types
      /function\s+\w+\s*<[^>]*>\s*\([^)]*\)\s*:\s*[^{;]+/,
      // Handle functions with default parameters
      /function\s+\w+\s*\([^)]*=\s*[^)]*\)/,
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

function getMultilineStringPatterns(languageId: string): Array<{ regex: RegExp, delimiter: string, type: string }> {
  const patterns: { [key: string]: Array<{ regex: RegExp, delimiter: string, type: string }> } = {
    'javascript': [
      { regex: /`/, delimiter: '`', type: 'template' },
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /'/, delimiter: "'", type: 'multiline' }
    ],
    'typescript': [
      { regex: /`/, delimiter: '`', type: 'template' },
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /'/, delimiter: "'", type: 'multiline' }
    ],
    'jsx': [
      { regex: /`/, delimiter: '`', type: 'template' },
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /'/, delimiter: "'", type: 'multiline' }
    ],
    'tsx': [
      { regex: /`/, delimiter: '`', type: 'template' },
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /'/, delimiter: "'", type: 'multiline' }
    ],
    'javascriptreact': [
      { regex: /`/, delimiter: '`', type: 'template' },
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /'/, delimiter: "'", type: 'multiline' }
    ],
    'typescriptreact': [
      { regex: /`/, delimiter: '`', type: 'template' },
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /'/, delimiter: "'", type: 'multiline' }
    ],
    'python': [
      { regex: /"""/, delimiter: '"""', type: 'multiline' },
      { regex: /'''/, delimiter: "'''", type: 'multiline' },
      { regex: /r"""/, delimiter: '"""', type: 'raw' },
      { regex: /r'''/, delimiter: "'''", type: 'raw' },
      { regex: /f"""/, delimiter: '"""', type: 'multiline' },
      { regex: /f'''/, delimiter: "'''", type: 'multiline' }
    ],
    'java': [
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /"""/, delimiter: '"""', type: 'multiline' } // Java 15+ text blocks
    ],
    'csharp': [
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /@"/, delimiter: '"', type: 'raw' }
    ],
    'cpp': [
      { regex: /"/, delimiter: '"', type: 'multiline' },
      { regex: /R"[^(]*\(/, delimiter: 'R"(', type: 'raw' }
    ],
    'go': [
      { regex: /`/, delimiter: '`', type: 'raw' },
      { regex: /"/, delimiter: '"', type: 'multiline' }
    ],
    'rust': [
      { regex: /r#*"/, delimiter: '"', type: 'raw' },
      { regex: /"/, delimiter: '"', type: 'multiline' }
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
    'jsx': [
      /const\s+\w+/,
      /let\s+\w+/,
      /var\s+\w+/
    ],
    'tsx': [
      /const\s+\w+/,
      /let\s+\w+/,
      /var\s+\w+/
    ],
    'javascriptreact': [
      /const\s+\w+/,
      /let\s+\w+/,
      /var\s+\w+/
    ],
    'typescriptreact': [
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
    'jsx': [
      /\w+\s*:\s*/, // key: value
      /"\w+"\s*:\s*/, // "key": value
      /'\w+'\s*:\s*/, // 'key': value
      /\[\w+\]\s*:\s*/, // [key]: value
      /\w+\s*\(/, // method()
      /get\s+\w+/, // getter
      /set\s+\w+/, // setter
    ],
    'tsx': [
      /\w+\s*:\s*/, // key: value
      /"\w+"\s*:\s*/, // "key": value
      /'\w+'\s*:\s*/, // 'key': value
      /\[\w+\]\s*:\s*/, // [key]: value
      /\w+\s*\(/, // method()
      /get\s+\w+/, // getter
      /set\s+\w+/, // setter
      /\w+\?\s*:\s*/, // optional property
    ],
    'javascriptreact': [
      /\w+\s*:\s*/, // key: value
      /"\w+"\s*:\s*/, // "key": value
      /'\w+'\s*:\s*/, // 'key': value
      /\[\w+\]\s*:\s*/, // [key]: value
      /\w+\s*\(/, // method()
      /get\s+\w+/, // getter
      /set\s+\w+/, // setter
    ],
    'typescriptreact': [
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
    ],
    'jsonc': [
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
    'jsx': [
      /\w+\s*\(/, // method()
      /\w+\s*=/, // property =
      /get\s+\w+/, // getter
      /set\s+\w+/, // setter
      /static\s+\w+/, // static member
      /async\s+\w+/, // async method
    ],
    'tsx': [
      /(public|private|protected)?\s*\w+\s*\(/, // method with access modifier
      /(public|private|protected)?\s*\w+\s*[:=]/, // property with access modifier
      /(public|private|protected)?\s*static\s+\w+/, // static member
      /(public|private|protected)?\s*readonly\s+\w+/, // readonly property
      /(public|private|protected)?\s*get\s+\w+/, // getter
      /(public|private|protected)?\s*set\s+\w+/, // setter
      /(public|private|protected)?\s*async\s+\w+/, // async method
    ],
    'javascriptreact': [
      /\w+\s*\(/, // method()
      /\w+\s*=/, // property =
      /get\s+\w+/, // getter
      /set\s+\w+/, // setter
      /static\s+\w+/, // static member
      /async\s+\w+/, // async method
    ],
    'typescriptreact': [
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

// Helper functions
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  const classPatterns = getClassPatterns(document.languageId);

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
  let endCharacter = lineText.length;

  // Find the property key position to ensure we're working with the right property
  const propertyKeyPattern = new RegExp(`(['"]?)${escapeRegExp(propertyName)}\\1\\s*:`);
  const propertyMatch = lineText.match(propertyKeyPattern);

  if (!propertyMatch) {
    // Fallback: return entire line
    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(startLine, lineText.length);
    return new vscode.Range(startPos, endPos);
  }

  const colonIndex = lineText.indexOf(':', propertyMatch.index!);
  const valueStartIndex = colonIndex + 1;
  const valueText = lineText.substring(valueStartIndex).trim();

  // Determine value type and find its end
  if (valueText.startsWith('{')) {
    // Object value
    endLine = findMatchingBrace(document, startLine, '{', '}');
  } else if (valueText.startsWith('[')) {
    // Array value
    endLine = findMatchingBrace(document, startLine, '[', ']');
  } else if (valueText.includes('function') || valueText.includes('=>')) {
    // Function property - find end of function
    endLine = findFunctionPropertyEnd(document, startLine, languageId);
  } else {
    // Simple property - find comma or end of object
    const commaIndex = lineText.indexOf(',', colonIndex);
    if (commaIndex !== -1) {
      // Include the comma
      endCharacter = commaIndex + 1;
    } else {
      // Last property in object or multi-line
      endLine = findPropertyEnd(document, startLine);
    }
  }

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, endCharacter);

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

    // Handle strings to avoid counting braces inside strings
    let inString = false;
    let stringChar = '';
    let escaped = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      // Handle escape sequences
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      // Handle string boundaries
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

      // Only count braces outside of strings
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

  return startLine; // Fallback if no matching brace found
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

export function deactivate() { }