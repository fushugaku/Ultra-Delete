// typescript.ts
import * as vscode from 'vscode';
import * as ts from 'typescript';
import { BaseLanguageHandler, ElementType } from './base/baseLanguage';

/**
 * TypeScript language handler for intelligent code element detection and manipulation
 */
export class TypeScriptHandler extends BaseLanguageHandler {
  languageIds = ['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'];

  constructor() {
    super();
    console.log('*** TypeScriptHandler constructor called ***');
  }

  // ========================================
  // REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
  // ========================================

  getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    console.log(`*** getClassRange ENTRY - word: "${word}" ***`);
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
    console.log(`*** getFunctionRange ENTRY - word: "${word}" ***`);
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.FunctionDeclaration,
      ts.SyntaxKind.ArrowFunction,
      ts.SyntaxKind.FunctionExpression,
      ts.SyntaxKind.MethodDeclaration
    ]);
  }

  getVariableRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    console.log(`*** getVariableRange ENTRY - word: "${word}" ***`);
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.VariableStatement,
      ts.SyntaxKind.VariableDeclaration
    ]);
  }

  getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    console.log(`*** getObjectKeyRange ENTRY - word: "${word}" ***`);
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.PropertyAssignment,
      ts.SyntaxKind.ShorthandPropertyAssignment,
      ts.SyntaxKind.PropertySignature,
      ts.SyntaxKind.MethodSignature
    ]);
  }

  getClassMemberRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    console.log(`*** getClassMemberRange ENTRY - word: "${word}" ***`);

    // First try the standard AST-based detection
    const standardRange = this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.MethodDeclaration,
      ts.SyntaxKind.PropertyDeclaration,
      ts.SyntaxKind.GetAccessor,
      ts.SyntaxKind.SetAccessor,
      ts.SyntaxKind.Constructor
    ]);

    if (standardRange) {
      console.log(`Found class member via standard range`);
      return standardRange;
    }

    // If standard detection failed, check if cursor is on an access modifier
    if (this.isAccessModifier(word)) {
      console.log(`Checking access modifier: ${word}`);
      return this.getClassMemberRangeFromModifier(document, position, word);
    }

    console.log(`No class member found for word: "${word}"`);
    return null;
  }

  getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    console.log(`*** getMultilineStringRange ENTRY - word: "${word}" ***`);
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.TemplateExpression,
      ts.SyntaxKind.NoSubstitutionTemplateLiteral,
      ts.SyntaxKind.StringLiteral
    ]);
  }

  // ========================================
  // REQUIRED PATTERN METHODS (return empty arrays since we use AST)
  // ========================================

  getClassPatterns(): any[] {
    return [];
  }

  getFunctionPatterns(): any[] {
    return [];
  }

  getVariablePatterns(): any[] {
    return [];
  }

  getObjectKeyPatterns(): any[] {
    return [];
  }

  getClassMemberPatterns(): any[] {
    return [];
  }

  getMultilineStringPatterns(): any[] {
    return [];
  }

  // ========================================
  // OPTIONAL METHODS
  // ========================================

  getConditionalBlockRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    console.log(`*** getConditionalBlockRange ENTRY - word: "${word}" ***`);
    try {
      const sourceFile = this.createSourceFile(document);
      const offset = document.offsetAt(position);

      // Find the if statement that contains this position
      const ifStatement = this.findIfStatementAtPosition(sourceFile, offset);
      if (!ifStatement) {
        console.log(`No if statement found`);
        return null;
      }

      // Determine what to cut based on cursor position
      return this.getConditionalRangeBasedOnPosition(document, ifStatement, offset);
    } catch (error) {
      console.error('Error parsing conditional block:', error);
      return null;
    }
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
    console.log(`getElementRangeUsingAST called with kinds: ${targetKinds.map(k => ts.SyntaxKind[k]).join(', ')}`);

    try {
      console.log(`Parsing ${document.languageId} file: ${document.fileName}`);
      const sourceFile = this.createSourceFile(document);
      console.log(`Created source file successfully`);

      const offset = document.offsetAt(position);
      console.log(`Looking for kinds at offset ${offset}: ${targetKinds.map(k => ts.SyntaxKind[k]).join(', ')}`);

      // First, let's debug what node we're actually on
      const nodeAtPosition = this.findNodeAtPosition(sourceFile, offset);
      if (nodeAtPosition) {
        console.log(`Node at position: ${ts.SyntaxKind[nodeAtPosition.kind]} - "${nodeAtPosition.getText().substring(0, 50)}..."`);
        console.log(`Node parent: ${nodeAtPosition.parent ? ts.SyntaxKind[nodeAtPosition.parent.kind] : 'none'}`);
      } else {
        console.log(`No node found at position ${offset}`);
      }

      // Find the node that directly contains the cursor position
      const node = this.findDirectNodeAtPosition(sourceFile, offset, targetKinds);
      if (!node) {
        console.log('No matching node found in direct search');
        // Let's try a more relaxed search
        const relaxedNode = this.findRelaxedNodeAtPosition(sourceFile, offset, targetKinds);
        if (relaxedNode) {
          console.log(`Found relaxed match: ${ts.SyntaxKind[relaxedNode.kind]}`);
          return this.getNodeRange(document, relaxedNode);
        }
        console.log('No relaxed match found either');
        return null;
      }

      console.log(`Found node of kind: ${ts.SyntaxKind[node.kind]}`);
      return this.getNodeRange(document, node);
    } catch (error: any) {
      console.error('Error parsing TypeScript/TSX:', error);
      console.error('Error stack:', error?.stack);
      return null;
    }
  }

  private createSourceFile(document: vscode.TextDocument): ts.SourceFile {
    console.log(`createSourceFile called for ${document.languageId}`);

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

    try {
      const sourceFile = ts.createSourceFile(
        document.fileName,
        document.getText(),
        ts.ScriptTarget.Latest,
        true,
        scriptKind
      );
      console.log(`Source file created successfully, has ${sourceFile.statements.length} statements`);
      return sourceFile;
    } catch (error) {
      console.error('Error creating source file:', error);
      throw error;
    }
  }

  // ========================================
  // NODE FINDING AND VALIDATION
  // ========================================

  private findNodeAtPosition(node: ts.Node, position: number): ts.Node | null {
    console.log(`findNodeAtPosition: checking node ${ts.SyntaxKind[node.kind]} at position ${position}`);

    // Simple function to find what node we're actually on
    if (position >= node.getStart() && position <= node.getEnd()) {
      console.log(`Position ${position} is within node ${ts.SyntaxKind[node.kind]} (${node.getStart()}-${node.getEnd()})`);

      // Check children first
      let childResult: ts.Node | null = null;
      ts.forEachChild(node, (child) => {
        if (!childResult) {
          childResult = this.findNodeAtPosition(child, position);
        }
      });
      return childResult || node;
    }
    return null;
  }

  private findDirectNodeAtPosition(
    node: ts.Node,
    position: number,
    targetKinds: ts.SyntaxKind[]
  ): ts.Node | null {
    console.log(`findDirectNodeAtPosition: looking for ${targetKinds.map(k => ts.SyntaxKind[k]).join(', ')}`);

    // Find the deepest node that contains the position
    const containingNode = this.findDeepestContainingNode(node, position);
    if (!containingNode) {
      console.log('No containing node found');
      return null;
    }

    console.log(`Deepest containing node: ${ts.SyntaxKind[containingNode.kind]}`);

    // Walk up the tree to find the first node that matches our target kinds
    let current: ts.Node | undefined = containingNode;
    while (current) {
      console.log(`Checking node: ${ts.SyntaxKind[current.kind]}`);
      if (targetKinds.includes(current.kind)) {
        console.log(`Found matching kind: ${ts.SyntaxKind[current.kind]}`);
        // Additional validation to ensure we're at the right scope level
        if (this.isValidScopeForPosition(current, position)) {
          console.log(`Valid scope found: ${ts.SyntaxKind[current.kind]}`);
          return current;
        } else {
          console.log(`Invalid scope for: ${ts.SyntaxKind[current.kind]}`);
        }
      }
      current = current.parent;
    }

    console.log('No matching node found in tree walk');
    return null;
  }

  private findRelaxedNodeAtPosition(
    node: ts.Node,
    position: number,
    targetKinds: ts.SyntaxKind[]
  ): ts.Node | null {
    console.log(`findRelaxedNodeAtPosition: checking ${ts.SyntaxKind[node.kind]}`);

    // More relaxed search - find any matching node that contains the position
    if (targetKinds.includes(node.kind) && position >= node.getStart() && position <= node.getEnd()) {
      console.log(`Relaxed match found: ${ts.SyntaxKind[node.kind]}`);
      return node;
    }

    let result: ts.Node | null = null;
    ts.forEachChild(node, (child) => {
      if (!result) {
        result = this.findRelaxedNodeAtPosition(child, position, targetKinds);
      }
    });

    return result;
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

  private isValidScopeForPosition(node: ts.Node, position: number): boolean {
    console.log(`Validating scope for ${ts.SyntaxKind[node.kind]} at position ${position}`);

    switch (node.kind) {
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
        const funcValid = this.isCursorOnFunctionDeclaration(node, position);
        console.log(`Function validation result: ${funcValid}`);
        return funcValid;

      case ts.SyntaxKind.MethodDeclaration:
        const methodValid = this.isCursorOnMethodDeclaration(node, position);
        console.log(`Method validation result: ${methodValid}`);
        return methodValid;

      case ts.SyntaxKind.VariableDeclaration:
        const varValid = this.isCursorOnVariableName(node, position);
        console.log(`Variable declaration validation: ${varValid}`);
        return varValid;

      case ts.SyntaxKind.VariableStatement:
        // For variable statements, check if cursor is on any of the declarations
        if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) {
            if (this.isCursorOnVariableName(declaration, position)) {
              console.log(`Variable statement validation: true`);
              return true;
            }
          }
        }
        console.log(`Variable statement validation: false`);
        return false;

      case ts.SyntaxKind.PropertyAssignment:
      case ts.SyntaxKind.ShorthandPropertyAssignment:
        const propValid = this.isCursorOnPropertyKey(node, position);
        console.log(`Property validation result: ${propValid}`);
        return propValid;

      default:
        console.log(`Default validation: true for ${ts.SyntaxKind[node.kind]}`);
        return true;
    }
  }

  // ========================================
  // CURSOR POSITION VALIDATION
  // ========================================

  private isCursorOnFunctionDeclaration(node: ts.Node, position: number): boolean {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      // Check if cursor is on the function keyword or name
      const functionKeywordStart = node.getStart();
      const nameEnd = node.name ? node.name.getEnd() : node.getStart() + 8; // "function".length
      const result = position >= functionKeywordStart && position <= nameEnd;
      console.log(`Function declaration check: pos=${position}, start=${functionKeywordStart}, nameEnd=${nameEnd}, result=${result}`);
      return result;
    }

    if (ts.isArrowFunction(node)) {
      // For arrow functions, check if cursor is on parameters or before =>
      const arrowToken = node.getChildren().find(child => child.kind === ts.SyntaxKind.EqualsGreaterThanToken);
      if (arrowToken) {
        const result = position <= arrowToken.getStart();
        console.log(`Arrow function check: pos=${position}, arrowStart=${arrowToken.getStart()}, result=${result}`);
        return result;
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

        const result = position >= nameStart && position <= beforeBody;
        console.log(`Method declaration check: pos=${position}, nameStart=${nameStart}, beforeBody=${beforeBody}, result=${result}`);
        return result;
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
        const isOnName = position >= nameStart && position <= nameEnd;
        console.log(`Variable name "${name.getText()}" range: ${nameStart}-${nameEnd}, position: ${position}, isOnName: ${isOnName}`);
        return isOnName;
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
        const result = position >= nameStart && position <= nameEnd;
        console.log(`Property key "${name.getText()}" range: ${nameStart}-${nameEnd}, position: ${position}, result=${result}`);
        return result;
      }
    }
    return true;
  }

  // ========================================
  // REMAINING HELPER METHODS (keeping existing implementation)
  // ========================================

  private findIfStatementAtPosition(node: ts.Node, position: number): ts.IfStatement | null {
    if (ts.isIfStatement(node) && position >= node.getStart() && position <= node.getEnd()) {
      if (this.isCursorOnConditionalKeyword(node, position)) {
        return node;
      }
    }

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

    const ifKeywordStart = node.getStart();
    const ifKeywordEnd = ifKeywordStart + 2;

    if (this.isCursorOnKeywordOnly(position, ifKeywordStart, ifKeywordEnd, text)) {
      return true;
    }

    return this.isCursorOnElseKeywords(node, position, text);
  }

  private isCursorOnElseKeywords(ifStatement: ts.IfStatement, position: number, sourceText: string): boolean {
    let current: ts.IfStatement = ifStatement;

    while (current.elseStatement) {
      const elseKeywordPos = this.findElseKeywordPosition(current, sourceText);
      if (elseKeywordPos === -1) break;

      const elseKeywordEnd = elseKeywordPos + 4;

      if (position >= elseKeywordPos && position <= elseKeywordEnd) {
        return true;
      }

      if (ts.isIfStatement(current.elseStatement)) {
        const elseIfStart = current.elseStatement.getStart();
        const elseIfEnd = elseIfStart + 2;

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

    const ifKeywordStart = ifStatement.getStart();
    const ifKeywordEnd = ifKeywordStart + 2;

    if (position >= ifKeywordStart && position <= ifKeywordEnd) {
      return this.getEntireIfChainRange(document, ifStatement);
    }

    return this.getElseChainRange(document, ifStatement, position, sourceText);
  }

  private getEntireIfChainRange(document: vscode.TextDocument, ifStatement: ts.IfStatement): vscode.Range {
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

      const elseKeywordEnd = elseKeywordPos + 4;

      if (position >= elseKeywordPos && position <= elseKeywordEnd) {
        if (ts.isIfStatement(current.elseStatement)) {
          return this.getElseIfChainRange(document, current.elseStatement);
        } else {
          return new vscode.Range(
            document.positionAt(elseKeywordPos),
            document.positionAt(current.elseStatement.getEnd())
          );
        }
      }

      if (ts.isIfStatement(current.elseStatement)) {
        const elseIfStart = current.elseStatement.getStart();
        const elseIfEnd = elseIfStart + 2;

        if (position >= elseIfStart && position <= elseIfEnd) {
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

    return new vscode.Range(
      document.positionAt(elseIfStatement.getStart()),
      document.positionAt(endNode.getEnd())
    );
  }

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
    if (this.isClassMemberNode(node)) {
      const modifierRange = this.findModifierInNode(node, position, modifierWord);
      if (modifierRange) {
        return node;
      }
    }

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
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;

    if (!modifiers) {
      return false;
    }

    for (const modifier of modifiers) {
      const modifierStart = modifier.getStart();
      const modifierEnd = modifier.getEnd();

      if (position >= modifierStart && position <= modifierEnd) {
        const modifierText = modifier.getText().trim();
        if (modifierText.toLowerCase() === modifierWord.toLowerCase()) {
          return true;
        }
      }
    }

    return false;
  }

  private getNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    console.log(`getNodeRange called for ${ts.SyntaxKind[node.kind]}`);

    switch (node.kind) {
      case ts.SyntaxKind.VariableDeclaration:
        const statement = this.findAncestorOfKind(node, ts.SyntaxKind.VariableStatement);
        if (statement) {
          console.log(`Found variable statement ancestor`);
          return this.nodeToRange(document, statement);
        }
        break;

      case ts.SyntaxKind.PropertyAssignment:
      case ts.SyntaxKind.ShorthandPropertyAssignment:
      case ts.SyntaxKind.PropertySignature:
        console.log(`Getting property range`);
        return this.getPropertyRange(document, node);

      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.Constructor:
        console.log(`Getting class member range`);
        return this.getClassMemberNodeRange(document, node);

      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
        console.log(`Getting function range`);
        return this.getFunctionNodeRange(document, node);

      default:
        console.log(`Getting default node range for ${ts.SyntaxKind[node.kind]}`);
        return this.nodeToRange(document, node);
    }

    return this.nodeToRange(document, node);
  }

  private getFunctionNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    let start = node.getStart();

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
    const start = document.positionAt(node.getStart());
    let end = document.positionAt(node.getEnd());

    const line = document.lineAt(end.line);
    const textAfterNode = line.text.substring(end.character);
    const commaMatch = textAfterNode.match(/^\s*,/);
    if (commaMatch) {
      end = new vscode.Position(end.line, end.character + commaMatch[0].length);
    }

    return new vscode.Range(start, end);
  }

  private getClassMemberNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    return this.nodeToRange(document, node);
  }

  private isCursorOnKeywordOnly(position: number, keywordStart: number, keywordEnd: number, sourceText: string): boolean {
    if (position < keywordStart || position > keywordEnd) {
      return false;
    }

    const charAtPosition = sourceText[position];
    const charBefore = position > 0 ? sourceText[position - 1] : '';
    const charAfter = position < sourceText.length - 1 ? sourceText[position + 1] : '';

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

    const thenStatement = ifStatement.thenStatement;
    const thenEnd = thenStatement.getEnd();

    const searchStart = thenEnd;
    const searchEnd = ifStatement.elseStatement.getStart();
    const searchText = sourceText.substring(searchStart, searchEnd);

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
    console.log(`nodeToRange: ${start.line}:${start.character} to ${end.line}:${end.character}`);
    return new vscode.Range(start, end);
  }
}