import * as vscode from 'vscode';
import * as ts from 'typescript';
import { BaseLanguageHandler } from '../base/baseLanguage';
import { ASTService } from '../../core/services/ASTService';
import { EditorService } from '../../core/services/EditorService';
import { MemberManagementService } from '../../core/services/MemberManagementService';

export class TypeScriptHandlerRefactored extends BaseLanguageHandler {
  languageIds = ['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'];

  private astService = new ASTService();
  private memberService = new MemberManagementService(this.astService, EditorService);

  getImportRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementByKind(document, position, [
      ts.SyntaxKind.ImportDeclaration,
      ts.SyntaxKind.ImportEqualsDeclaration,
      ts.SyntaxKind.ExportDeclaration,
      ts.SyntaxKind.ExportAssignment
    ]);
  }

  getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementByKind(document, position, [
      ts.SyntaxKind.ClassDeclaration,
      ts.SyntaxKind.InterfaceDeclaration,
      ts.SyntaxKind.TypeAliasDeclaration,
      ts.SyntaxKind.EnumDeclaration,
      ts.SyntaxKind.ModuleDeclaration
    ]);
  }

  getFunctionRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const callExpressionRange = this.getElementByKind(document, position, [ts.SyntaxKind.CallExpression]);
    if (callExpressionRange) return callExpressionRange;

    return this.getElementByKind(document, position, [
      ts.SyntaxKind.FunctionDeclaration,
      ts.SyntaxKind.ArrowFunction,
      ts.SyntaxKind.FunctionExpression,
      ts.SyntaxKind.MethodDeclaration
    ]);
  }

  getVariableRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementByKind(document, position, [
      ts.SyntaxKind.VariableStatement,
      ts.SyntaxKind.VariableDeclaration
    ]);
  }

  getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementByKind(document, position, [
      ts.SyntaxKind.PropertyAssignment,
      ts.SyntaxKind.ShorthandPropertyAssignment,
      ts.SyntaxKind.PropertySignature
    ]);
  }

  getClassMemberRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementByKind(document, position, [
      ts.SyntaxKind.MethodDeclaration,
      ts.SyntaxKind.PropertyDeclaration,
      ts.SyntaxKind.GetAccessor,
      ts.SyntaxKind.SetAccessor,
      ts.SyntaxKind.Constructor
    ]);
  }

  getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementByKind(document, position, [
      ts.SyntaxKind.TemplateExpression,
      ts.SyntaxKind.NoSubstitutionTemplateLiteral,
      ts.SyntaxKind.StringLiteral
    ]);
  }

  getFunctionScopeRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
    const sourceFile = this.astService.createSourceFile(document.getText(), document.fileName);
    const offset = EditorService.convertPositionToOffset(document, position);

    const functionNode = this.findContainingFunction(sourceFile, offset);
    if (!functionNode) return null;

    return this.getFunctionBodyRange(document, functionNode);
  }

  getMembersInCurrentScope(document: vscode.TextDocument, position: vscode.Position): Array<{ range: vscode.Range, text: string, name: string }> {
    return this.memberService.getMembersInScope(document, position);
  }

  getNextMemberRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
    return this.memberService.findNextMember(document, position);
  }

  sortMembersByName(members: Array<{ range: vscode.Range, text: string, name: string }>, ascending: boolean = true): Array<{ range: vscode.Range, text: string, name: string }> {
    const membersWithIndex = members.map((member, index) => ({ ...member, index }));
    const sorted = this.memberService.sortMembersByName(membersWithIndex, ascending);
    return sorted.map(({ index, ...member }) => member);
  }

  moveMemberUp(document: vscode.TextDocument, position: vscode.Position): { newPosition: vscode.Position, moved: boolean } | null {
    this.memberService.moveMemberUp(document, position);
    return { newPosition: position, moved: true };
  }

  moveMemberDown(document: vscode.TextDocument, position: vscode.Position): { newPosition: vscode.Position, moved: boolean } | null {
    this.memberService.moveMemberDown(document, position);
    return { newPosition: position, moved: true };
  }

  private getElementByKind(document: vscode.TextDocument, position: vscode.Position, kinds: ts.SyntaxKind[]): vscode.Range | null {
    try {
      const sourceFile = this.astService.createSourceFile(document.getText(), document.fileName);
      const offset = EditorService.convertPositionToOffset(document, position);

      const member = this.astService.findMemberAtPosition(sourceFile, offset);
      if (member && kinds.includes(member.kind)) {
        return EditorService.convertRangeFromOffsets(document, member.range.start, member.range.end);
      }

      return null;
    } catch (error) {
      console.error('Error parsing TypeScript:', error);
      return null;
    }
  }

  private findContainingFunction(node: ts.Node, position: number): ts.Node | null {
    if (this.isFunctionNode(node) && this.nodeContainsPosition(node, position)) {
      return node;
    }

    for (const child of node.getChildren()) {
      if (this.nodeContainsPosition(child, position)) {
        const result = this.findContainingFunction(child, position);
        if (result) return result;
      }
    }

    return null;
  }

  private getFunctionBodyRange(document: vscode.TextDocument, functionNode: ts.Node): vscode.Range | null {
    let body: ts.Node | undefined;

    if (ts.isFunctionDeclaration(functionNode) || ts.isFunctionExpression(functionNode) || ts.isMethodDeclaration(functionNode)) {
      body = functionNode.body;
    } else if (ts.isArrowFunction(functionNode)) {
      body = functionNode.body;
    }

    if (!body) return null;

    if (ts.isBlock(body)) {
      const start = EditorService.convertOffsetToPosition(document, body.getStart() + 1);
      const end = EditorService.convertOffsetToPosition(document, body.getEnd() - 1);
      return new vscode.Range(start, end);
    }

    const start = EditorService.convertOffsetToPosition(document, body.getStart());
    const end = EditorService.convertOffsetToPosition(document, body.getEnd());
    return new vscode.Range(start, end);
  }

  private isFunctionNode(node: ts.Node): boolean {
    return ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node);
  }

  private nodeContainsPosition(node: ts.Node, position: number): boolean {
    return position >= node.getStart() && position < node.getEnd();
  }

  getClassPatterns() { return []; }
  getFunctionPatterns() { return []; }
  getVariablePatterns() { return []; }
  getObjectKeyPatterns() { return []; }
  getClassMemberPatterns() { return []; }
  getMultilineStringPatterns() { return []; }
} 