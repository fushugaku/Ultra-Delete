import * as vscode from 'vscode';

export interface DocumentRange {
  start: vscode.Position;
  end: vscode.Position;
}

export interface MemberMovementResult {
  newPosition: vscode.Position;
  moved: boolean;
}

export class EditorService {
  static convertOffsetToPosition(document: vscode.TextDocument, offset: number): vscode.Position {
    return document.positionAt(offset);
  }

  static convertPositionToOffset(document: vscode.TextDocument, position: vscode.Position): number {
    return document.offsetAt(position);
  }

  static convertRangeFromOffsets(document: vscode.TextDocument, start: number, end: number): vscode.Range {
    return new vscode.Range(
      this.convertOffsetToPosition(document, start),
      this.convertOffsetToPosition(document, end)
    );
  }

  static async performEdit(document: vscode.TextDocument, edits: Array<{ range: vscode.Range; text: string }>): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) return false;

    return editor.edit(editBuilder => {
      edits.forEach(edit => {
        if (edit.text === '') {
          editBuilder.delete(edit.range);
        } else {
          editBuilder.replace(edit.range, edit.text);
        }
      });
    });
  }

  static setSelection(editor: vscode.TextEditor, range: vscode.Range): void {
    editor.selection = new vscode.Selection(range.start, range.end);
  }

  static setSelections(editor: vscode.TextEditor, ranges: vscode.Range[]): void {
    editor.selections = ranges.map(range => new vscode.Selection(range.start, range.end));
  }

  static setCursorPosition(editor: vscode.TextEditor, position: vscode.Position): void {
    editor.selection = new vscode.Selection(position, position);
  }

  static async moveToPosition(position: vscode.Position): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    this.setCursorPosition(editor, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }

  static findMemberDeclarationLine(document: vscode.TextDocument, memberName: string, searchRange: vscode.Range): vscode.Position | null {
    for (let lineNum = searchRange.start.line; lineNum <= searchRange.end.line; lineNum++) {
      const line = document.lineAt(lineNum);
      const position = this.findMemberInLine(line.text, memberName, lineNum);
      if (position) return position;
    }
    return null;
  }

  private static findMemberInLine(lineText: string, memberName: string, lineNum: number): vscode.Position | null {
    const trimmed = lineText.trim();

    const patterns = [
      () => this.isVariableDeclaration(trimmed, memberName),
      () => this.isFunctionDeclaration(trimmed, memberName),
      () => this.isMethodDeclaration(trimmed, memberName),
      () => this.isPropertyDeclaration(trimmed, memberName)
    ];

    for (const pattern of patterns) {
      if (pattern()) {
        const index = this.findMemberNameIndex(lineText, memberName);
        if (index !== -1) {
          return new vscode.Position(lineNum, index);
        }
      }
    }

    return null;
  }

  private static isVariableDeclaration(trimmed: string, memberName: string): boolean {
    const patterns = [`const ${memberName}`, `let ${memberName}`, `var ${memberName}`];
    return patterns.some(pattern => trimmed.startsWith(pattern));
  }

  private static isFunctionDeclaration(trimmed: string, memberName: string): boolean {
    const patterns = [
      `function ${memberName}`,
      `async function ${memberName}`,
      `${memberName} = function`,
      `${memberName} = async function`,
      `${memberName}:`
    ];
    return patterns.some(pattern => trimmed.includes(pattern));
  }

  private static isMethodDeclaration(trimmed: string, memberName: string): boolean {
    const patterns = [
      `${memberName}(`,
      `async ${memberName}(`,
      `get ${memberName}(`,
      `set ${memberName}(`
    ];
    return patterns.some(pattern => trimmed.includes(pattern));
  }

  private static isPropertyDeclaration(trimmed: string, memberName: string): boolean {
    return trimmed.includes(`${memberName}:`) || trimmed.includes(`${memberName} =`);
  }

  private static findMemberNameIndex(lineText: string, memberName: string): number {
    const keywords = ['const', 'let', 'var', 'function', 'async', 'get', 'set'];

    for (const keyword of keywords) {
      const index = this.findNameAfterKeyword(lineText, memberName, keyword);
      if (index !== -1) return index;
    }

    const directIndex = lineText.indexOf(memberName);
    if (directIndex !== -1 && this.isValidNameBoundary(lineText, directIndex, memberName)) {
      return directIndex;
    }

    return -1;
  }

  private static findNameAfterKeyword(lineText: string, memberName: string, keyword: string): number {
    const keywordIndex = lineText.indexOf(keyword);
    if (keywordIndex === -1) return -1;

    const searchStart = keywordIndex + keyword.length;
    const nameIndex = lineText.indexOf(memberName, searchStart);

    if (nameIndex !== -1 && this.isValidNameBoundary(lineText, nameIndex, memberName)) {
      return nameIndex;
    }

    return -1;
  }

  private static isValidNameBoundary(lineText: string, index: number, memberName: string): boolean {
    const before = index > 0 ? lineText[index - 1] : ' ';
    const after = index + memberName.length < lineText.length ? lineText[index + memberName.length] : ' ';

    const isIdentifierChar = (char: string) => /[a-zA-Z0-9_$]/.test(char);

    return !isIdentifierChar(before) && !isIdentifierChar(after);
  }
} 