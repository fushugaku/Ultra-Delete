// extension.ts
import * as vscode from 'vscode';
import { ElementDetector } from './core/elementDetector';

let elementDetector: ElementDetector;

// extension.ts - update the executeAction function

function executeAction(action: 'delete' | 'cut') {
  console.log(`Executing ${action} action`);

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    // vscode.window.showWarningMessage('No active editor found');
    return;
  }

  const document = editor.document;
  const languageId = document.languageId;


  console.log(`Language: ${languageId}, Selections: ${editor.selections.length}`);

  try {
    // Collect all ranges to delete/cut
    const rangesToProcess: { range: vscode.Range; text: string }[] = [];
    const failedSelections: number[] = [];

    // Process each selection/cursor
    for (let i = 0; i < editor.selections.length; i++) {
      const selection = editor.selections[i];
      const position = selection.active; // Use active position for cursor location

      console.log(`Processing selection ${i + 1}: ${position.line}:${position.character}`);

      const range = elementDetector.getElementRange(document, position, languageId);
      if (range) {
        const text = document.getText(range);
        rangesToProcess.push({ range, text });
        console.log(`Found element for selection ${i + 1}:`, text.substring(0, 100) + '...');
      } else {
        failedSelections.push(i + 1);
        console.log(`No element found for selection ${i + 1} at position ${position.line}:${position.character}`);
      }
    }

    if (rangesToProcess.length === 0) {
      vscode.window.showInformationMessage('No elements found at any cursor position');
      return;
    }

    // Sort ranges by position (end to start) to avoid position shifts during deletion
    rangesToProcess.sort((a, b) => {
      const aStart = a.range.start;
      const bStart = b.range.start;

      if (aStart.line !== bStart.line) {
        return bStart.line - aStart.line; // Later lines first
      }
      return bStart.character - aStart.character; // Later characters first
    });

    // Remove overlapping ranges to avoid conflicts
    const nonOverlappingRanges = removeOverlappingRanges(rangesToProcess);

    console.log(`Processing ${nonOverlappingRanges.length} non-overlapping ranges`);

    // For cut action, collect all text first
    let allCutText = '';
    if (action === 'cut') {
      allCutText = nonOverlappingRanges
        .map(item => item.text)
        .reverse() // Reverse to maintain original order
        .join('\n');
    }

    // Apply all edits in a single transaction
    editor.edit(editBuilder => {
      nonOverlappingRanges.forEach(item => {
        editBuilder.delete(item.range);
      });
    }).then(success => {
      if (success) {
        // Copy to clipboard after successful edit (for cut action)
        if (action === 'cut' && allCutText) {
          vscode.env.clipboard.writeText(allCutText);
        }

        const processedCount = nonOverlappingRanges.length;
        const totalSelections = editor.selections.length;
        if (processedCount < 2) return

        if (failedSelections.length > 0) {
          console.log(`${action} operation completed: ${processedCount}/${totalSelections} selections processed`);
          vscode.window.showInformationMessage(
            `${action} completed for ${processedCount}/${totalSelections} selections. ` +
            `No elements found at selections: ${failedSelections.join(', ')}`
          );
        } else {
          console.log(`${action} operation completed successfully for all ${processedCount} selections`);
          vscode.window.showInformationMessage(
            `${action} completed successfully for ${processedCount} selection${processedCount > 1 ? 's' : ''}`
          );
        }
      } else {
        console.error(`Failed to apply ${action} operation`);
        vscode.window.showErrorMessage(`Failed to apply ${action} operation`);
      }
    });

  } catch (error) {
    console.error(`Error during ${action} operation:`, error);
    vscode.window.showErrorMessage(`Error: ${error}`);
  }
}

// Helper function to remove overlapping ranges
function removeOverlappingRanges(ranges: { range: vscode.Range; text: string }[]): { range: vscode.Range; text: string }[] {
  if (ranges.length <= 1) {
    return ranges;
  }

  const nonOverlapping: { range: vscode.Range; text: string }[] = [];

  for (const current of ranges) {
    let hasOverlap = false;

    for (const existing of nonOverlapping) {
      if (rangesOverlap(current.range, existing.range)) {
        hasOverlap = true;
        console.log(`Skipping overlapping range: ${current.range.start.line}:${current.range.start.character}-${current.range.end.line}:${current.range.end.character}`);
        break;
      }
    }

    if (!hasOverlap) {
      nonOverlapping.push(current);
    }
  }

  return nonOverlapping;
}

// Helper function to check if two ranges overlap
function rangesOverlap(range1: vscode.Range, range2: vscode.Range): boolean {
  // Check if ranges overlap or touch
  return !(range1.end.isBefore(range2.start) || range2.end.isBefore(range1.start));
}

// ========================================
// NEW FUNCTIONALITY IMPLEMENTATIONS
// ========================================

/**
 * Select the contents of the current function scope
 */
function selectFunctionScope() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const languageId = document.languageId;
  const position = editor.selection.active;

  // Only support TypeScript-like languages for now
  if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
    vscode.window.showInformationMessage('Function scope selection is currently only supported for JavaScript/TypeScript files');
    return;
  }

  try {
    const handler = elementDetector['handlers'].get(languageId);
    if (!handler || !handler.getFunctionScopeRange) {
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

/**
 * Move cursor to the next member in the current scope
 */
function goToNextMember() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  // Reset sequential selection tracking since user is manually navigating
  resetSequentialSelection();

  const document = editor.document;
  const languageId = document.languageId;
  const position = editor.selection.active;

  // Only support TypeScript-like languages for now
  if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
    vscode.window.showInformationMessage('Member navigation is currently only supported for JavaScript/TypeScript files');
    return;
  }

  try {
    const handler = elementDetector['handlers'].get(languageId);
    if (!handler || !handler.getNextMemberRange) {
      vscode.window.showInformationMessage('Member navigation not available for this language');
      return;
    }

    const nextMemberRange = handler.getNextMemberRange(document, position);
    if (nextMemberRange) {
      editor.selection = new vscode.Selection(nextMemberRange.start, nextMemberRange.start);
      editor.revealRange(nextMemberRange, vscode.TextEditorRevealType.InCenter);
      vscode.window.showInformationMessage('Moved to next member');
    } else {
      vscode.window.showInformationMessage('No next member found in current scope');
    }
  } catch (error) {
    console.error('Error navigating to next member:', error);
    vscode.window.showErrorMessage(`Error navigating to next member: ${error}`);
  }
}

// Track the next member position for sequential selection
let nextMemberPosition: vscode.Position | null = null;

/**
 * Reset the sequential selection tracking
 */
function resetSequentialSelection() {
  nextMemberPosition = null;
}

/**
 * Select the current member and prepare for next member selection
 */
function selectNextMember() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const languageId = document.languageId;
  // Use tracked position if available, otherwise use current cursor position
  const position = nextMemberPosition || editor.selection.active;

  // Only support TypeScript-like languages for now
  if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
    vscode.window.showInformationMessage('Member selection is currently only supported for JavaScript/TypeScript files');
    resetSequentialSelection();
    return;
  }

  try {
    const handler = elementDetector['handlers'].get(languageId);
    if (!handler || !handler.getNextMemberRange || !handler.getMembersInCurrentScope) {
      vscode.window.showInformationMessage('Member selection not available for this language');
      resetSequentialSelection();
      return;
    }

    const members = handler.getMembersInCurrentScope(document, position);
    if (members.length === 0) {
      vscode.window.showInformationMessage('No members found in current scope');
      resetSequentialSelection();
      return;
    }

    // Find the current member (the one containing or closest to cursor position)
    const currentOffset = document.offsetAt(position);
    let currentMemberIndex = -1;

    // First, try to find a member that contains the cursor position
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      const memberStartOffset = document.offsetAt(member.range.start);
      const memberEndOffset = document.offsetAt(member.range.end);

      if (memberStartOffset <= currentOffset && currentOffset <= memberEndOffset) {
        currentMemberIndex = i;
        break;
      }
    }

    // If not found, find the closest member before the cursor
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

    // If still not found, start with the first member
    if (currentMemberIndex === -1) {
      currentMemberIndex = 0;
    }

    const currentMember = members[currentMemberIndex];

    // Get current selections to preserve multi-selection
    const currentSelections = [...editor.selections];

    // Create new selection for current member
    const newSelection = new vscode.Selection(currentMember.range.start, currentMember.range.end);

    // Check if this member is already selected (to avoid duplicates in multi-selection)
    const isAlreadySelected = currentSelections.some(selection =>
      selection.start.isEqual(currentMember.range.start) &&
      selection.end.isEqual(currentMember.range.end)
    );

    if (!isAlreadySelected) {
      // Add to existing selections
      currentSelections.push(newSelection);
      editor.selections = currentSelections;
    } else {
      // Keep existing selections as is
      editor.selections = currentSelections;
    }

    // Prepare next member position for the next invocation
    const nextMemberIndex = (currentMemberIndex + 1) % members.length; // Wrap around to first member
    const nextMember = members[nextMemberIndex];
    nextMemberPosition = nextMember.range.start;

    // Reveal the selected member
    editor.revealRange(currentMember.range, vscode.TextEditorRevealType.InCenter);

    const nextMemberName = nextMember.name;
    const selectedCount = editor.selections.length;
    vscode.window.showInformationMessage(
      `Selected "${currentMember.name}" (${selectedCount} total), next: "${nextMemberName}"`
    );

  } catch (error) {
    console.error('Error selecting next member:', error);
    vscode.window.showErrorMessage(`Error selecting next member: ${error}`);
    resetSequentialSelection();
  }
}

/**
 * Sort selected members alphabetically
 */
function sortSelectedMembers(ascending: boolean = true) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const languageId = document.languageId;
  const position = editor.selection.active;

  // Only support TypeScript-like languages for now
  if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
    vscode.window.showInformationMessage('Member sorting is currently only supported for JavaScript/TypeScript files');
    return;
  }

  try {
    const handler = elementDetector['handlers'].get(languageId);
    if (!handler || !handler.getMembersInCurrentScope || !handler.sortMembersByName) {
      vscode.window.showInformationMessage('Member sorting not available for this language');
      return;
    }

    const members = handler.getMembersInCurrentScope(document, position);
    if (members.length === 0) {
      vscode.window.showInformationMessage('No members found in current scope');
      return;
    }

    const sortedMembers = handler.sortMembersByName(members, ascending);

    // Apply the sorted order
    editor.edit(editBuilder => {
      // Sort members by their current position (reverse order for deletion)
      const membersToReplace = [...sortedMembers].sort((a, b) => {
        const aStart = a.range.start;
        const bStart = b.range.start;
        if (aStart.line !== bStart.line) {
          return bStart.line - aStart.line;
        }
        return bStart.character - aStart.character;
      });

      // Replace each member with the sorted version
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

/**
 * Add the next member to the current selection (multi-selection)
 */
function selectNextMemberAdd() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  // Reset sequential selection tracking since user is using explicit multi-selection
  resetSequentialSelection();

  const document = editor.document;
  const languageId = document.languageId;
  const position = editor.selection.active;

  // Only support TypeScript-like languages for now
  if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
    vscode.window.showInformationMessage('Member multi-selection is currently only supported for JavaScript/TypeScript files');
    return;
  }

  try {
    const handler = elementDetector['handlers'].get(languageId);
    if (!handler || !handler.getNextMemberRange) {
      vscode.window.showInformationMessage('Member multi-selection not available for this language');
      return;
    }

    const nextMemberRange = handler.getNextMemberRange(document, position);
    if (nextMemberRange) {
      // Get current selections
      const currentSelections = [...editor.selections];

      // Add the new selection
      const newSelection = new vscode.Selection(nextMemberRange.start, nextMemberRange.end);
      currentSelections.push(newSelection);

      // Apply all selections
      editor.selections = currentSelections;
      editor.revealRange(nextMemberRange, vscode.TextEditorRevealType.InCenter);
      vscode.window.showInformationMessage(`Added member to selection (${currentSelections.length} selected)`);
    } else {
      vscode.window.showInformationMessage('No next member found in current scope');
    }
  } catch (error) {
    console.error('Error adding next member to selection:', error);
    vscode.window.showErrorMessage(`Error adding next member to selection: ${error}`);
  }
}

/**
 * Move the current member up in its scope
 */
function moveMemberUp() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  // Reset sequential selection tracking
  resetSequentialSelection();

  const document = editor.document;
  const languageId = document.languageId;
  const position = editor.selection.active;

  // Only support TypeScript-like languages for now
  if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
    vscode.window.showInformationMessage('Member moving is currently only supported for JavaScript/TypeScript files');
    return;
  }

  try {
    const handler = elementDetector['handlers'].get(languageId);
    if (!handler || !handler.moveMemberUp) {
      vscode.window.showInformationMessage('Member moving not available for this language');
      return;
    }

    const result = handler.moveMemberUp(document, position);
    if (result && result.moved) {
      // The TypeScript handler handles cursor positioning automatically
      vscode.window.showInformationMessage('Member moved up');
    } else {
      vscode.window.showInformationMessage('Cannot move member up (already at top or no member found)');
    }
  } catch (error) {
    console.error('Error moving member up:', error);
    vscode.window.showErrorMessage(`Error moving member up: ${error}`);
  }
}

/**
 * Move the current member down in its scope
 */
function moveMemberDown() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  // Reset sequential selection tracking
  resetSequentialSelection();

  const document = editor.document;
  const languageId = document.languageId;
  const position = editor.selection.active;

  // Only support TypeScript-like languages for now
  if (!['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
    vscode.window.showInformationMessage('Member moving is currently only supported for JavaScript/TypeScript files');
    return;
  }

  try {
    const handler = elementDetector['handlers'].get(languageId);
    if (!handler || !handler.moveMemberDown) {
      vscode.window.showInformationMessage('Member moving not available for this language');
      return;
    }

    const result = handler.moveMemberDown(document, position);
    if (result && result.moved) {
      // The TypeScript handler handles cursor positioning automatically
      vscode.window.showInformationMessage('Member moved down');
    } else {
      vscode.window.showInformationMessage('Cannot move member down (already at bottom or no member found)');
    }
  } catch (error) {
    console.error('Error moving member down:', error);
    vscode.window.showErrorMessage(`Error moving member down: ${error}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Activating Variable Function Deleter extension');

  elementDetector = new ElementDetector();

  // Register commands explicitly
  const deleteCommand = vscode.commands.registerCommand(
    'variableFunctionDeleter.deleteAtCursor',
    () => {
      console.log('Delete command executed');
      executeAction('delete');
    }
  );

  const cutCommand = vscode.commands.registerCommand(
    'variableFunctionDeleter.cutAtCursor',
    () => {
      console.log('Cut command executed');
      executeAction('cut');
    }
  );

  // NEW COMMANDS
  const selectFunctionScopeCommand = vscode.commands.registerCommand(
    'variableFunctionDeleter.selectFunctionScope',
    () => {
      console.log('Select function scope command executed');
      selectFunctionScope();
    }
  );

  const goToNextMemberCommand = vscode.commands.registerCommand(
    'variableFunctionDeleter.goToNextMember',
    () => {
      console.log('Go to next member command executed');
      goToNextMember();
    }
  );

  const selectNextMemberCommand = vscode.commands.registerCommand(
    'variableFunctionDeleter.selectNextMember',
    () => {
      console.log('Select next member command executed');
      selectNextMember();
    }
  );

  const selectNextMemberAddCommand = vscode.commands.registerCommand(
    'variableFunctionDeleter.selectNextMemberAdd',
    () => {
      console.log('Select next member add command executed');
      selectNextMemberAdd();
    }
  );

  const sortMembersAZCommand = vscode.commands.registerCommand(
    'variableFunctionDeleter.sortMembersAZ',
    () => {
      console.log('Sort members A-Z command executed');
      sortSelectedMembers(true);
    }
  );

  const sortMembersZACommand = vscode.commands.registerCommand(
    'variableFunctionDeleter.sortMembersZA',
    () => {
      console.log('Sort members Z-A command executed');
      sortSelectedMembers(false);
    }
  );

  const moveMemberUpCommand = vscode.commands.registerCommand(
    'variableFunctionDeleter.moveMemberUp',
    () => {
      console.log('Move member up command executed');
      moveMemberUp();
    }
  );

  const moveMemberDownCommand = vscode.commands.registerCommand(
    'variableFunctionDeleter.moveMemberDown',
    () => {
      console.log('Move member down command executed');
      moveMemberDown();
    }
  );

  // Add to subscriptions
  context.subscriptions.push(deleteCommand);
  context.subscriptions.push(cutCommand);
  context.subscriptions.push(selectFunctionScopeCommand);
  context.subscriptions.push(goToNextMemberCommand);
  context.subscriptions.push(selectNextMemberCommand);
  context.subscriptions.push(selectNextMemberAddCommand);
  context.subscriptions.push(sortMembersAZCommand);
  context.subscriptions.push(sortMembersZACommand);
  context.subscriptions.push(moveMemberUpCommand);
  context.subscriptions.push(moveMemberDownCommand);

  // Verify commands are registered
  vscode.commands.getCommands(true).then(commands => {
    const hasDelete = commands.includes('variableFunctionDeleter.deleteAtCursor');
    const hasCut = commands.includes('variableFunctionDeleter.cutAtCursor');
    const hasSelectScope = commands.includes('variableFunctionDeleter.selectFunctionScope');
    const hasGoToNext = commands.includes('variableFunctionDeleter.goToNextMember');
    const hasSelectNext = commands.includes('variableFunctionDeleter.selectNextMember');
    const hasSelectNextAdd = commands.includes('variableFunctionDeleter.selectNextMemberAdd');
    const hasSortAZ = commands.includes('variableFunctionDeleter.sortMembersAZ');
    const hasSortZA = commands.includes('variableFunctionDeleter.sortMembersZA');
    const hasMoveUp = commands.includes('variableFunctionDeleter.moveMemberUp');
    const hasMoveDown = commands.includes('variableFunctionDeleter.moveMemberDown');
    console.log(`Commands registered - Delete: ${hasDelete}, Cut: ${hasCut}, SelectScope: ${hasSelectScope}, GoToNext: ${hasGoToNext}, SelectNext: ${hasSelectNext}, SelectNextAdd: ${hasSelectNextAdd}, SortAZ: ${hasSortAZ}, SortZA: ${hasSortZA}, MoveUp: ${hasMoveUp}, MoveDown: ${hasMoveDown}`);
  });

  console.log('Extension activated successfully');
}



export function deactivate() {
  console.log('Variable Function Deleter extension deactivated');
}