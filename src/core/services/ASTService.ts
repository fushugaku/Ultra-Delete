import * as ts from 'typescript';

export interface ParsedMember {
  node: ts.Node;
  name: string;
  kind: ts.SyntaxKind;
  range: { start: number; end: number };
}

export interface ParsedScope {
  node: ts.Node;
  members: ParsedMember[];
  kind: 'class' | 'interface' | 'object' | 'function' | 'module';
}

export class ASTService {
  createSourceFile(content: string, fileName: string): ts.SourceFile {
    const scriptKind = this.determineScriptKind(fileName);
    return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, scriptKind);
  }

  findContainingScope(sourceFile: ts.SourceFile, position: number): ParsedScope | null {
    const node = this.findScopeNodeAtPosition(sourceFile, position);
    if (!node) return null;

    return {
      node,
      members: this.extractMembers(node),
      kind: this.determineScopeKind(node)
    };
  }

  findMemberAtPosition(sourceFile: ts.SourceFile, position: number): ParsedMember | null {
    const node = this.findNodeAtPosition(sourceFile, position, [
      ts.SyntaxKind.MethodDeclaration,
      ts.SyntaxKind.PropertyDeclaration,
      ts.SyntaxKind.FunctionDeclaration,
      ts.SyntaxKind.VariableStatement
    ]);

    if (!node) return null;

    return {
      node,
      name: this.extractNodeName(node),
      kind: node.kind,
      range: { start: node.getStart(), end: node.getEnd() }
    };
  }

  private determineScriptKind(fileName: string): ts.ScriptKind {
    if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) return ts.ScriptKind.TSX;
    if (fileName.endsWith('.js')) return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
  }

  private findScopeNodeAtPosition(node: ts.Node, position: number): ts.Node | null {
    if (!this.nodeContainsPosition(node, position)) return null;

    if (this.isScopeContainer(node)) {
      const childScope = node.getChildren()
        .map(child => this.findScopeNodeAtPosition(child, position))
        .find(result => result !== null);

      return childScope || node;
    }

    return node.getChildren()
      .map(child => this.findScopeNodeAtPosition(child, position))
      .find(result => result !== null) || null;
  }

  private findNodeAtPosition(node: ts.Node, position: number, targetKinds: ts.SyntaxKind[]): ts.Node | null {
    if (!this.nodeContainsPosition(node, position)) return null;

    if (targetKinds.includes(node.kind)) return node;

    return node.getChildren()
      .map(child => this.findNodeAtPosition(child, position, targetKinds))
      .find(result => result !== null) || null;
  }

  private extractMembers(scopeNode: ts.Node): ParsedMember[] {
    const members: ParsedMember[] = [];

    const addMember = (node: ts.Node) => {
      const name = this.extractNodeName(node);
      if (name) {
        members.push({
          node,
          name,
          kind: node.kind,
          range: { start: node.getStart(), end: node.getEnd() }
        });
      }
    };

    ts.forEachChild(scopeNode, node => {
      if (this.isMemberNode(node)) {
        addMember(node);
      }
    });

    return members;
  }

  private extractNodeName(node: ts.Node): string {
    if (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) {
      return node.name && ts.isIdentifier(node.name) ? node.name.text : '';
    }
    if (ts.isFunctionDeclaration(node)) {
      return node.name?.text || '';
    }
    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations[0];
      return ts.isIdentifier(declaration?.name) ? declaration.name.text : '';
    }
    return '';
  }

  private determineScopeKind(node: ts.Node): 'class' | 'interface' | 'object' | 'function' | 'module' {
    if (ts.isClassDeclaration(node)) return 'class';
    if (ts.isInterfaceDeclaration(node)) return 'interface';
    if (ts.isObjectLiteralExpression(node)) return 'object';
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) return 'function';
    return 'module';
  }

  private isScopeContainer(node: ts.Node): boolean {
    return ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isObjectLiteralExpression(node) ||
      ts.isModuleDeclaration(node) ||
      ts.isSourceFile(node);
  }

  private isMemberNode(node: ts.Node): boolean {
    return ts.isMethodDeclaration(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isVariableStatement(node) ||
      ts.isConstructorDeclaration(node);
  }

  private nodeContainsPosition(node: ts.Node, position: number): boolean {
    return position >= node.getStart() && position < node.getEnd();
  }
} 