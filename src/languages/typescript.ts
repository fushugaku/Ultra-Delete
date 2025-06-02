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
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
        // For functions, check if cursor is on the function name/declaration line
        return this.isCursorOnFunctionDeclaration(node, position);

      case ts.SyntaxKind.MethodDeclaration:
        // For methods, check if cursor is on the method name/declaration
        return this.isCursorOnMethodDeclaration(node, position);

      case ts.SyntaxKind.VariableDeclaration:
        // For variables, check if cursor is on the variable name
        return this.isCursorOnVariableName(node, position);

      case ts.SyntaxKind.PropertyAssignment:
      case ts.SyntaxKind.ShorthandPropertyAssignment:
        // For object properties, check if cursor is on the property key
        return this.isCursorOnPropertyKey(node, position);

      default:
        return true;
    }
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
        return position >= nameStart && position <= nameEnd;
      }
    }
    return true;
  }

  private getNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // Get the exact range for the specific node type
    switch (node.kind) {
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
    // For object properties, include the entire property line including trailing comma
    const start = document.positionAt(node.getStart());
    let end = document.positionAt(node.getEnd());

    // Try to include trailing comma if it exists
    const line = document.lineAt(end.line);
    const textAfterNode = line.text.substring(end.character);
    const commaMatch = textAfterNode.match(/^\s*,/);
    if (commaMatch) {
      end = new vscode.Position(end.line, end.character + commaMatch[0].length);
    }

    return new vscode.Range(start, end);
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

  getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.PropertyAssignment,
      ts.SyntaxKind.ShorthandPropertyAssignment,
      ts.SyntaxKind.PropertySignature
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

  // Required methods from base class (simplified implementations)
  getClassPatterns() { return []; }
  getFunctionPatterns() { return []; }
  getVariablePatterns() { return []; }
  getObjectKeyPatterns() { return []; }
  getClassMemberPatterns() { return []; }
  getMultilineStringPatterns() { return []; }
}