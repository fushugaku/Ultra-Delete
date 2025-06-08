import * as vscode from 'vscode';
import * as ts from 'typescript';

/**
 * TypeScript AST parser for code analysis and element detection
 */
export class TypeScriptASTParser {

  /**
   * Create a TypeScript source file from a VSCode document
   */
  createSourceFile(document: vscode.TextDocument): ts.SourceFile {
    // Determine script kind based on file extension or language ID
    let scriptKind = ts.ScriptKind.TS;

    if (document.languageId === 'tsx' ||
      document.languageId === 'typescriptreact' ||
      document.languageId === 'jsx' ||
      document.languageId === 'javascriptreact' ||
      document.fileName.endsWith('.tsx') ||
      document.fileName.endsWith('.jsx')) {
      scriptKind = ts.ScriptKind.TSX;
    } else if (document.languageId === 'javascript' ||
      document.fileName.endsWith('.js')) {
      scriptKind = ts.ScriptKind.JS;
    }

    return ts.createSourceFile(
      document.fileName,
      document.getText(),
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );
  }

  /**
   * Find element ranges using TypeScript AST
   */
  getElementRangeUsingAST(
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
      console.error('Error parsing TypeScript/TSX:', error);
      return null;
    }
  }

  /**
   * Get the range of a function's body content
   */
  getFunctionBodyRange(document: vscode.TextDocument, functionNode: ts.Node): vscode.Range | null {
    // Find the function body
    let body: ts.Node | undefined;

    if (ts.isFunctionDeclaration(functionNode) || ts.isFunctionExpression(functionNode) || ts.isMethodDeclaration(functionNode)) {
      body = functionNode.body;
    } else if (ts.isArrowFunction(functionNode)) {
      body = functionNode.body;
    }

    if (!body) {
      return null;
    }

    // If it's a block, return the content inside the braces
    if (ts.isBlock(body)) {
      const start = document.positionAt(body.getStart() + 1); // +1 to skip opening brace
      const end = document.positionAt(body.getEnd() - 1); // -1 to skip closing brace
      return new vscode.Range(start, end);
    }

    // For arrow functions with expression bodies
    return this.nodeToRange(document, body);
  }

  /**
   * Find the function node that contains the given position
   */
  findContainingFunction(node: ts.Node, position: number): ts.Node | null {
    // Check if current node is a function and contains the position
    if (this.isFunctionNode(node) && this.nodeContainsPosition(node, position)) {
      return node;
    }

    // Recursively search children
    for (const child of node.getChildren()) {
      if (this.nodeContainsPosition(child, position)) {
        const result = this.findContainingFunction(child, position);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Find the scope node that contains the given position
   */
  findContainingScope(node: ts.Node, position: number): ts.Node | null {
    // Check if current node is a scope container and contains the position
    if (this.isScopeContainer(node) && this.nodeContainsPosition(node, position)) {
      // Look for a more specific scope in children first
      let bestScope = node;
      for (const child of node.getChildren()) {
        if (this.nodeContainsPosition(child, position)) {
          const childScope = this.findContainingScope(child, position);
          if (childScope) {
            // Prefer object literals and classes over individual methods
            if (this.isPreferredScope(childScope) || !this.isPreferredScope(bestScope)) {
              bestScope = childScope;
            }
          }
        }
      }

      return bestScope;
    }

    // Recursively search children
    for (const child of node.getChildren()) {
      if (this.nodeContainsPosition(child, position)) {
        const result = this.findContainingScope(child, position);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Extract all members from a scope node
   */
  extractMembersFromScope(document: vscode.TextDocument, scopeNode: ts.Node): Array<{ range: vscode.Range, text: string, name: string }> {
    const members: Array<{ range: vscode.Range, text: string, name: string }> = [];

    const addMember = (node: ts.Node, name: string) => {
      const range = this.nodeToRange(document, node);
      const text = document.getText(range);
      members.push({ range, text, name });
    };

    const visitNode = (node: ts.Node) => {
      switch (node.kind) {
        case ts.SyntaxKind.PropertyDeclaration:
        case ts.SyntaxKind.MethodDeclaration:
        case ts.SyntaxKind.GetAccessor:
        case ts.SyntaxKind.SetAccessor:
        case ts.SyntaxKind.Constructor:
          if (ts.isClassElement(node) && node.name && ts.isIdentifier(node.name)) {
            addMember(node, node.name.text);
          } else if (ts.isConstructorDeclaration(node)) {
            addMember(node, 'constructor');
          }
          break;

        case ts.SyntaxKind.FunctionDeclaration:
          if (ts.isFunctionDeclaration(node) && node.name) {
            addMember(node, node.name.text);
          }
          break;

        case ts.SyntaxKind.VariableStatement:
          if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach(decl => {
              if (ts.isIdentifier(decl.name)) {
                addMember(node, decl.name.text);
              }
            });
          }
          break;

        case ts.SyntaxKind.VariableDeclaration:
          // Handle individual variable declarations (for function scopes)
          if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            // Find the parent variable statement for the full range
            const parentStatement = node.parent?.parent;
            if (parentStatement && ts.isVariableStatement(parentStatement)) {
              addMember(parentStatement, node.name.text);
            } else {
              addMember(node, node.name.text);
            }
          }
          break;

        case ts.SyntaxKind.FunctionExpression:
        case ts.SyntaxKind.ArrowFunction:
          // Handle function expressions/arrows as members when they're assigned to variables
          if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
            const parentStatement = node.parent.parent?.parent;
            if (parentStatement && ts.isVariableStatement(parentStatement)) {
              addMember(parentStatement, node.parent.name.text);
            }
          }
          break;

        case ts.SyntaxKind.PropertyAssignment:
        case ts.SyntaxKind.ShorthandPropertyAssignment:
          if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
            addMember(node, node.name.text);
          } else if (ts.isShorthandPropertyAssignment(node)) {
            addMember(node, node.name.text);
          }
          break;

        case ts.SyntaxKind.PropertySignature:
          if (ts.isPropertySignature(node) && node.name && ts.isIdentifier(node.name)) {
            addMember(node, node.name.text);
          }
          break;

        case ts.SyntaxKind.MethodSignature:
          if (ts.isMethodSignature(node) && node.name && ts.isIdentifier(node.name)) {
            addMember(node, node.name.text);
          }
          break;

        case ts.SyntaxKind.ExpressionStatement:
          // Handle call expressions like watch(), onBeforeMount(), etc.
          if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
            const callExpr = node.expression;
            if (ts.isIdentifier(callExpr.expression)) {
              addMember(node, callExpr.expression.text);
            }
          }
          break;
      }
    };

    // Visit direct children of the scope
    if (ts.isClassDeclaration(scopeNode) || ts.isInterfaceDeclaration(scopeNode)) {
      scopeNode.members?.forEach(visitNode);
    } else if (ts.isObjectLiteralExpression(scopeNode)) {
      scopeNode.properties.forEach(visitNode);
    } else if (ts.isBlock(scopeNode)) {
      scopeNode.statements.forEach(visitNode);
    } else if (ts.isSourceFile(scopeNode)) {
      scopeNode.statements.forEach(visitNode);
    } else {
      // For other scope types, visit all direct children
      scopeNode.getChildren().forEach(visitNode);
    }

    // Sort members by their position in the file
    return members.sort((a, b) => {
      const aStart = a.range.start;
      const bStart = b.range.start;
      if (aStart.line !== bStart.line) {
        return aStart.line - bStart.line;
      }
      return aStart.character - bStart.character;
    });
  }

  // ========================================
  // NODE FINDING AND VALIDATION
  // ========================================

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
    return true; // Simplified for now - we can add specific validation later
  }

  // ========================================
  // RANGE CALCULATION
  // ========================================

  private getNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    return this.nodeToRange(document, node);
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  private nodeToRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    const start = document.positionAt(node.getStart());
    const end = document.positionAt(node.getEnd());
    return new vscode.Range(start, end);
  }

  /**
   * Check if a node is a function node
   */
  private isFunctionNode(node: ts.Node): boolean {
    return ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node);
  }

  /**
   * Check if a node is a scope container
   */
  private isScopeContainer(node: ts.Node): boolean {
    return ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isObjectLiteralExpression(node) ||
      ts.isSourceFile(node) ||
      ts.isModuleDeclaration(node) ||
      (ts.isBlock(node) && this.isDirectFunctionBody(node)) ||
      ts.isBlock(node) ||
      this.isFunctionNode(node);
  }

  /**
   * Check if a scope type is preferred for member navigation
   */
  private isPreferredScope(node: ts.Node): boolean {
    return ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isObjectLiteralExpression(node) ||
      ts.isSourceFile(node) ||
      ts.isModuleDeclaration(node) ||
      (ts.isBlock(node) && this.isDirectFunctionBody(node));
  }

  /**
   * Check if a block is directly the body of a function
   */
  private isDirectFunctionBody(node: ts.Node): boolean {
    if (!ts.isBlock(node) || !node.parent) {
      return false;
    }

    return ts.isFunctionDeclaration(node.parent) ||
      ts.isFunctionExpression(node.parent) ||
      ts.isArrowFunction(node.parent) ||
      ts.isMethodDeclaration(node.parent) ||
      ts.isConstructorDeclaration(node.parent);
  }

  /**
   * Check if a node contains a position
   */
  private nodeContainsPosition(node: ts.Node, position: number): boolean {
    return node.getStart() <= position && position < node.getEnd();
  }
} 