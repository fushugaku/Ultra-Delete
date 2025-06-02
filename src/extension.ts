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

  // Add to subscriptions
  context.subscriptions.push(deleteCommand);
  context.subscriptions.push(cutCommand);

  // Verify commands are registered
  vscode.commands.getCommands(true).then(commands => {
    const hasDelete = commands.includes('variableFunctionDeleter.deleteAtCursor');
    const hasCut = commands.includes('variableFunctionDeleter.cutAtCursor');
    console.log(`Commands registered - Delete: ${hasDelete}, Cut: ${hasCut}`);
  });

  console.log('Extension activated successfully');
}



export function deactivate() {
  console.log('Variable Function Deleter extension deactivated');
}