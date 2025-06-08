import * as vscode from 'vscode';
import * as ts from 'typescript';

export interface ClassMember {
  range: vscode.Range;
  text: string;
  name: string;
  node: ts.Node;
  kind: ts.SyntaxKind;
}

export interface ClassInfo {
  range: vscode.Range;
  name: string;
  node: ts.ClassDeclaration;
  members: ClassMember[];
}

export class TypeScriptClassParser {

  /**
   * Get the range of a class declaration at the given position
   */
  getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.ClassDeclaration,
      ts.SyntaxKind.ClassExpression
    ]);
  }

  /**
   * Get the range of a class member at the given position
   */
  getClassMemberRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    const range = this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.MethodDeclaration,
      ts.SyntaxKind.PropertyDeclaration,
      ts.SyntaxKind.GetAccessor,
      ts.SyntaxKind.SetAccessor,
      ts.SyntaxKind.Constructor
    ]);

    if (range) {
      return range;
    }

    if (this.isAccessModifier(word)) {
      return this.getClassMemberRangeFromModifier(document, position, word);
    }

    return null;
  }

  /**
   * Find all class members in a class declaration
   */
  getClassMembers(document: vscode.TextDocument, classNode: ts.ClassDeclaration): ClassMember[] {
    const members: ClassMember[] = [];

    if (classNode.members) {
      for (const member of classNode.members) {
        const range = this.nodeToRange(document, member);
        const text = document.getText(range);
        let name = 'constructor';

        if (ts.isConstructorDeclaration(member)) {
          name = 'constructor';
        } else if (member.name && ts.isIdentifier(member.name)) {
          name = member.name.text;
        } else if (member.name && ts.isStringLiteral(member.name)) {
          name = member.name.text;
        }

        members.push({
          range,
          text,
          name,
          node: member,
          kind: member.kind
        });
      }
    }

    return members.sort((a, b) => {
      const aStart = a.range.start;
      const bStart = b.range.start;
      if (aStart.line !== bStart.line) {
        return aStart.line - bStart.line;
      }
      return aStart.character - bStart.character;
    });
  }

  /**
   * Find the class declaration that contains the given position
   */
  findContainingClass(document: vscode.TextDocument, position: vscode.Position): ClassInfo | null {
    const sourceFile = this.createSourceFile(document);
    const offset = document.offsetAt(position);

    const classNode = this.findContainingClassNode(sourceFile, offset);
    if (!classNode) {
      return null;
    }

    const range = this.nodeToRange(document, classNode);
    const name = classNode.name ? classNode.name.text : 'anonymous';
    const members = this.getClassMembers(document, classNode);

    return {
      range,
      name,
      node: classNode,
      members
    };
  }

  /**
   * Find a class member at the given position
   */
  findClassMemberAtPosition(document: vscode.TextDocument, position: vscode.Position): ClassMember | null {
    const classInfo = this.findContainingClass(document, position);
    if (!classInfo) {
      return null;
    }

    const offset = document.offsetAt(position);

    for (const member of classInfo.members) {
      const memberStartOffset = document.offsetAt(member.range.start);
      const memberEndOffset = document.offsetAt(member.range.end);

      if (memberStartOffset <= offset && offset <= memberEndOffset) {
        return member;
      }
    }

    return null;
  }

  /**
   * Check if a node is a class member node
   */
  isClassMemberNode(node: ts.Node): boolean {
    return ts.isMethodDeclaration(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node) ||
      ts.isConstructorDeclaration(node);
  }

  /**
   * Check if a word is an access modifier
   */
  private isAccessModifier(word: string): boolean {
    return ['public', 'private', 'protected', 'static', 'readonly', 'abstract'].includes(word);
  }

  /**
   * Get class member range from access modifier
   */
  private getClassMemberRangeFromModifier(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string
  ): vscode.Range | null {
    const sourceFile = this.createSourceFile(document);
    const offset = document.offsetAt(position);

    const classMember = this.findClassMemberWithModifierAtPosition(sourceFile, offset, word);
    if (!classMember) {
      return null;
    }

    return this.getClassMemberNodeRange(document, classMember);
  }

  /**
   * Find class member with modifier at position
   */
  private findClassMemberWithModifierAtPosition(
    node: ts.Node,
    position: number,
    modifierWord: string
  ): ts.Node | null {
    if (this.isClassMemberNode(node)) {
      if (this.findModifierInNode(node, position, modifierWord)) {
        return node;
      }
    }

    let result: ts.Node | null = null;
    ts.forEachChild(node, child => {
      if (!result && this.nodeContainsPosition(child, position)) {
        result = this.findClassMemberWithModifierAtPosition(child, position, modifierWord);
      }
    });

    return result;
  }

  /**
   * Find modifier in node
   */
  private findModifierInNode(node: ts.Node, position: number, modifierWord: string): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (!modifiers) {
      return false;
    }

    for (const modifier of modifiers) {
      const modifierStart = modifier.getStart();
      const modifierEnd = modifier.getEnd();

      if (modifierStart <= position && position <= modifierEnd) {
        const sourceText = node.getSourceFile().getFullText();
        const modifierText = sourceText.substring(modifierStart, modifierEnd);
        return modifierText.trim() === modifierWord;
      }
    }

    return false;
  }

  /**
 * Get class member node range
 */
  private getClassMemberNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    let startNode = node;

    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (modifiers && modifiers.length > 0) {
      startNode = modifiers[0];
    }

    const start = document.positionAt(startNode.getStart());
    const end = document.positionAt(node.getEnd());

    return new vscode.Range(start, end);
  }

  /**
   * Find containing class node
   */
  private findContainingClassNode(node: ts.Node, position: number): ts.ClassDeclaration | null {
    if (ts.isClassDeclaration(node) && this.nodeContainsPosition(node, position)) {
      return node;
    }

    let result: ts.ClassDeclaration | null = null;
    ts.forEachChild(node, child => {
      if (!result && this.nodeContainsPosition(child, position)) {
        result = this.findContainingClassNode(child, position);
      }
    });

    return result;
  }

  /**
   * Get element range using AST
   */
  private getElementRangeUsingAST(
    document: vscode.TextDocument,
    position: vscode.Position,
    targetKinds: ts.SyntaxKind[]
  ): vscode.Range | null {
    try {
      const sourceFile = this.createSourceFile(document);
      const offset = document.offsetAt(position);

      const targetNode = this.findDirectNodeAtPosition(sourceFile, offset, targetKinds);
      if (!targetNode) {
        return null;
      }

      return this.getNodeRange(document, targetNode);
    } catch (error) {
      console.error('Error in getElementRangeUsingAST:', error);
      return null;
    }
  }

  /**
   * Find direct node at position
   */
  private findDirectNodeAtPosition(
    node: ts.Node,
    position: number,
    targetKinds: ts.SyntaxKind[]
  ): ts.Node | null {
    if (targetKinds.includes(node.kind) && this.nodeContainsPosition(node, position)) {
      return node;
    }

    let result: ts.Node | null = null;
    ts.forEachChild(node, child => {
      if (!result && this.nodeContainsPosition(child, position)) {
        result = this.findDirectNodeAtPosition(child, position, targetKinds);
      }
    });

    return result;
  }

  /**
 * Get node range
 */
  private getNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      let startNode: ts.Node = node;

      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      if (modifiers && modifiers.length > 0) {
        startNode = modifiers[0];
      }

      const start = document.positionAt(startNode.getStart());
      const end = document.positionAt(node.getEnd());

      return new vscode.Range(start, end);
    }

    return this.getClassMemberNodeRange(document, node);
  }

  /**
   * Convert node to range
   */
  private nodeToRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    const start = document.positionAt(node.getStart());
    const end = document.positionAt(node.getEnd());
    return new vscode.Range(start, end);
  }

  /**
   * Check if node contains position
   */
  private nodeContainsPosition(node: ts.Node, position: number): boolean {
    return node.getStart() <= position && position <= node.getEnd();
  }

  /**
   * Create TypeScript source file from document
   */
  private createSourceFile(document: vscode.TextDocument): ts.SourceFile {
    const fileName = document.fileName;
    const sourceCode = document.getText();

    let scriptKind = ts.ScriptKind.TS;
    if (fileName.endsWith('.tsx')) {
      scriptKind = ts.ScriptKind.TSX;
    } else if (fileName.endsWith('.jsx')) {
      scriptKind = ts.ScriptKind.JSX;
    } else if (fileName.endsWith('.js')) {
      scriptKind = ts.ScriptKind.JS;
    }

    return ts.createSourceFile(
      fileName,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );
  }
} 