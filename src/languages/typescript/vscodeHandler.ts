import * as vscode from 'vscode';
import { TypeScriptASTParser } from './astParser';

/**
 * VSCode-specific TypeScript handler for code actions and member movements
 */
export class TypeScriptVSCodeHandler {
  private astParser: TypeScriptASTParser;

  constructor() {
    this.astParser = new TypeScriptASTParser();
  }

  // ========================================
  // PUBLIC API METHODS
  // ========================================

  /**
   * Get the range of the current function scope (body contents)
   */
  getFunctionScopeRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
    try {
      const sourceFile = this.astParser.createSourceFile(document);
      const offset = document.offsetAt(position);

      // Find the function that contains this position
      const functionNode = this.astParser.findContainingFunction(sourceFile, offset);
      if (!functionNode) {
        return null;
      }

      // Get the function body range
      return this.astParser.getFunctionBodyRange(document, functionNode);
    } catch (error) {
      console.error('Error getting function scope range:', error);
      return null;
    }
  }

  /**
   * Get all members at the current scope level
   */
  getMembersInCurrentScope(document: vscode.TextDocument, position: vscode.Position): Array<{ range: vscode.Range, text: string, name: string }> {
    try {
      const sourceFile = this.astParser.createSourceFile(document);
      const offset = document.offsetAt(position);

      console.log(`Getting members in current scope at position ${position.line}:${position.character}`);

      // Find the containing scope (class, object, module, etc.)
      const scopeNode = this.astParser.findContainingScope(sourceFile, offset);
      if (!scopeNode) {
        console.log('No scope node found');
        return [];
      }

      console.log(`Found scope node of kind: ${scopeNode.kind}`);
      const members = this.astParser.extractMembersFromScope(document, scopeNode);
      console.log(`Extracted ${members.length} members:`, members.map(m => m.name));

      return members;
    } catch (error) {
      console.error('Error getting members in current scope:', error);
      return [];
    }
  }

  /**
   * Find the next member after the current position
   */
  getNextMemberRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
    const members = this.getMembersInCurrentScope(document, position);
    if (members.length === 0) {
      console.log('No members found for next member navigation');
      return null;
    }

    console.log(`Found ${members.length} members, looking for next after position ${position.line}:${position.character}`);

    // Find the first member that starts after the current position
    const currentOffset = document.offsetAt(position);
    for (const member of members) {
      const memberOffset = document.offsetAt(member.range.start);
      console.log(`Checking member "${member.name}" at offset ${memberOffset} vs current ${currentOffset}`);
      if (memberOffset > currentOffset) {
        console.log(`Found next member: ${member.name}`);
        return member.range;
      }
    }

    // If no member found after current position, wrap to the first member
    console.log(`No member after current position, wrapping to first: ${members[0]?.name}`);
    return members[0].range;
  }

  /**
   * Sort members by their names
   */
  sortMembersByName(members: Array<{ range: vscode.Range, text: string, name: string }>, ascending: boolean = true): Array<{ range: vscode.Range, text: string, name: string }> {
    return members.sort((a, b) => {
      const comparison = a.name.localeCompare(b.name);
      return ascending ? comparison : -comparison;
    });
  }

  /**
   * Move a member up in its scope
   */
  moveMemberUp(document: vscode.TextDocument, position: vscode.Position): { newPosition: vscode.Position, moved: boolean } | null {
    return this.moveMember(document, position, 'up');
  }

  /**
   * Move a member down in its scope
   */
  moveMemberDown(document: vscode.TextDocument, position: vscode.Position): { newPosition: vscode.Position, moved: boolean } | null {
    return this.moveMember(document, position, 'down');
  }

  // ========================================
  // PRIVATE MEMBER MOVEMENT METHODS
  // ========================================

  /**
   * Move a member up or down in its scope
   */
  private moveMember(document: vscode.TextDocument, position: vscode.Position, direction: 'up' | 'down'): { newPosition: vscode.Position, moved: boolean } | null {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document !== document) {
        return { newPosition: position, moved: false };
      }

      const members = this.getMembersInCurrentScope(document, position);
      if (members.length < 2) {
        console.log('Need at least 2 members to move');
        return { newPosition: position, moved: false };
      }

      // Get all selected members based on current selections
      const selectedMembers = this.getSelectedMembers(document, editor.selections, members);

      if (selectedMembers.length === 0) {
        console.log('No members found in selection');
        return { newPosition: position, moved: false };
      }

      if (selectedMembers.length === 1) {
        // Single member - use existing logic
        return this.moveSingleMember(document, selectedMembers[0], members, direction);
      } else {
        // Multiple members - move as a block
        return this.moveMultipleMembers(document, selectedMembers, members, direction);
      }
    } catch (error) {
      console.error('Error moving member:', error);
      return { newPosition: position, moved: false };
    }
  }

  /**
   * Get all members that intersect with the current selections
   */
  private getSelectedMembers(document: vscode.TextDocument, selections: readonly vscode.Selection[], allMembers: { range: vscode.Range, text: string, name: string }[]): { range: vscode.Range, text: string, name: string, index: number }[] {
    const selectedMembers: { range: vscode.Range, text: string, name: string, index: number }[] = [];

    console.log('\n=== SELECTED MEMBERS DEBUG ===');
    console.log('All members in scope:');
    allMembers.forEach((member, i) => {
      console.log(`  ${i}: "${member.name}" at line ${member.range.start.line + 1}`);
    });

    for (let i = 0; i < allMembers.length; i++) {
      const member = allMembers[i];

      // Check if any selection intersects with this member's range
      for (const selection of selections) {
        if (this.selectionIntersectsWithMemberRange(selection, member)) {
          selectedMembers.push({ ...member, index: i });
          console.log(`Selected member: "${member.name}" (index ${i})`);
          break; // Don't add the same member multiple times
        }
      }
    }

    console.log(`Total selected members: ${selectedMembers.length}`);

    // Sort by index to maintain order
    selectedMembers.sort((a, b) => a.index - b.index);

    return selectedMembers;
  }

  /**
   * Check if a selection intersects with a member's range
   */
  private selectionIntersectsWithMemberRange(
    selection: vscode.Selection,
    member: { range: vscode.Range, text: string, name: string }
  ): boolean {
    // Check if cursor line is anywhere within the member's range
    const selectionStartLine = selection.start.line;
    const selectionEndLine = selection.end.line;
    const memberStartLine = member.range.start.line;
    const memberEndLine = member.range.end.line;

    console.log(`  Checking selection lines ${selectionStartLine + 1}-${selectionEndLine + 1} vs member "${member.name}" range ${memberStartLine + 1}-${memberEndLine + 1}`);

    // Check if the selection overlaps with any part of the member's range
    const intersects = !(selectionEndLine < memberStartLine || selectionStartLine > memberEndLine);

    if (intersects) {
      console.log(`  ✓ Selection intersects with member "${member.name}"`);
    }

    return intersects;
  }

  /**
   * Move a single member (original logic)
   */
  private moveSingleMember(
    document: vscode.TextDocument,
    selectedMember: { range: vscode.Range, text: string, name: string, index: number },
    allMembers: { range: vscode.Range, text: string, name: string }[],
    direction: 'up' | 'down'
  ): { newPosition: vscode.Position, moved: boolean } {
    const currentMemberIndex = selectedMember.index;
    const targetIndex = direction === 'up' ? currentMemberIndex - 1 : currentMemberIndex + 1;

    // Check bounds
    if (targetIndex < 0 || targetIndex >= allMembers.length) {
      console.log(`Cannot move member ${direction}: already at ${direction === 'up' ? 'top' : 'bottom'}`);
      return { newPosition: selectedMember.range.start, moved: false };
    }

    const currentMember = allMembers[currentMemberIndex];
    const targetMember = allMembers[targetIndex];

    console.log(`Moving member "${currentMember.name}" ${direction} (swapping with "${targetMember.name}")`);

    // Perform the swap and get the new position
    const swapResult = this.swapMembers(document, currentMember, targetMember, direction);

    return swapResult;
  }

  /**
   * Move multiple members as a block
   */
  private moveMultipleMembers(
    document: vscode.TextDocument,
    selectedMembers: { range: vscode.Range, text: string, name: string, index: number }[],
    allMembers: { range: vscode.Range, text: string, name: string }[],
    direction: 'up' | 'down'
  ): { newPosition: vscode.Position, moved: boolean } {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return { newPosition: selectedMembers[0].range.start, moved: false };
    }

    // Get the range of indices for selected members
    const minIndex = Math.min(...selectedMembers.map(m => m.index));
    const maxIndex = Math.max(...selectedMembers.map(m => m.index));

    // Check if we can move the block
    if (direction === 'up' && minIndex === 0) {
      console.log('Cannot move block up: already at top');
      return { newPosition: selectedMembers[0].range.start, moved: false };
    }

    if (direction === 'down' && maxIndex === allMembers.length - 1) {
      console.log('Cannot move block down: already at bottom');
      return { newPosition: selectedMembers[0].range.start, moved: false };
    }

    console.log(`Moving ${selectedMembers.length} members ${direction} as a block`);

    // Calculate what we're swapping with
    let targetMember: { range: vscode.Range, text: string, name: string };

    if (direction === 'up') {
      // Moving up: swap with the member just above the block
      targetMember = allMembers[minIndex - 1];
      this.moveBlockUp(document, selectedMembers, targetMember);
    } else {
      // Moving down: swap with the member just below the block
      targetMember = allMembers[maxIndex + 1];
      this.moveBlockDown(document, selectedMembers, targetMember);
    }

    return { newPosition: selectedMembers[0].range.start, moved: true };
  }

  /**
   * Swap two members in the document
   */
  private swapMembers(
    document: vscode.TextDocument,
    memberA: { range: vscode.Range, text: string, name: string },
    memberB: { range: vscode.Range, text: string, name: string },
    direction: 'up' | 'down'
  ): { newPosition: vscode.Position, moved: boolean } {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      throw new Error('No active editor or document mismatch');
    }

    console.log(`\n=== SWAPPING MEMBERS ===`);
    console.log(`Moving member "${memberA.name}" ${direction}`);
    console.log(`MemberA range: ${memberA.range.start.line + 1}-${memberA.range.end.line + 1}`);
    console.log(`MemberB range: ${memberB.range.start.line + 1}-${memberB.range.end.line + 1}`);

    // Calculate where memberA will end up after the swap
    const targetStartLine = memberB.range.start.line;
    const targetStartCharacter = memberB.range.start.character;

    // Determine which member comes first in the document
    const firstMember = memberA.range.start.isBefore(memberB.range.start) ? memberA : memberB;
    const secondMember = firstMember === memberA ? memberB : memberA;

    // Perform the swap using editor.edit
    const editPromise = editor.edit(editBuilder => {
      // Replace in reverse order to avoid position shifts
      if (firstMember.range.start.isBefore(secondMember.range.start)) {
        editBuilder.replace(secondMember.range, firstMember.text);
        editBuilder.replace(firstMember.range, secondMember.text);
      } else {
        editBuilder.replace(firstMember.range, secondMember.text);
        editBuilder.replace(secondMember.range, firstMember.text);
      }
    });

    // Position cursor after the edit completes
    editPromise.then((success) => {
      if (success) {
        const newPosition = new vscode.Position(targetStartLine, targetStartCharacter);
        editor.selection = new vscode.Selection(newPosition, newPosition);
        editor.revealRange(new vscode.Range(newPosition, newPosition), vscode.TextEditorRevealType.InCenter);
        console.log(`✓ Positioned cursor at line ${targetStartLine + 1}, character ${targetStartCharacter + 1}`);
      }
    });

    // For immediate return, return the target position
    return { newPosition: new vscode.Position(targetStartLine, targetStartCharacter), moved: true };
  }

  /**
   * Move a block of members up by swapping with the member above
   */
  private moveBlockUp(
    document: vscode.TextDocument,
    selectedMembers: { range: vscode.Range, text: string, name: string, index: number }[],
    targetMember: { range: vscode.Range, text: string, name: string }
  ): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return;
    }

    // Get the complete block text including spacing
    const blockStart = selectedMembers[0].range.start;
    const blockEnd = selectedMembers[selectedMembers.length - 1].range.end;
    const blockRange = new vscode.Range(blockStart, blockEnd);
    const completeBlockText = document.getText(blockRange);

    // Calculate where the block will end up (at the target member's position)
    const newBlockStart = targetMember.range.start;

    // Create the edit and handle cursor positioning
    editor.edit(editBuilder => {
      // Replace the target member with the complete block
      editBuilder.replace(targetMember.range, completeBlockText);
      // Replace the block with the target member
      editBuilder.replace(blockRange, targetMember.text);
    }).then((success) => {
      if (success) {
        // Position cursor at the start of where the block moved
        const newPosition = new vscode.Position(newBlockStart.line, newBlockStart.character);
        editor.selection = new vscode.Selection(newPosition, newPosition);
        editor.revealRange(new vscode.Range(newPosition, newPosition), vscode.TextEditorRevealType.InCenter);
        console.log(`✓ Positioned cursor at moved block: line ${newBlockStart.line + 1}`);
      }
    });
  }

  /**
   * Move a block of members down by swapping with the member below
   */
  private moveBlockDown(
    document: vscode.TextDocument,
    selectedMembers: { range: vscode.Range, text: string, name: string, index: number }[],
    targetMember: { range: vscode.Range, text: string, name: string }
  ): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return;
    }

    // Get the complete block text including spacing
    const blockStart = selectedMembers[0].range.start;
    const blockEnd = selectedMembers[selectedMembers.length - 1].range.end;
    const blockRange = new vscode.Range(blockStart, blockEnd);
    const completeBlockText = document.getText(blockRange);

    // Calculate where the block will end up (at the target member's position)
    const newBlockStart = targetMember.range.start;

    // Create the edit and handle cursor positioning
    editor.edit(editBuilder => {
      // Replace the block with the target member
      editBuilder.replace(blockRange, targetMember.text);
      // Replace the target member with the complete block
      editBuilder.replace(targetMember.range, completeBlockText);
    }).then((success) => {
      if (success) {
        // Position cursor at the start of where the block moved
        const newPosition = new vscode.Position(newBlockStart.line, newBlockStart.character);
        editor.selection = new vscode.Selection(newPosition, newPosition);
        editor.revealRange(new vscode.Range(newPosition, newPosition), vscode.TextEditorRevealType.InCenter);
        console.log(`✓ Positioned cursor at moved block: line ${newBlockStart.line + 1}`);
      }
    });
  }
} 