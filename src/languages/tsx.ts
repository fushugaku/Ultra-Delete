import * as vscode from 'vscode';
import * as ts from 'typescript';
import { BaseLanguageHandler, ElementType } from './base/baseLanguage';

export class TSXHandler extends BaseLanguageHandler {
  languageIds = ['tsx', 'typescriptreact'];

  getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.ClassDeclaration,
      ts.SyntaxKind.InterfaceDeclaration,
      ts.SyntaxKind.TypeAliasDeclaration,
      ts.SyntaxKind.EnumDeclaration,
      ts.SyntaxKind.ModuleDeclaration,
      ts.SyntaxKind.NamespaceExportDeclaration
    ], true);
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
      ts.SyntaxKind.PropertySignature,
      ts.SyntaxKind.JsxAttribute,
      ts.SyntaxKind.JsxSpreadAttribute
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

  getJsxElementRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.JsxElement,
      ts.SyntaxKind.JsxSelfClosingElement,
      ts.SyntaxKind.JsxFragment
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

  private getElementRangeUsingAST(
    document: vscode.TextDocument,
    position: vscode.Position,
    targetKinds: ts.SyntaxKind[],
    strictClassDetection: boolean = false
  ): vscode.Range | null {
    try {
      const sourceFile = this.createSourceFile(document);
      const offset = document.offsetAt(position);

      const node = this.findMostSpecificNodeAtPosition(sourceFile, offset, targetKinds, strictClassDetection);
      if (!node) {
        return null;
      }

      return this.getNodeRange(document, node);
    } catch (error) {
      console.error('Error parsing TSX:', error);
      return null;
    }
  }

  private createSourceFile(document: vscode.TextDocument): ts.SourceFile {
    return ts.createSourceFile(
      document.fileName,
      document.getText(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
  }

  private findMostSpecificNodeAtPosition(
    node: ts.Node,
    position: number,
    targetKinds: ts.SyntaxKind[],
    strictClassDetection: boolean = false
  ): ts.Node | null {
    const matchingNodes: ts.Node[] = [];
    this.collectMatchingNodes(node, position, targetKinds, matchingNodes, strictClassDetection);

    if (matchingNodes.length === 0) {
      return null;
    }

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
    results: ts.Node[],
    strictClassDetection: boolean = false
  ): void {
    if (position < node.getStart() || position > node.getEnd()) {
      return;
    }

    if (targetKinds.includes(node.kind)) {
      if (strictClassDetection && this.isClassLikeDeclaration(node.kind)) {
        if (this.isCursorOnDeclarationLine(node, position)) {
          results.push(node);
        }
      } else {
        results.push(node);
      }
    }

    ts.forEachChild(node, (child) => {
      this.collectMatchingNodes(child, position, targetKinds, results, strictClassDetection);
    });
  }

  private isClassLikeDeclaration(kind: ts.SyntaxKind): boolean {
    return [
      ts.SyntaxKind.ClassDeclaration,
      ts.SyntaxKind.InterfaceDeclaration,
      ts.SyntaxKind.TypeAliasDeclaration,
      ts.SyntaxKind.EnumDeclaration,
      ts.SyntaxKind.ModuleDeclaration,
      ts.SyntaxKind.NamespaceExportDeclaration
    ].includes(kind);
  }

  private isCursorOnDeclarationLine(node: ts.Node, position: number): boolean {
    const sourceFile = node.getSourceFile();
    const nodeStart = node.getStart();
    const nodeStartLine = sourceFile.getLineAndCharacterOfPosition(nodeStart).line;
    const cursorLine = sourceFile.getLineAndCharacterOfPosition(position).line;

    return Math.abs(cursorLine - nodeStartLine) <= 1;
  }

  private getNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    switch (node.kind) {
      case ts.SyntaxKind.Parameter:
        return this.getParameterRange(document, node);

      case ts.SyntaxKind.TypeParameter:
        return this.getTypeParameterRange(document, node);

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

      case ts.SyntaxKind.JsxAttribute:
        return this.nodeToRange(document, node);

      case ts.SyntaxKind.JsxElement:
      case ts.SyntaxKind.JsxSelfClosingElement:
      case ts.SyntaxKind.JsxFragment:
        return this.nodeToRange(document, node);

      // Type-related nodes
      case ts.SyntaxKind.TypeReference:
      case ts.SyntaxKind.TypeLiteral:
      case ts.SyntaxKind.UnionType:
      case ts.SyntaxKind.IntersectionType:
      case ts.SyntaxKind.ArrayType:
      case ts.SyntaxKind.TupleType:
      case ts.SyntaxKind.FunctionType:
      case ts.SyntaxKind.ConstructorType:
      case ts.SyntaxKind.TypeQuery:
      case ts.SyntaxKind.TypeOperator:
      case ts.SyntaxKind.IndexedAccessType:
      case ts.SyntaxKind.MappedType:
      case ts.SyntaxKind.ConditionalType:
      case ts.SyntaxKind.InferType:
      case ts.SyntaxKind.ParenthesizedType:
      case ts.SyntaxKind.ThisType:
      case ts.SyntaxKind.TypePredicate:
      case ts.SyntaxKind.LiteralType:
        return this.getTypeNodeRange(document, node);

      default:
        return this.nodeToRange(document, node);
    }

    return this.nodeToRange(document, node);
  }

  private getParameterRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For function parameters, include the entire parameter with type annotation
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

  private getTypeParameterRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For generic type parameters like <T>, <K extends string>
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

  private getTypeNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For type annotations, we might want to include the preceding colon
    const start = document.positionAt(node.getStart());
    const end = document.positionAt(node.getEnd());

    // Check if there's a colon before the type
    const startLine = document.lineAt(start.line);
    const textBeforeType = startLine.text.substring(0, start.character);
    const colonMatch = textBeforeType.match(/:\s*$/);

    if (colonMatch) {
      const colonStart = new vscode.Position(start.line, start.character - colonMatch[0].length);
      return new vscode.Range(colonStart, end);
    }

    return new vscode.Range(start, end);
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
    if (node.parent && ts.isClassDeclaration(node.parent)) {
      const classNode = node.parent as ts.ClassDeclaration;
      const memberIndex = classNode.members.indexOf(node as any);

      if (memberIndex > 0) {
        const prevMember = classNode.members[memberIndex - 1];
        const prevEnd = document.positionAt(prevMember.getEnd());
        const currentStart = document.positionAt(node.getStart());

        if (prevEnd.line < currentStart.line - 1) {
          const startLine = prevEnd.line + 1;
          const startPos = new vscode.Position(startLine, 0);
          const endPos = document.positionAt(node.getEnd());
          return new vscode.Range(startPos, endPos);
        }
      }
    }

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

  // Required methods from base class
  getClassPatterns() { return []; }
  getFunctionPatterns() { return []; }
  getVariablePatterns() { return []; }
  getObjectKeyPatterns() { return []; }
  getClassMemberPatterns() { return []; }
  getMultilineStringPatterns() { return []; }
}