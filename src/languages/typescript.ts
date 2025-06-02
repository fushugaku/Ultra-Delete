// typescript.ts
import * as vscode from 'vscode';
import * as ts from 'typescript';
import { BaseLanguageHandler, ElementType } from './base/baseLanguage';

export class TypeScriptHandler extends BaseLanguageHandler {
  languageIds = ['typescript'];

  private getElementRangeUsingAST(
    document: vscode.TextDocument,
    position: vscode.Position,
    targetKinds: ts.SyntaxKind[]
  ): vscode.Range | null {
    try {
      const sourceFile = this.createSourceFile(document);
      const offset = document.offsetAt(position);

      // Find the node that directly contains the cursor position
      const node = this.findDirectNodeAtPosition(sourceFile, offset, targetKinds);
      if (!node) {
        return null;
      }

      return this.getNodeRange(document, node);
    } catch (error) {
      console.error('Error parsing TypeScript:', error);
      return null;
    }
  }

  private createSourceFile(document: vscode.TextDocument): ts.SourceFile {
    return ts.createSourceFile(
      document.fileName,
      document.getText(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
  }

  private findDirectNodeAtPosition(
    node: ts.Node,
    position: number,
    targetKinds: ts.SyntaxKind[]
  ): ts.Node | null {
    // Find the deepest node that contains the position
    const containingNode = this.findDeepestContainingNode(node, position);
    if (!containingNode) {
      return null;
    }

    // Walk up the tree to find the first node that matches our target kinds
    let current: ts.Node | undefined = containingNode;
    while (current) {
      if (targetKinds.includes(current.kind)) {
        // Additional validation to ensure we're at the right scope level
        if (this.isValidScopeForPosition(current, position)) {
          return current;
        }
      }
      current = current.parent;
    }

    return null;
  }


  private isCursorOnObjectProperty(node: ts.Node, position: number): boolean {
    if (ts.isPropertyAssignment(node)) {
      const name = node.name;
      if (name) {
        const nameStart = name.getStart();
        const nameEnd = name.getEnd();

        // Check if cursor is on the property name
        if (position >= nameStart && position <= nameEnd) {
          return true;
        }

        // Also allow if cursor is on the colon or just after it
        const colonPos = this.findColonAfterPropertyName(node);
        if (colonPos !== -1 && position >= nameEnd && position <= colonPos + 1) {
          return true;
        }
      }
      return false;
    }

    if (ts.isShorthandPropertyAssignment(node)) {
      const name = node.name;
      if (name) {
        const nameStart = name.getStart();
        const nameEnd = name.getEnd();
        return position >= nameStart && position <= nameEnd;
      }
    }

    if (ts.isPropertySignature(node) || ts.isMethodSignature(node)) {
      const name = node.name;
      if (name) {
        const nameStart = name.getStart();
        const nameEnd = name.getEnd();
        return position >= nameStart && position <= nameEnd;
      }
    }

    return true;
  }

  private findColonAfterPropertyName(node: ts.PropertyAssignment): number {
    const sourceFile = node.getSourceFile();
    const text = sourceFile.text;
    const nameEnd = node.name.getEnd();
    const valueStart = node.initializer.getStart();

    // Look for colon between name and value
    const searchText = text.substring(nameEnd, valueStart);
    const colonIndex = searchText.indexOf(':');

    return colonIndex !== -1 ? nameEnd + colonIndex : -1;
  }

  // Update the getPropertyRange method to handle nested objects better:
  private getPropertyRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    if (ts.isPropertyAssignment(node)) {
      // Get the full property including value and trailing comma
      const start = document.positionAt(node.getStart());
      let end = document.positionAt(node.getEnd());

      // Check if the property value is an object literal
      if (ts.isObjectLiteralExpression(node.initializer)) {
        // For object values, include the entire object
        end = document.positionAt(node.initializer.getEnd());
      }

      // Try to include trailing comma
      const line = document.lineAt(end.line);
      const textAfterNode = line.text.substring(end.character);
      const commaMatch = textAfterNode.match(/^\s*,/);
      if (commaMatch) {
        end = new vscode.Position(end.line, end.character + commaMatch[0].length);
      }

      return new vscode.Range(start, end);
    }

    if (ts.isShorthandPropertyAssignment(node)) {
      const start = document.positionAt(node.getStart());
      let end = document.positionAt(node.getEnd());

      // Try to include trailing comma
      const line = document.lineAt(end.line);
      const textAfterNode = line.text.substring(end.character);
      const commaMatch = textAfterNode.match(/^\s*,/);
      if (commaMatch) {
        end = new vscode.Position(end.line, end.character + commaMatch[0].length);
      }

      return new vscode.Range(start, end);
    }

    // Default case
    return this.nodeToRange(document, node);
  }

  // Add a method to specifically detect object literal properties at any nesting level:


  private findObjectPropertyAtPosition(node: ts.Node, position: number): ts.Node | null {
    // Check if position is within this node
    if (position < node.getStart() || position > node.getEnd()) {
      return null;
    }

    // If this is a property assignment/shorthand property, check if cursor is on the key
    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      if (this.isCursorOnObjectProperty(node, position)) {
        return node;
      }
    }

    // Recursively check children, prioritizing object properties
    let bestMatch: ts.Node | null = null;

    ts.forEachChild(node, (child) => {
      const childResult = this.findObjectPropertyAtPosition(child, position);
      if (childResult) {
        // Prefer more specific (smaller) matches
        if (!bestMatch || (childResult.getEnd() - childResult.getStart()) < (bestMatch.getEnd() - bestMatch.getStart())) {
          bestMatch = childResult;
        }
      }
    });

    return bestMatch;
  }

  private findDeepestContainingNode(node: ts.Node, position: number): ts.Node | null {
    // Check if position is within this node
    if (position < node.getStart() || position > node.getEnd()) {
      return null;
    }

    // Check children first (depth-first search)
    let deepestChild: ts.Node | null = null;
    ts.forEachChild(node, (child) => {
      const childResult = this.findDeepestContainingNode(child, position);
      if (childResult) {
        deepestChild = childResult;
      }
    });

    // Return the deepest child if found, otherwise this node
    return deepestChild || node;
  }



  private isCursorOnFunctionDeclaration(node: ts.Node, position: number): boolean {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      // Check if cursor is on the function keyword or name
      const functionKeywordStart = node.getStart();
      const nameEnd = node.name ? node.name.getEnd() : node.getStart() + 8; // "function".length
      return position >= functionKeywordStart && position <= nameEnd;
    }

    if (ts.isArrowFunction(node)) {
      // For arrow functions, check if cursor is on parameters or before =>
      const arrowToken = node.getChildren().find(child => child.kind === ts.SyntaxKind.EqualsGreaterThanToken);
      if (arrowToken) {
        return position <= arrowToken.getStart();
      }
    }

    return true;
  }

  private isCursorOnMethodDeclaration(node: ts.Node, position: number): boolean {
    if (ts.isMethodDeclaration(node)) {
      // Check if cursor is on method name or before the opening brace
      const name = node.name;
      if (name) {
        const nameStart = name.getStart();
        const nameEnd = name.getEnd();

        // Find the opening brace of the method body
        const openBrace = node.getChildren().find(child => child.kind === ts.SyntaxKind.OpenBraceToken);
        const beforeBody = openBrace ? openBrace.getStart() : nameEnd;

        return position >= nameStart && position <= beforeBody;
      }
    }
    return true;
  }

  private isCursorOnVariableName(node: ts.Node, position: number): boolean {
    if (ts.isVariableDeclaration(node)) {
      const name = node.name;
      if (name) {
        const nameStart = name.getStart();
        const nameEnd = name.getEnd();
        return position >= nameStart && position <= nameEnd;
      }
    }
    return true;
  }

  // typescript.ts - Add this helper method:

  private isCursorOnKeywordOnly(position: number, keywordStart: number, keywordEnd: number, sourceText: string): boolean {
    // Check if cursor is within the keyword bounds
    if (position < keywordStart || position > keywordEnd) {
      return false;
    }

    // Additional check: make sure we're not inside a string or comment
    const charAtPosition = sourceText[position];
    const charBefore = position > 0 ? sourceText[position - 1] : '';
    const charAfter = position < sourceText.length - 1 ? sourceText[position + 1] : '';

    // Simple heuristic: if surrounded by quotes, we're probably in a string
    if ((charBefore === '"' || charBefore === "'" || charBefore === '`') ||
      (charAfter === '"' || charAfter === "'" || charAfter === '`')) {
      return false;
    }

    return true;
  }

  // Update isCursorOnConditionalKeyword to use this:


  // typescript.ts - Update the isCursorOnConditionalKeyword method:

  private isCursorOnConditionalKeyword(node: ts.Node, position: number): boolean {
    if (!ts.isIfStatement(node)) {
      return false; // Changed from true to false
    }

    const sourceFile = node.getSourceFile();
    const text = sourceFile.text;

    // Check if cursor is on the main "if" keyword (be more precise)
    const ifKeywordStart = node.getStart();
    const ifKeywordEnd = ifKeywordStart + 2; // "if".length
    if (position >= ifKeywordStart && position <= ifKeywordEnd) {
      return true;
    }

    // Get the condition part to avoid matching inside the condition
    const condition = node.expression;
    const conditionStart = condition.getStart();

    // If cursor is inside the condition or after it, don't match
    if (position >= conditionStart) {
      // Check if we're specifically on else/else if keywords
      return this.isCursorOnElseKeywords(node, position, text);
    }

    return false;
  }

  private isCursorOnElseKeywords(ifStatement: ts.IfStatement, position: number, sourceText: string): boolean {
    let current: ts.IfStatement = ifStatement;

    // Walk through the if-else chain to find else/else if keywords
    while (current) {
      const elseStatement = current.elseStatement;
      if (!elseStatement) break;

      // Find the "else" keyword position
      const elseKeywordPos = this.findElseKeywordPosition(current, sourceText);
      if (elseKeywordPos !== -1) {
        // Check if cursor is specifically on "else" keyword (with some tolerance)
        const elseKeywordEnd = elseKeywordPos + 4; // "else".length
        if (position >= elseKeywordPos && position <= elseKeywordEnd) {
          return true;
        }

        // If else statement is another if statement, check for "else if"
        if (ts.isIfStatement(elseStatement)) {
          const elseIfStart = elseStatement.getStart();
          const elseIfEnd = elseIfStart + 2; // "if".length after "else "

          // Be more precise - only match if cursor is exactly on the "if" part of "else if"
          if (position >= elseIfStart && position <= elseIfEnd) {
            return true;
          }
          current = elseStatement;
        } else {
          // This is a final else block
          break;
        }
      } else {
        break;
      }
    }

    return false;
  }

  // Also update the findElseKeywordPosition to be more precise:
  private findElseKeywordPosition(ifStatement: ts.IfStatement, sourceText: string): number {
    if (!ifStatement.elseStatement) {
      return -1;
    }

    // Find the end of the if statement's then statement
    const thenStatement = ifStatement.thenStatement;
    const thenEnd = thenStatement.getEnd();

    // Look for "else" keyword after the then statement
    const searchStart = thenEnd;
    const searchEnd = ifStatement.elseStatement.getStart();
    const searchText = sourceText.substring(searchStart, searchEnd);

    // Be more precise with the regex to avoid false matches
    const elseMatch = searchText.match(/^\s*else\b/);
    if (elseMatch && elseMatch.index !== undefined) {
      return searchStart + elseMatch.index + elseMatch[0].indexOf('else');
    }

    return -1;
  }



  private getFunctionNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For functions, include any leading comments or decorators
    let start = node.getStart();

    // Check for leading trivia (comments, etc.)
    const fullStart = node.getFullStart();
    if (fullStart < start) {
      const leadingTrivia = node.getSourceFile().text.substring(fullStart, start);
      if (leadingTrivia.trim()) {
        start = fullStart;
      }
    }

    return new vscode.Range(
      document.positionAt(start),
      document.positionAt(node.getEnd())
    );
  }



  private getClassMemberNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For class members, include any decorators and modifiers but don't expand to class level
    return this.nodeToRange(document, node);
  }

  private findAncestorOfKind(node: ts.Node, kind: ts.SyntaxKind): ts.Node | null {
    let current = node.parent;
    while (current) {
      if (current.kind === kind) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  private nodeToRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    const start = document.positionAt(node.getStart());
    const end = document.positionAt(node.getEnd());
    return new vscode.Range(start, end);
  }

  // Update the priority order in elementDetector for TypeScript
  getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.ClassDeclaration,
      ts.SyntaxKind.InterfaceDeclaration,
      ts.SyntaxKind.TypeAliasDeclaration,
      ts.SyntaxKind.EnumDeclaration,
      ts.SyntaxKind.ModuleDeclaration,
      ts.SyntaxKind.NamespaceExportDeclaration
    ]);
  }

  getFunctionRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.FunctionDeclaration,
      ts.SyntaxKind.ArrowFunction,
      ts.SyntaxKind.FunctionExpression
    ]);
  }

  getVariableRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.VariableStatement,
      ts.SyntaxKind.VariableDeclaration
    ]);
  }



  getClassMemberRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.MethodDeclaration,
      ts.SyntaxKind.PropertyDeclaration,
      ts.SyntaxKind.GetAccessor,
      ts.SyntaxKind.SetAccessor,
      ts.SyntaxKind.Constructor
    ]);
  }

  getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.TemplateExpression,
      ts.SyntaxKind.NoSubstitutionTemplateLiteral,
      ts.SyntaxKind.StringLiteral
    ]);
  }



  // typescript.ts - Add these methods to your TypeScriptHandler class

  // Add to the existing TypeScriptHandler class:

  getConditionalBlockRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.IfStatement
    ]);
  }

  // Update the existing methods to include conditional detection






  private getConditionalNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For if statements, include the entire if-else if-else chain
    if (ts.isIfStatement(node)) {
      // Find the root if statement (in case we're on an else if)
      let rootIf = node;
      let parent = node.parent;

      // Walk up to find the root if statement
      while (parent && ts.isIfStatement(parent) && parent.elseStatement === rootIf) {
        rootIf = parent;
        parent = parent.parent;
      }

      return this.nodeToRange(document, rootIf);
    }

    return this.nodeToRange(document, node);
  }

  // Update the getNodeRange method to handle conditional statements
  private getNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
        return this.getConditionalNodeRange(document, node);

      case ts.SyntaxKind.VariableDeclaration:
        const statement = this.findAncestorOfKind(node, ts.SyntaxKind.VariableStatement);
        if (statement) {
          return this.nodeToRange(document, statement);
        }
        break;

      case ts.SyntaxKind.PropertyAssignment:
      case ts.SyntaxKind.ShorthandPropertyAssignment:
      case ts.SyntaxKind.PropertySignature:
        return this.getPropertyRange(document, node);

      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.Constructor:
        return this.getClassMemberNodeRange(document, node);

      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
        return this.getFunctionNodeRange(document, node);

      default:
        return this.nodeToRange(document, node);
    }

    return this.nodeToRange(document, node);
  }






  // typescript.ts - Replace the object property detection methods:

  getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // First try AST-based detection
    const astRange = this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.PropertyAssignment,
      ts.SyntaxKind.ShorthandPropertyAssignment,
      ts.SyntaxKind.PropertySignature,
      ts.SyntaxKind.MethodSignature
    ]);

    if (astRange) {
      return astRange;
    }

    // Fallback to text-based detection for complex nested objects
    return this.getObjectPropertyByTextAnalysis(document, position, word);
  }

  getNestedObjectPropertyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Try text-based analysis first for nested objects
    const textRange = this.getObjectPropertyByTextAnalysis(document, position, word);
    if (textRange) {
      return textRange;
    }

    // Fallback to AST
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.PropertyAssignment,
      ts.SyntaxKind.ShorthandPropertyAssignment,
      ts.SyntaxKind.PropertySignature
    ]);
  }



  private findPropertyAtPosition(lineText: string, cursorChar: number): { keyStart: number, keyEnd: number, key: string } | null {
    // Patterns to match object properties:
    // "key": value
    // 'key': value  
    // key: value
    const patterns = [
      /"([^"]+)"\s*:/g,  // "key":
      /'([^']+)'\s*:/g,  // 'key':
      /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g  // key:
    ];

    for (const pattern of patterns) {
      pattern.lastIndex = 0; // Reset regex
      let match;

      while ((match = pattern.exec(lineText)) !== null) {
        const fullMatch = match[0];
        const key = match[1];
        const matchStart = match.index;
        const keyStart = matchStart + (fullMatch.indexOf(key));
        const keyEnd = keyStart + key.length;

        // Check if cursor is within this key
        if (cursorChar >= keyStart && cursorChar <= keyEnd) {
          return { keyStart, keyEnd, key };
        }
      }
    }

    return null;
  }

  private getCompletePropertyRange(
    document: vscode.TextDocument,
    startLine: number,
    keyStartChar: number,
    key: string
  ): vscode.Range | null {
    const startPos = new vscode.Position(startLine, keyStartChar);

    // Find the end of this property by looking for the value
    const endPos = this.findPropertyEndPosition(document, startLine, keyStartChar, key);
    if (!endPos) {
      return null;
    }

    return new vscode.Range(startPos, endPos);
  }

  private findPropertyEndPosition(
    document: vscode.TextDocument,
    startLine: number,
    keyStartChar: number,
    key: string
  ): vscode.Position | null {
    const startLineText = document.lineAt(startLine).text;

    // Find the colon after the key
    const colonIndex = this.findColonAfterKey(startLineText, keyStartChar, key);
    if (colonIndex === -1) {
      return null;
    }

    // Start searching for the value after the colon
    let currentLine = startLine;
    let currentChar = colonIndex + 1;

    // Skip whitespace after colon
    while (currentChar < startLineText.length && /\s/.test(startLineText[currentChar])) {
      currentChar++;
    }

    if (currentChar >= startLineText.length) {
      // Value might be on next line
      currentLine++;
      if (currentLine >= document.lineCount) {
        return null;
      }
      currentChar = 0;
      const nextLineText = document.lineAt(currentLine).text;
      while (currentChar < nextLineText.length && /\s/.test(nextLineText[currentChar])) {
        currentChar++;
      }
    }

    // Determine value type and find its end
    const currentLineText = document.lineAt(currentLine).text;
    const valueChar = currentLineText[currentChar];

    if (valueChar === '{') {
      // Object value - find matching closing brace
      return this.findMatchingBrace(document, currentLine, currentChar, '{', '}');
    } else if (valueChar === '[') {
      // Array value - find matching closing bracket
      return this.findMatchingBrace(document, currentLine, currentChar, '[', ']');
    } else if (valueChar === '"' || valueChar === "'" || valueChar === '`') {
      // String value - find closing quote
      return this.findClosingQuote(document, currentLine, currentChar, valueChar);
    } else {
      // Primitive value - find comma or end of object
      return this.findPrimitiveValueEnd(document, currentLine, currentChar);
    }
  }

  private findColonAfterKey(lineText: string, keyStart: number, key: string): number {
    // Look for colon after the key, accounting for quotes
    let searchStart = keyStart + key.length;

    // If key was quoted, skip the closing quote
    if (keyStart > 0 && (lineText[keyStart - 1] === '"' || lineText[keyStart - 1] === "'")) {
      searchStart++;
    }

    // Skip whitespace
    while (searchStart < lineText.length && /\s/.test(lineText[searchStart])) {
      searchStart++;
    }

    if (searchStart < lineText.length && lineText[searchStart] === ':') {
      return searchStart;
    }

    return -1;
  }

  private findMatchingBrace(
    document: vscode.TextDocument,
    startLine: number,
    startChar: number,
    openChar: string,
    closeChar: string
  ): vscode.Position | null {
    let braceCount = 0;
    let currentLine = startLine;
    let currentChar = startChar;

    while (currentLine < document.lineCount) {
      const lineText = document.lineAt(currentLine).text;

      while (currentChar < lineText.length) {
        const char = lineText[currentChar];

        if (char === openChar) {
          braceCount++;
        } else if (char === closeChar) {
          braceCount--;
          if (braceCount === 0) {
            // Found matching brace, now look for trailing comma
            return this.findEndWithComma(document, currentLine, currentChar + 1);
          }
        }

        currentChar++;
      }

      currentLine++;
      currentChar = 0;
    }

    return null;
  }

  private findClosingQuote(
    document: vscode.TextDocument,
    startLine: number,
    startChar: number,
    quoteChar: string
  ): vscode.Position | null {
    let currentLine = startLine;
    let currentChar = startChar + 1; // Skip opening quote

    while (currentLine < document.lineCount) {
      const lineText = document.lineAt(currentLine).text;

      while (currentChar < lineText.length) {
        const char = lineText[currentChar];

        if (char === quoteChar && lineText[currentChar - 1] !== '\\') {
          // Found closing quote, now look for trailing comma
          return this.findEndWithComma(document, currentLine, currentChar + 1);
        }

        currentChar++;
      }

      currentLine++;
      currentChar = 0;
    }

    return null;
  }

  private findPrimitiveValueEnd(
    document: vscode.TextDocument,
    startLine: number,
    startChar: number
  ): vscode.Position | null {
    let currentLine = startLine;
    let currentChar = startChar;

    const lineText = document.lineAt(currentLine).text;

    // Find comma, closing brace, or end of line
    while (currentChar < lineText.length) {
      const char = lineText[currentChar];

      if (char === ',' || char === '}' || char === ']') {
        if (char === ',') {
          return new vscode.Position(currentLine, currentChar + 1);
        } else {
          return new vscode.Position(currentLine, currentChar);
        }
      }

      currentChar++;
    }

    // Value continues to end of line
    return new vscode.Position(currentLine, lineText.length);
  }

  private findEndWithComma(
    document: vscode.TextDocument,
    line: number,
    startChar: number
  ): vscode.Position {
    const lineText = document.lineAt(line).text;
    let currentChar = startChar;

    // Skip whitespace
    while (currentChar < lineText.length && /\s/.test(lineText[currentChar])) {
      currentChar++;
    }

    // Include comma if present
    if (currentChar < lineText.length && lineText[currentChar] === ',') {
      return new vscode.Position(line, currentChar + 1);
    }

    return new vscode.Position(line, startChar);
  }

  // Update the isValidScopeForPosition to be less restrictive for object properties
  private isValidScopeForPosition(node: ts.Node, position: number): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
        return this.isCursorOnConditionalKeyword(node, position);

      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
        return this.isCursorOnFunctionDeclaration(node, position);

      case ts.SyntaxKind.MethodDeclaration:
        return this.isCursorOnMethodDeclaration(node, position);

      case ts.SyntaxKind.VariableDeclaration:
        return this.isCursorOnVariableName(node, position);

      case ts.SyntaxKind.PropertyAssignment:
      case ts.SyntaxKind.ShorthandPropertyAssignment:
      case ts.SyntaxKind.PropertySignature:
      case ts.SyntaxKind.MethodSignature:
        // For object properties, be more lenient - allow if cursor is anywhere on the property
        return true;

      default:
        return true;
    }
  }



  // typescript.ts - Replace the entire getObjectPropertyByTextAnalysis method and helpers:

  private getObjectPropertyByTextAnalysis(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string
  ): vscode.Range | null {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const cursorChar = position.character;

    // Find the property key at cursor position
    const propertyMatch = this.findPropertyAtCursor(lineText, cursorChar);
    if (!propertyMatch) {
      return null;
    }

    const { propertyStart, propertyEnd } = propertyMatch;

    // Find the complete property range including its value
    return this.getCompletePropertyRangeFromStart(document, position.line, propertyStart, propertyEnd);
  }

  private findPropertyAtCursor(lineText: string, cursorChar: number): { propertyStart: number, propertyEnd: number } | null {
    // Look for property patterns around the cursor
    const beforeCursor = lineText.substring(0, cursorChar + 1);
    const afterCursor = lineText.substring(cursorChar);

    // Find the start of the property key (including quotes if present)
    let propertyStart = -1;
    let propertyEnd = -1;

    // Look backwards for the start of the key
    for (let i = cursorChar; i >= 0; i--) {
      const char = lineText[i];

      if (char === '"' || char === "'") {
        // Found opening quote
        propertyStart = i;
        break;
      } else if (char === ':' || char === ',' || char === '{') {
        // Found delimiter, so this is an unquoted key
        // Look forward to find the start of the key
        for (let j = i + 1; j <= cursorChar; j++) {
          if (!/\s/.test(lineText[j])) {
            propertyStart = j;
            break;
          }
        }
        break;
      }
    }

    if (propertyStart === -1) {
      // Try to find unquoted key at start of line
      for (let i = 0; i <= cursorChar; i++) {
        if (!/\s/.test(lineText[i])) {
          propertyStart = i;
          break;
        }
      }
    }

    if (propertyStart === -1) {
      return null;
    }

    // Find the end of the property key
    const startChar = lineText[propertyStart];
    if (startChar === '"' || startChar === "'") {
      // Quoted key - find closing quote
      for (let i = propertyStart + 1; i < lineText.length; i++) {
        if (lineText[i] === startChar && lineText[i - 1] !== '\\') {
          propertyEnd = i + 1; // Include closing quote
          break;
        }
      }
    } else {
      // Unquoted key - find colon or whitespace
      for (let i = propertyStart; i < lineText.length; i++) {
        if (lineText[i] === ':' || /\s/.test(lineText[i])) {
          propertyEnd = i;
          break;
        }
      }
    }

    if (propertyEnd === -1) {
      return null;
    }

    // Verify cursor is within the key range
    if (cursorChar < propertyStart || cursorChar >= propertyEnd) {
      return null;
    }

    return { propertyStart, propertyEnd };
  }

  private getCompletePropertyRangeFromStart(
    document: vscode.TextDocument,
    startLine: number,
    propertyStart: number,
    propertyEnd: number
  ): vscode.Range | null {
    const startPos = new vscode.Position(startLine, propertyStart);

    // Find the end of this property by looking for the value
    const endPos = this.findPropertyEndFromKeyEnd(document, startLine, propertyEnd);
    if (!endPos) {
      return null;
    }

    return new vscode.Range(startPos, endPos);
  }

  private findPropertyEndFromKeyEnd(
    document: vscode.TextDocument,
    startLine: number,
    keyEndChar: number
  ): vscode.Position | null {
    const startLineText = document.lineAt(startLine).text;

    // Find the colon after the key
    let colonIndex = -1;
    for (let i = keyEndChar; i < startLineText.length; i++) {
      if (startLineText[i] === ':') {
        colonIndex = i;
        break;
      } else if (!/\s/.test(startLineText[i])) {
        // Non-whitespace character that's not a colon
        return null;
      }
    }

    if (colonIndex === -1) {
      return null;
    }

    // Start searching for the value after the colon
    let currentLine = startLine;
    let currentChar = colonIndex + 1;

    // Skip whitespace after colon
    const currentLineText = document.lineAt(currentLine).text;
    while (currentChar < currentLineText.length && /\s/.test(currentLineText[currentChar])) {
      currentChar++;
    }

    if (currentChar >= currentLineText.length) {
      // Value might be on next line
      currentLine++;
      if (currentLine >= document.lineCount) {
        return null;
      }
      currentChar = 0;
      const nextLineText = document.lineAt(currentLine).text;
      while (currentChar < nextLineText.length && /\s/.test(nextLineText[currentChar])) {
        currentChar++;
      }
    }

    // Determine value type and find its end
    const valueLineText = document.lineAt(currentLine).text;
    const valueChar = valueLineText[currentChar];

    if (valueChar === '{') {
      // Object value - find matching closing brace
      return this.findMatchingBrace(document, currentLine, currentChar, '{', '}');
    } else if (valueChar === '[') {
      // Array value - find matching closing bracket
      return this.findMatchingBrace(document, currentLine, currentChar, '[', ']');
    } else if (valueChar === '"' || valueChar === "'" || valueChar === '`') {
      // String value - find closing quote
      return this.findClosingQuote(document, currentLine, currentChar, valueChar);
    } else {
      // Primitive value - find comma or end of object
      return this.findPrimitiveValueEnd(document, currentLine, currentChar);
    }
  }

  // Required methods from base class (simplified implementations)
  getClassPatterns() { return []; }
  getFunctionPatterns() { return []; }
  getVariablePatterns() { return []; }
  getObjectKeyPatterns() { return []; }
  getClassMemberPatterns() { return []; }
  getMultilineStringPatterns() { return []; }
}

