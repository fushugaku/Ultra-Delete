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

      // Find the most specific node at the position
      const node = this.findMostSpecificNodeAtPosition(sourceFile, offset, targetKinds);
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

  private findMostSpecificNodeAtPosition(
    node: ts.Node,
    position: number,
    targetKinds: ts.SyntaxKind[]
  ): ts.Node | null {
    // Collect all matching nodes that contain the position
    const matchingNodes: ts.Node[] = [];
    this.collectMatchingNodes(node, position, targetKinds, matchingNodes);

    if (matchingNodes.length === 0) {
      return null;
    }

    // Return the most specific (smallest) node
    return matchingNodes.reduce((smallest, current) => {
      const smallestSize = smallest.getEnd() - smallest.getStart();
      const currentSize = current.getEnd() - current.getStart();
      return currentSize < smallestSize ? current : smallest;
    });
  }

  private collectMatchingNodes(
    node: ts.Node,
    position: number,
    targetKinds: ts.SyntaxKind[],
    results: ts.Node[]
  ): void {
    // Check if position is within this node
    if (position < node.getStart() || position > node.getEnd()) {
      return;
    }

    // Check if this node matches our target kinds
    if (targetKinds.includes(node.kind)) {
      results.push(node);
    }

    // Recursively check children
    ts.forEachChild(node, (child) => {
      this.collectMatchingNodes(child, position, targetKinds, results);
    });
  }

  private getNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // Special handling for different node types
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
        // For object properties, include the entire property with value
        return this.getPropertyRange(document, node);

      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.Constructor:
        // For class members, include the entire member
        return this.getClassMemberNodeRange(document, node);

      default:
        return this.nodeToRange(document, node);
    }

    return this.nodeToRange(document, node);
  }

  private getPropertyRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For object properties, we want to include the entire property line
    // including any trailing comma
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
    // For class members, include any decorators and modifiers
    let startNode = node;

    // Check if there are decorators above this member
    if (node.parent && ts.isClassDeclaration(node.parent)) {
      const classNode = node.parent as ts.ClassDeclaration;
      const memberIndex = classNode.members.indexOf(node as any);

      if (memberIndex > 0) {
        // Check if previous member ends on a different line
        const prevMember = classNode.members[memberIndex - 1];
        const prevEnd = document.positionAt(prevMember.getEnd());
        const currentStart = document.positionAt(node.getStart());

        if (prevEnd.line < currentStart.line - 1) {
          // There might be decorators or comments, include them
          const startLine = prevEnd.line + 1;
          const startPos = new vscode.Position(startLine, 0);
          const endPos = document.positionAt(node.getEnd());
          return new vscode.Range(startPos, endPos);
        }
      }
    }

    return this.nodeToRange(document, startNode);
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

  // New methods for function arguments and types
  getFunctionArgumentRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.Parameter
    ]);
  }

  getTypeRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.TypeReference,
      ts.SyntaxKind.TypeLiteral,
      ts.SyntaxKind.UnionType,
      ts.SyntaxKind.IntersectionType,
      ts.SyntaxKind.ArrayType,
      ts.SyntaxKind.TupleType,
      ts.SyntaxKind.FunctionType,
      ts.SyntaxKind.ConstructorType,
      ts.SyntaxKind.TypeQuery,
      ts.SyntaxKind.TypeOperator,
      ts.SyntaxKind.IndexedAccessType,
      ts.SyntaxKind.MappedType,
      ts.SyntaxKind.ConditionalType,
      ts.SyntaxKind.InferType,
      ts.SyntaxKind.ParenthesizedType,
      ts.SyntaxKind.ThisType,
      ts.SyntaxKind.TypePredicate,
      ts.SyntaxKind.LiteralType
    ]);
  }

  getGenericArgumentRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.TypeParameter
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