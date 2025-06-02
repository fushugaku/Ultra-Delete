// typescript.ts
import * as vscode from 'vscode';
import * as ts from 'typescript';
import { BaseLanguageHandler, ElementType } from './base/baseLanguage';

/**
 * TypeScript language handler for intelligent code element detection and manipulation
 */
export class TypeScriptHandler extends BaseLanguageHandler {
  languageIds = ['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'];

  // ========================================
  // PUBLIC API METHODS
  // ========================================




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
    // First check for call expressions (like onMounted, watch, etc.)
    const callExpressionRange = this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.CallExpression
    ]);

    if (callExpressionRange) {
      return callExpressionRange;
    }

    // Then check for function declarations/expressions
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.FunctionDeclaration,
      ts.SyntaxKind.ArrowFunction,
      ts.SyntaxKind.FunctionExpression,
      ts.SyntaxKind.MethodDeclaration
    ]);
  }

  getVariableRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.VariableStatement,
      ts.SyntaxKind.VariableDeclaration
    ]);
  }

  getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.PropertyAssignment,
      ts.SyntaxKind.ShorthandPropertyAssignment,
      ts.SyntaxKind.PropertySignature
    ]);
  }

  getClassMemberRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // First try the standard AST-based detection
    const standardRange = this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.MethodDeclaration,
      ts.SyntaxKind.PropertyDeclaration,
      ts.SyntaxKind.GetAccessor,
      ts.SyntaxKind.SetAccessor,
      ts.SyntaxKind.Constructor
    ]);

    if (standardRange) {
      return standardRange;
    }

    // If standard detection failed, check if cursor is on an access modifier
    if (this.isAccessModifier(word)) {
      return this.getClassMemberRangeFromModifier(document, position, word);
    }

    return null;
  }

  getConditionalBlockRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    try {
      const sourceFile = this.createSourceFile(document);
      const offset = document.offsetAt(position);

      // Find the if statement that contains this position
      const ifStatement = this.findIfStatementAtPosition(sourceFile, offset);
      if (!ifStatement) {
        return null;
      }

      // Determine what to cut based on cursor position
      return this.getConditionalRangeBasedOnPosition(document, ifStatement, offset);
    } catch (error) {
      console.error('Error parsing conditional block:', error);
      return null;
    }
  }

  getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.TemplateExpression,
      ts.SyntaxKind.NoSubstitutionTemplateLiteral,
      ts.SyntaxKind.StringLiteral
    ]);
  }

  // ========================================
  // CORE AST PROCESSING
  // ========================================

  /**
   * Main method for finding element ranges using TypeScript AST
   */
  private getElementRangeUsingAST(
    document: vscode.TextDocument,
    position: vscode.Position,
    targetKinds: ts.SyntaxKind[]
  ): vscode.Range | null {
    try {
      console.log(`Parsing ${document.languageId} file: ${document.fileName}`);
      const sourceFile = this.createSourceFile(document);
      console.log(`Created source file successfully`);

      const offset = document.offsetAt(position);
      console.log(`Looking for kinds: ${targetKinds.map(k => ts.SyntaxKind[k]).join(', ')}`);

      // Find the node that directly contains the cursor position
      const node = this.findDirectNodeAtPosition(sourceFile, offset, targetKinds);
      if (!node) {
        console.log('No matching node found');
        return null;
      }

      console.log(`Found node of kind: ${ts.SyntaxKind[node.kind]}`);
      return this.getNodeRange(document, node);
    } catch (error) {
      console.error('Error parsing TypeScript/TSX:', error);
      return null;
    }
  }

  private getNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // Get the exact range for the specific node type
    switch (node.kind) {
      case ts.SyntaxKind.CallExpression:
        return this.getCallExpressionRange(document, node);

      case ts.SyntaxKind.VariableDeclaration:
        // For variable declarations, get the entire statement
        const statement = this.findAncestorOfKind(node, ts.SyntaxKind.VariableStatement);
        if (statement) {
          return this.nodeToRange(document, statement);
        }
        break;

      case ts.SyntaxKind.PropertyAssignment:
      case ts.SyntaxKind.ShorthandPropertyAssignment:
      case ts.SyntaxKind.PropertySignature:
        // For object properties, include the entire property with value and trailing comma
        return this.getPropertyRange(document, node);

      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.Constructor:
        // For class members, include only the member itself (not expanding to class)
        return this.getClassMemberNodeRange(document, node);

      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
        // For functions, include the entire function
        return this.getFunctionNodeRange(document, node);

      default:
        return this.nodeToRange(document, node);
    }

    return this.nodeToRange(document, node);
  }

  // Update the findDirectNodeAtPosition to be more precise about property detection
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

    // For property assignments, we want to be very specific
    if (targetKinds.includes(ts.SyntaxKind.PropertyAssignment) ||
      targetKinds.includes(ts.SyntaxKind.ShorthandPropertyAssignment)) {

      // Walk up to find the most immediate property assignment
      let current: ts.Node | undefined = containingNode;
      let foundProperty: ts.Node | null = null;

      while (current) {
        if ((ts.isPropertyAssignment(current) || ts.isShorthandPropertyAssignment(current)) &&
          this.isValidScopeForPosition(current, position)) {
          foundProperty = current;
          // Don't break here - we want the most immediate property
        }
        current = current.parent;
      }

      if (foundProperty) {
        return foundProperty;
      }
    }

    // For other kinds, use the original logic
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

  private createSourceFile(document: vscode.TextDocument): ts.SourceFile {
    // Determine script kind based on file extension or language ID
    let scriptKind = ts.ScriptKind.TS;

    if (document.languageId === 'tsx' ||
      document.languageId === 'typescriptreact' ||
      document.languageId === 'jsx' ||
      document.languageId === 'javascriptreact' ||
      document.fileName.endsWith('.tsx') ||
      document.fileName.endsWith('.jsx')) {
      scriptKind = ts.ScriptKind.TSX;
      console.log('Using TSX script kind for parsing');
    } else if (document.languageId === 'javascript' ||
      document.fileName.endsWith('.js')) {
      scriptKind = ts.ScriptKind.JS;
      console.log('Using JS script kind for parsing');
    } else {
      console.log('Using TS script kind for parsing');
    }

    return ts.createSourceFile(
      document.fileName,
      document.getText(),
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );
  }

  // ========================================
  // NODE FINDING AND VALIDATION
  // ========================================



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

  private isValidScopeForPosition(node: ts.Node, position: number): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.CallExpression:
        return this.isCursorOnCallExpression(node, position);

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
        return this.isCursorOnPropertyKey(node, position);

      default:
        return true;
    }
  }

  // ========================================
  // CURSOR POSITION VALIDATION
  // ========================================

  private isCursorOnCallExpression(node: ts.Node, position: number): boolean {
    if (!ts.isCallExpression(node)) {
      return false;
    }

    // Check if cursor is on the function name being called
    const expression = node.expression;

    if (ts.isIdentifier(expression)) {
      // Simple function call like onMounted()
      const nameStart = expression.getStart();
      const nameEnd = expression.getEnd();
      return position >= nameStart && position <= nameEnd;
    } else if (ts.isPropertyAccessExpression(expression)) {
      // Method call like obj.method()
      const nameStart = expression.name.getStart();
      const nameEnd = expression.name.getEnd();
      return position >= nameStart && position <= nameEnd;
    }

    // For other types of call expressions, allow if cursor is anywhere in the expression part
    const expressionEnd = expression.getEnd();
    return position >= expression.getStart() && position <= expressionEnd;
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

  private isCursorOnPropertyKey(node: ts.Node, position: number): boolean {
    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const name = node.name;
      if (name) {
        const nameStart = name.getStart();
        const nameEnd = name.getEnd();
        // Allow cursor anywhere on the property name
        return position >= nameStart && position <= nameEnd;
      }
    }
    return true;
  }

  // ========================================
  // RANGE CALCULATION
  // ========================================



  private getCallExpressionRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    if (!ts.isCallExpression(node)) {
      return this.nodeToRange(document, node);
    }

    // Check if this call expression is part of an expression statement
    // If so, include the entire statement (which will include the semicolon if present)
    const parent = node.parent;
    if (ts.isExpressionStatement(parent)) {
      return this.nodeToRange(document, parent);
    }

    // If it's part of a variable declaration, include the entire declaration
    if (ts.isVariableDeclaration(parent)) {
      const variableStatement = this.findAncestorOfKind(parent, ts.SyntaxKind.VariableStatement);
      if (variableStatement) {
        return this.nodeToRange(document, variableStatement);
      }
    }

    // Otherwise, just return the call expression itself
    return this.nodeToRange(document, node);
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

  private getPropertyRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    if (!ts.isPropertyAssignment(node) && !ts.isShorthandPropertyAssignment(node)) {
      return this.nodeToRange(document, node);
    }

    // For property assignments, include the entire property (key + value)
    let start = document.positionAt(node.getStart());
    let end = document.positionAt(node.getEnd());

    // Try to include trailing comma if it exists on the same line
    const endLine = document.lineAt(end.line);
    const textAfterNode = endLine.text.substring(end.character);
    const commaMatch = textAfterNode.match(/^\s*,/);
    if (commaMatch) {
      end = new vscode.Position(end.line, end.character + commaMatch[0].length);
    } else {
      // If no comma on the same line, check if there's a comma on the next line
      if (end.line + 1 < document.lineCount) {
        const nextLine = document.lineAt(end.line + 1);
        const nextLineCommaMatch = nextLine.text.match(/^\s*,/);
        if (nextLineCommaMatch) {
          end = new vscode.Position(end.line + 1, nextLineCommaMatch[0].length);
        }
      }
    }

    return new vscode.Range(start, end);
  }


  private getClassMemberNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For class members, include any decorators and modifiers but don't expand to class level
    return this.nodeToRange(document, node);
  }

  // ... (rest of the conditional block handling methods remain the same)
  // ... (rest of the class member handling methods remain the same)
  // ... (rest of the utility methods remain the same)

  // ========================================
  // CONDITIONAL BLOCK HANDLING
  // ========================================

  private findIfStatementAtPosition(node: ts.Node, position: number): ts.IfStatement | null {
    // Check if this node is an if statement and contains the position
    if (ts.isIfStatement(node) && position >= node.getStart() && position <= node.getEnd()) {
      // Check if cursor is specifically on a keyword in this if statement
      if (this.isCursorOnConditionalKeyword(node, position)) {
        return node;
      }
    }

    // Recursively search children
    let result: ts.IfStatement | null = null;
    ts.forEachChild(node, (child) => {
      if (!result) {
        result = this.findIfStatementAtPosition(child, position);
      }
    });

    return result;
  }

  private isCursorOnConditionalKeyword(node: ts.Node, position: number): boolean {
    if (!ts.isIfStatement(node)) {
      return false;
    }

    const sourceFile = node.getSourceFile();
    const text = sourceFile.text;

    // Check if cursor is on the main "if" keyword
    const ifKeywordStart = node.getStart();
    const ifKeywordEnd = ifKeywordStart + 2; // "if".length

    if (this.isCursorOnKeywordOnly(position, ifKeywordStart, ifKeywordEnd, text)) {
      return true;
    }

    // Check for else/else if keywords in the chain
    return this.isCursorOnElseKeywords(node, position, text);
  }

  private isCursorOnElseKeywords(ifStatement: ts.IfStatement, position: number, sourceText: string): boolean {
    let current: ts.IfStatement = ifStatement;

    while (current.elseStatement) {
      const elseKeywordPos = this.findElseKeywordPosition(current, sourceText);
      if (elseKeywordPos === -1) break;

      const elseKeywordEnd = elseKeywordPos + 4; // "else".length

      // Check if cursor is on "else" keyword
      if (position >= elseKeywordPos && position <= elseKeywordEnd) {
        return true;
      }

      // If else statement is another if statement, check the "if" part of "else if"
      if (ts.isIfStatement(current.elseStatement)) {
        const elseIfStart = current.elseStatement.getStart();
        const elseIfEnd = elseIfStart + 2; // "if".length after "else "

        if (position >= elseIfStart && position <= elseIfEnd) {
          return true;
        }

        current = current.elseStatement;
      } else {
        break;
      }
    }

    return false;
  }

  private getConditionalRangeBasedOnPosition(
    document: vscode.TextDocument,
    ifStatement: ts.IfStatement,
    position: number
  ): vscode.Range | null {
    const sourceText = ifStatement.getSourceFile().text;

    // Case 1: Cursor on main "if" keyword - cut entire if/else if/else chain
    const ifKeywordStart = ifStatement.getStart();
    const ifKeywordEnd = ifKeywordStart + 2; // "if".length

    if (position >= ifKeywordStart && position <= ifKeywordEnd) {
      return this.getEntireIfChainRange(document, ifStatement);
    }

    // Case 2: Cursor on "else if" or "else" - find which one and cut from there
    return this.getElseChainRange(document, ifStatement, position, sourceText);
  }

  private getEntireIfChainRange(document: vscode.TextDocument, ifStatement: ts.IfStatement): vscode.Range {
    // Find the end of the entire if/else chain
    let endNode: ts.Node = ifStatement;
    let current = ifStatement;

    while (current.elseStatement) {
      endNode = current.elseStatement;
      if (ts.isIfStatement(current.elseStatement)) {
        current = current.elseStatement;
      } else {
        break;
      }
    }

    return new vscode.Range(
      document.positionAt(ifStatement.getStart()),
      document.positionAt(endNode.getEnd())
    );
  }

  private getElseChainRange(
    document: vscode.TextDocument,
    ifStatement: ts.IfStatement,
    position: number,
    sourceText: string
  ): vscode.Range | null {
    let current = ifStatement;

    while (current.elseStatement) {
      const elseKeywordPos = this.findElseKeywordPosition(current, sourceText);
      if (elseKeywordPos === -1) break;

      const elseKeywordEnd = elseKeywordPos + 4; // "else".length

      // Check if cursor is on "else" keyword
      if (position >= elseKeywordPos && position <= elseKeywordEnd) {
        // If the else statement is another if statement, this is "else if"
        if (ts.isIfStatement(current.elseStatement)) {
          // Cursor on "else if" - cut from this else if to the end of the chain
          return this.getElseIfChainRange(document, current.elseStatement);
        } else {
          // Cursor on final "else" - cut just the else block
          return new vscode.Range(
            document.positionAt(elseKeywordPos),
            document.positionAt(current.elseStatement.getEnd())
          );
        }
      }

      // Check if cursor is on the "if" part of "else if"
      if (ts.isIfStatement(current.elseStatement)) {
        const elseIfStart = current.elseStatement.getStart();
        const elseIfEnd = elseIfStart + 2; // "if".length

        if (position >= elseIfStart && position <= elseIfEnd) {
          // Cursor on "else if" - cut from this else if to the end
          return this.getElseIfChainRange(document, current.elseStatement);
        }

        current = current.elseStatement;
      } else {
        break;
      }
    }

    return null;
  }

  private getElseIfChainRange(document: vscode.TextDocument, elseIfStatement: ts.IfStatement): vscode.Range {
    // Find the end of the chain starting from this else if
    let endNode: ts.Node = elseIfStatement;
    let current = elseIfStatement;

    while (current.elseStatement) {
      endNode = current.elseStatement;
      if (ts.isIfStatement(current.elseStatement)) {
        current = current.elseStatement;
      } else {
        break;
      }
    }

    // Start from the "else" keyword that precedes this else if
    const parent = elseIfStatement.parent;
    if (ts.isIfStatement(parent)) {
      const sourceText = elseIfStatement.getSourceFile().text;
      const elseKeywordPos = this.findElseKeywordPosition(parent, sourceText);
      if (elseKeywordPos !== -1) {
        return new vscode.Range(
          document.positionAt(elseKeywordPos),
          document.positionAt(endNode.getEnd())
        );
      }
    }

    // Fallback: just the else if statement itself
    return new vscode.Range(
      document.positionAt(elseIfStatement.getStart()),
      document.positionAt(endNode.getEnd())
    );
  }

  // ========================================
  // CLASS MEMBER HANDLING
  // ========================================

  private isAccessModifier(word: string): boolean {
    const accessModifiers = ['private', 'public', 'protected', 'readonly', 'static', 'abstract', 'override'];
    return accessModifiers.includes(word.toLowerCase());
  }

  private getClassMemberRangeFromModifier(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string
  ): vscode.Range | null {
    try {
      const sourceFile = this.createSourceFile(document);
      const offset = document.offsetAt(position);

      // Find the class member that has this modifier
      const classMember = this.findClassMemberWithModifierAtPosition(sourceFile, offset, word);
      if (!classMember) {
        return null;
      }

      return this.getClassMemberNodeRange(document, classMember);
    } catch (error) {
      console.error('Error finding class member from modifier:', error);
      return null;
    }
  }

  private findClassMemberWithModifierAtPosition(
    node: ts.Node,
    position: number,
    modifierWord: string
  ): ts.Node | null {
    // Check if this node is a class member with the modifier at the position
    if (this.isClassMemberNode(node)) {
      const modifierRange = this.findModifierInNode(node, position, modifierWord);
      if (modifierRange) {
        return node;
      }
    }

    // Recursively search children
    let result: ts.Node | null = null;
    ts.forEachChild(node, (child) => {
      if (!result) {
        result = this.findClassMemberWithModifierAtPosition(child, position, modifierWord);
      }
    });

    return result;
  }

  private isClassMemberNode(node: ts.Node): boolean {
    return ts.isMethodDeclaration(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node);
  }

  private findModifierInNode(node: ts.Node, position: number, modifierWord: string): boolean {
    // Get all modifiers for this node
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;

    if (!modifiers) {
      return false;
    }

    // Check each modifier
    for (const modifier of modifiers) {
      const modifierStart = modifier.getStart();
      const modifierEnd = modifier.getEnd();

      // Check if the position is within this modifier and it matches our word
      if (position >= modifierStart && position <= modifierEnd) {
        const modifierText = modifier.getText().trim();
        if (modifierText.toLowerCase() === modifierWord.toLowerCase()) {
          return true;
        }
      }
    }

    return false;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

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

  // ========================================
  // BASE CLASS REQUIREMENTS
  // ========================================

  // Required methods from base class (simplified implementations)
  getClassPatterns() { return []; }
  getFunctionPatterns() { return []; }
  getVariablePatterns() { return []; }
  getObjectKeyPatterns() { return []; }
  getClassMemberPatterns() { return []; }
  getMultilineStringPatterns() { return []; }
}
