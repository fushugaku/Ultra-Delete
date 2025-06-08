import * as vscode from 'vscode';
import { ElementDetector } from './elementDetector';

export class CommandHandler {
  private nextMemberPosition: vscode.Position | null = null;

  constructor(private elementDetector: ElementDetector) { }

  registerCommands(context: vscode.ExtensionContext): void {
    console.log('CommandHandler: Registering commands...');
    const commands = [
      vscode.commands.registerCommand('variableFunctionDeleter.deleteAtCursor', () => this.executeAction('delete')),
      vscode.commands.registerCommand('variableFunctionDeleter.cutAtCursor', () => this.executeAction('cut')),
      vscode.commands.registerCommand('variableFunctionDeleter.selectFunctionScope', () => this.selectFunctionScope()),
      vscode.commands.registerCommand('variableFunctionDeleter.goToNextMember', () => this.goToNextMember()),
      vscode.commands.registerCommand('variableFunctionDeleter.selectNextMember', () => this.selectNextMember()),
      vscode.commands.registerCommand('variableFunctionDeleter.sortMembersAZ', () => this.sortSelectedMembers(true)),
      vscode.commands.registerCommand('variableFunctionDeleter.sortMembersZA', () => this.sortSelectedMembers(false)),
      vscode.commands.registerCommand('variableFunctionDeleter.selectNextMemberAdd', () => this.selectNextMemberAdd()),
      vscode.commands.registerCommand('variableFunctionDeleter.moveMemberUp', () => this.moveMemberUp()),
      vscode.commands.registerCommand('variableFunctionDeleter.moveMemberDown', () => this.moveMemberDown())
    ];

    commands.forEach(command => context.subscriptions.push(command));
    console.log(`CommandHandler: Successfully registered ${commands.length} commands`);
  }

  private executeAction(action: 'delete' | 'cut'): void {
    console.log(`CommandHandler: executeAction called with action: ${action}`);
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      console.log('CommandHandler: No active editor found');
      return;
    }

    const document = editor.document;
    const rangesToProcess = this.collectElementRanges(editor);

    if (rangesToProcess.length === 0) {
      console.log('CommandHandler: No elements found at cursor positions');
      vscode.window.showInformationMessage('No elements found at cursor positions');
      return;
    }

    console.log(`CommandHandler: Found ${rangesToProcess.length} elements to process`);

    this.performAction(editor, rangesToProcess, action);
  }

  private collectElementRanges(editor: vscode.TextEditor): Array<{ range: vscode.Range; text: string }> {
    const document = editor.document;
    const languageId = document.languageId;
    const ranges: Array<{ range: vscode.Range; text: string }> = [];

    console.log(`CommandHandler: collectElementRanges - languageId: ${languageId}, selections: ${editor.selections.length}`);

    for (const selection of editor.selections) {
      console.log(`CommandHandler: checking selection at ${selection.active.line}:${selection.active.character}`);
      const range = this.elementDetector.getElementRange(document, selection.active, languageId);
      if (range) {
        const text = document.getText(range);
        ranges.push({ range, text });
        console.log(`CommandHandler: Found element range from ${range.start.line}:${range.start.character} to ${range.end.line}:${range.end.character}`);
        console.log(`CommandHandler: Element text preview: ${text.substring(0, 100)}...`);
      } else {
        console.log(`CommandHandler: No element found at ${selection.active.line}:${selection.active.character}`);
      }
    }

    const filtered = this.removeOverlappingRanges(ranges);
    console.log(`CommandHandler: Filtered ${ranges.length} ranges down to ${filtered.length} non-overlapping ranges`);
    return filtered;
  }

  private removeOverlappingRanges(ranges: Array<{ range: vscode.Range; text: string }>): Array<{ range: vscode.Range; text: string }> {
    if (ranges.length <= 1) return ranges;

    ranges.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return b.range.start.line - a.range.start.line;
      }
      return b.range.start.character - a.range.start.character;
    });

    const nonOverlapping: Array<{ range: vscode.Range; text: string }> = [];

    for (const current of ranges) {
      const hasOverlap = nonOverlapping.some(existing =>
        this.rangesOverlap(current.range, existing.range)
      );

      if (!hasOverlap) {
        nonOverlapping.push(current);
      }
    }

    return nonOverlapping;
  }

  private rangesOverlap(range1: vscode.Range, range2: vscode.Range): boolean {
    return !(range1.end.isBefore(range2.start) || range2.end.isBefore(range1.start));
  }

  private async performAction(
    editor: vscode.TextEditor,
    ranges: Array<{ range: vscode.Range; text: string }>,
    action: 'delete' | 'cut'
  ): Promise<void> {
    let allCutText = '';
    if (action === 'cut') {
      allCutText = ranges
        .map(item => item.text)
        .reverse()
        .join('\n');
    }

    const success = await editor.edit(editBuilder => {
      ranges.forEach(item => editBuilder.delete(item.range));
    });

    if (success) {
      if (action === 'cut' && allCutText) {
        vscode.env.clipboard.writeText(allCutText);
      }

      if (ranges.length > 1) {
        vscode.window.showInformationMessage(
          `${action} completed successfully for ${ranges.length} selections`
        );
      }
    } else {
      vscode.window.showErrorMessage(`Failed to apply ${action} operation`);
    }
  }

  private selectFunctionScope(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const languageId = document.languageId;
    const position = editor.selection.active;

    if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
      vscode.window.showInformationMessage('Function scope selection is currently only supported for JavaScript/TypeScript files');
      return;
    }

    try {
      const handler = this.elementDetector['handlers'].get(languageId);
      if (!handler?.getFunctionScopeRange) {
        vscode.window.showInformationMessage('Function scope selection not available for this language');
        return;
      }

      const scopeRange = handler.getFunctionScopeRange(document, position);
      if (scopeRange) {
        editor.selection = new vscode.Selection(scopeRange.start, scopeRange.end);
        vscode.window.showInformationMessage('Function scope selected');
      } else {
        vscode.window.showInformationMessage('No function scope found at cursor position');
      }
    } catch (error) {
      console.error('Error selecting function scope:', error);
      vscode.window.showErrorMessage(`Error selecting function scope: ${error}`);
    }
  }

  private goToNextMember(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const languageId = document.languageId;
    const position = editor.selection.active;

    if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
      vscode.window.showInformationMessage('Member navigation is currently only supported for JavaScript/TypeScript files');
      return;
    }

    try {
      const handler = this.elementDetector['handlers'].get(languageId);
      if (!handler?.getNextMemberRange) {
        vscode.window.showInformationMessage('Member navigation not available for this language');
        return;
      }

      const nextMemberRange = handler.getNextMemberRange(document, position);
      if (nextMemberRange) {
        editor.selection = new vscode.Selection(nextMemberRange.start, nextMemberRange.start);
        editor.revealRange(nextMemberRange, vscode.TextEditorRevealType.InCenter);
      } else {
        vscode.window.showInformationMessage('No next member found');
      }
    } catch (error) {
      console.error('Error navigating to next member:', error);
      vscode.window.showErrorMessage(`Error navigating to next member: ${error}`);
    }
  }

  private resetSequentialSelection(): void {
    this.nextMemberPosition = null;
  }

  private selectNextMember(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const document = editor.document;
    const languageId = document.languageId;
    const position = this.nextMemberPosition || editor.selection.active;

    if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
      vscode.window.showInformationMessage('Member selection is currently only supported for JavaScript/TypeScript files');
      this.resetSequentialSelection();
      return;
    }

    try {
      const handler = this.elementDetector['handlers'].get(languageId);
      if (!handler?.getNextMemberRange || !handler.getMembersInCurrentScope) {
        vscode.window.showInformationMessage('Member selection not available for this language');
        this.resetSequentialSelection();
        return;
      }

      const members = handler.getMembersInCurrentScope(document, position);
      if (members.length === 0) {
        vscode.window.showInformationMessage('No members found in current scope');
        this.resetSequentialSelection();
        return;
      }

      const currentOffset = document.offsetAt(position);
      let currentMemberIndex = -1;

      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        const memberStartOffset = document.offsetAt(member.range.start);
        const memberEndOffset = document.offsetAt(member.range.end);

        if (memberStartOffset <= currentOffset && currentOffset <= memberEndOffset) {
          currentMemberIndex = i;
          break;
        }
      }

      if (currentMemberIndex === -1) {
        for (let i = 0; i < members.length; i++) {
          const member = members[i];
          const memberStartOffset = document.offsetAt(member.range.start);

          if (memberStartOffset <= currentOffset) {
            currentMemberIndex = i;
          } else {
            break;
          }
        }
      }

      if (currentMemberIndex === -1) {
        currentMemberIndex = 0;
      }

      const currentMember = members[currentMemberIndex];
      const currentSelections = [...editor.selections];
      const newSelection = new vscode.Selection(currentMember.range.start, currentMember.range.end);

      const isAlreadySelected = currentSelections.some(selection =>
        selection.start.isEqual(currentMember.range.start) &&
        selection.end.isEqual(currentMember.range.end)
      );

      if (!isAlreadySelected) {
        currentSelections.push(newSelection);
        editor.selections = currentSelections;
      } else {
        editor.selections = currentSelections;
      }

      const nextMemberIndex = (currentMemberIndex + 1) % members.length;
      const nextMember = members[nextMemberIndex];
      this.nextMemberPosition = nextMember.range.start;

      editor.revealRange(currentMember.range, vscode.TextEditorRevealType.InCenter);

      const nextMemberName = nextMember.name;
      const selectedCount = editor.selections.length;
      vscode.window.showInformationMessage(
        `Selected "${currentMember.name}" (${selectedCount} total), next: "${nextMemberName}"`
      );

    } catch (error) {
      console.error('Error selecting next member:', error);
      vscode.window.showErrorMessage(`Error selecting next member: ${error}`);
      this.resetSequentialSelection();
    }
  }

  private sortSelectedMembers(ascending: boolean): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const document = editor.document;
    const languageId = document.languageId;
    const position = editor.selection.active;

    if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
      vscode.window.showInformationMessage('Member sorting is currently only supported for JavaScript/TypeScript files');
      return;
    }

    try {
      const handler = this.elementDetector['handlers'].get(languageId);
      if (!handler?.getMembersInCurrentScope || !handler.sortMembersByName) {
        vscode.window.showInformationMessage('Member sorting not available for this language');
        return;
      }

      const members = handler.getMembersInCurrentScope(document, position);
      if (members.length === 0) {
        vscode.window.showInformationMessage('No members found in current scope');
        return;
      }

      const sortedMembers = handler.sortMembersByName(members, ascending);

      editor.edit(editBuilder => {
        const membersToReplace = [...sortedMembers].sort((a, b) => {
          const aStart = a.range.start;
          const bStart = b.range.start;
          if (aStart.line !== bStart.line) {
            return bStart.line - aStart.line;
          }
          return bStart.character - aStart.character;
        });

        const originalMembers = [...members].sort((a, b) => {
          const aStart = a.range.start;
          const bStart = b.range.start;
          if (aStart.line !== bStart.line) {
            return bStart.line - aStart.line;
          }
          return bStart.character - aStart.character;
        });

        for (let i = 0; i < originalMembers.length; i++) {
          const originalMember = originalMembers[i];
          const sortedMember = membersToReplace[membersToReplace.length - 1 - i];
          editBuilder.replace(originalMember.range, sortedMember.text);
        }
      }).then(success => {
        if (success) {
          const sortOrder = ascending ? 'A-Z' : 'Z-A';
          vscode.window.showInformationMessage(`Sorted ${members.length} members ${sortOrder}`);
        } else {
          vscode.window.showErrorMessage('Failed to sort members');
        }
      });
    } catch (error) {
      console.error('Error sorting members:', error);
      vscode.window.showErrorMessage(`Error sorting members: ${error}`);
    }
  }

  private selectNextMemberAdd(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    this.resetSequentialSelection();

    const document = editor.document;
    const languageId = document.languageId;
    const position = editor.selection.active;

    if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
      vscode.window.showInformationMessage('Member selection is currently only supported for JavaScript/TypeScript files');
      return;
    }

    try {
      const handler = this.elementDetector['handlers'].get(languageId);
      if (!handler?.getNextMemberRange || !handler.getMembersInCurrentScope) {
        vscode.window.showInformationMessage('Member selection not available for this language');
        return;
      }

      const nextMemberRange = handler.getNextMemberRange(document, position);
      if (nextMemberRange) {
        const currentSelections = [...editor.selections];
        const newSelection = new vscode.Selection(nextMemberRange.start, nextMemberRange.end);

        const isAlreadySelected = currentSelections.some(selection =>
          selection.start.isEqual(nextMemberRange.start) &&
          selection.end.isEqual(nextMemberRange.end)
        );

        if (!isAlreadySelected) {
          currentSelections.push(newSelection);
          editor.selections = currentSelections;
          editor.revealRange(nextMemberRange, vscode.TextEditorRevealType.InCenter);
          vscode.window.showInformationMessage(`Added member to selection (${currentSelections.length} total)`);
        } else {
          vscode.window.showInformationMessage('Member already selected');
        }
      } else {
        vscode.window.showInformationMessage('No next member found');
      }
    } catch (error) {
      console.error('Error adding next member to selection:', error);
      vscode.window.showErrorMessage(`Error adding next member to selection: ${error}`);
    }
  }

  private moveMemberUp(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    this.resetSequentialSelection();

    const document = editor.document;
    const languageId = document.languageId;
    const position = editor.selection.active;

    if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
      vscode.window.showInformationMessage('Member moving is currently only supported for JavaScript/TypeScript files');
      return;
    }

    try {
      const handler = this.elementDetector['handlers'].get(languageId);
      if (!handler?.moveMemberUp) {
        vscode.window.showInformationMessage('Member moving not available for this language');
        return;
      }

      const result = handler.moveMemberUp(document, position);
      if (result && result.moved) {
        vscode.window.showInformationMessage('Member moved up');
      } else {
        vscode.window.showInformationMessage('Cannot move member up (already at top or no member found)');
      }
    } catch (error) {
      console.error('Error moving member up:', error);
      vscode.window.showErrorMessage(`Error moving member up: ${error}`);
    }
  }

  private moveMemberDown(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    this.resetSequentialSelection();

    const document = editor.document;
    const languageId = document.languageId;
    const position = editor.selection.active;

    if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
      vscode.window.showInformationMessage('Member moving is currently only supported for JavaScript/TypeScript files');
      return;
    }

    try {
      const handler = this.elementDetector['handlers'].get(languageId);
      if (!handler?.moveMemberDown) {
        vscode.window.showInformationMessage('Member moving not available for this language');
        return;
      }

      const result = handler.moveMemberDown(document, position);
      if (result && result.moved) {
        vscode.window.showInformationMessage('Member moved down');
      } else {
        vscode.window.showInformationMessage('Cannot move member down (already at bottom or no member found)');
      }
    } catch (error) {
      console.error('Error moving member down:', error);
      vscode.window.showErrorMessage(`Error moving member down: ${error}`);
    }
  }
} 