import * as vscode from 'vscode';
import { ASTService, ParsedMember, ParsedScope } from './ASTService';
import { EditorService } from './EditorService';

export interface MemberWithRange {
  name: string;
  range: vscode.Range;
  text: string;
  index: number;
}

export class MemberManagementService {
  constructor(
    private astService: ASTService,
    private editorService: typeof EditorService
  ) { }

  moveMemberUp(document: vscode.TextDocument, position: vscode.Position): { newPosition: vscode.Position; moved: boolean } {
    this.moveMember(document, position, 'up');
    return { newPosition: position, moved: false };
  }

  moveMemberDown(document: vscode.TextDocument, position: vscode.Position): { newPosition: vscode.Position; moved: boolean } {
    this.moveMember(document, position, 'down');
    return { newPosition: position, moved: false };
  }

  getMembersInScope(document: vscode.TextDocument, position: vscode.Position): MemberWithRange[] {
    const sourceFile = this.astService.createSourceFile(document.getText(), document.fileName);
    const offset = this.editorService.convertPositionToOffset(document, position);

    const scope = this.astService.findContainingScope(sourceFile, offset);
    if (!scope) return [];

    return scope.members.map((member, index) => ({
      name: member.name,
      range: this.editorService.convertRangeFromOffsets(document, member.range.start, member.range.end),
      text: document.getText(this.editorService.convertRangeFromOffsets(document, member.range.start, member.range.end)),
      index
    }));
  }

  getSelectedMembers(document: vscode.TextDocument, selections: readonly vscode.Selection[]): MemberWithRange[] {
    const allMembers = this.getMembersInScope(document, selections[0].active);
    const selectedMembers: MemberWithRange[] = [];

    for (const member of allMembers) {
      const memberIntersectsSelection = selections.some(selection =>
        this.selectionIntersectsRange(selection, member.range)
      );

      if (memberIntersectsSelection) {
        selectedMembers.push(member);
      }
    }

    return selectedMembers.sort((a, b) => a.index - b.index);
  }

  sortMembersByName(members: MemberWithRange[], ascending: boolean = true): MemberWithRange[] {
    return [...members].sort((a, b) => {
      const comparison = a.name.localeCompare(b.name);
      return ascending ? comparison : -comparison;
    });
  }

  async applySortedMembers(document: vscode.TextDocument, originalMembers: MemberWithRange[], sortedMembers: MemberWithRange[]): Promise<boolean> {
    const edits = originalMembers.map((original, index) => ({
      range: original.range,
      text: sortedMembers[index].text
    }));

    return this.editorService.performEdit(document, edits);
  }

  findNextMember(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
    const members = this.getMembersInScope(document, position);
    if (members.length === 0) return null;

    const currentOffset = this.editorService.convertPositionToOffset(document, position);

    const nextMember = members.find(member => {
      const memberOffset = this.editorService.convertPositionToOffset(document, member.range.start);
      return memberOffset > currentOffset;
    });

    return nextMember?.range || members[0].range;
  }

  private moveMember(document: vscode.TextDocument, position: vscode.Position, direction: 'up' | 'down'): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return;
    }

    const allMembers = this.getMembersInScope(document, position);
    if (allMembers.length < 2) {
      return;
    }

    const selectedMembers = this.getSelectedMembers(document, editor.selections);
    if (selectedMembers.length === 0) {
      return;
    }

    if (selectedMembers.length === 1) {
      this.moveSingleMember(document, selectedMembers[0], allMembers, direction);
    } else {
      this.moveMultipleMembers(document, selectedMembers, allMembers, direction);
    }
  }

  private async moveSingleMember(
    document: vscode.TextDocument,
    member: MemberWithRange,
    allMembers: MemberWithRange[],
    direction: 'up' | 'down'
  ): Promise<void> {
    const currentIndex = member.index;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= allMembers.length) {
      return;
    }

    const targetMember = allMembers[targetIndex];
    const success = await this.swapMembers(document, member, targetMember);

    if (success) {
      const newPosition = direction === 'up' ? targetMember.range.start : targetMember.range.start;
      this.editorService.moveToPosition(newPosition);
    }
  }

  private async moveMultipleMembers(
    document: vscode.TextDocument,
    selectedMembers: MemberWithRange[],
    allMembers: MemberWithRange[],
    direction: 'up' | 'down'
  ): Promise<void> {
    const firstIndex = selectedMembers[0].index;
    const lastIndex = selectedMembers[selectedMembers.length - 1].index;

    let targetIndex: number;
    if (direction === 'up') {
      targetIndex = firstIndex - 1;
      if (targetIndex < 0) return;
    } else {
      targetIndex = lastIndex + 1;
      if (targetIndex >= allMembers.length) return;
    }

    const reorderedMembers = [...allMembers];
    const movingBlock = selectedMembers.map(m => allMembers[m.index]);

    if (direction === 'up') {
      reorderedMembers.splice(firstIndex, selectedMembers.length);
      reorderedMembers.splice(targetIndex, 0, ...movingBlock);
    } else {
      const insertIndex = targetIndex - selectedMembers.length + 1;
      reorderedMembers.splice(firstIndex, selectedMembers.length);
      reorderedMembers.splice(insertIndex, 0, ...movingBlock);
    }

    const edits = allMembers.map((original, index) => ({
      range: original.range,
      text: reorderedMembers[index].text
    }));

    const success = await this.editorService.performEdit(document, edits);

    if (success) {
      const newPosition = direction === 'up'
        ? allMembers[targetIndex].range.start
        : allMembers[targetIndex].range.start;
      this.editorService.moveToPosition(newPosition);
    }
  }

  private async swapMembers(document: vscode.TextDocument, memberA: MemberWithRange, memberB: MemberWithRange): Promise<boolean> {
    const edits = [
      { range: memberA.range, text: memberB.text },
      { range: memberB.range, text: memberA.text }
    ];

    return this.editorService.performEdit(document, edits);
  }

  private selectionIntersectsRange(selection: vscode.Selection, range: vscode.Range): boolean {
    return !(selection.end.isBefore(range.start) || range.end.isBefore(selection.start));
  }
} 