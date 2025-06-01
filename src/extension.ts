// extension.ts
import * as vscode from 'vscode';
import { ElementDetector } from './core/elementDetector';

let elementDetector: ElementDetector;
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

function executeAction(action: 'delete' | 'cut') {
  console.log(`Executing ${action} action`);

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor found');
    return;
  }

  const document = editor.document;
  const position = editor.selection.active;
  const languageId = document.languageId;

  console.log(`Language: ${languageId}, Position: ${position.line}:${position.character}`);

  try {
    const range = elementDetector.getElementRange(document, position, languageId);
    if (range) {
      const text = document.getText(range);
      console.log(`Found element to ${action}:`, text.substring(0, 100) + '...');

      if (action === 'cut') {
        vscode.env.clipboard.writeText(text);

      }

      editor.edit(editBuilder => {
        editBuilder.delete(range);
      }).then(success => {
        if (success) {
          console.log(`${action} operation completed successfully`);

        } else {

        }
      });
    } else {
      vscode.window.showInformationMessage('No element found at cursor position');
      console.log('No element found at cursor position');
    }
  } catch (error) {
    console.error(`Error during ${action} operation:`, error);
    vscode.window.showErrorMessage(`Error: ${error}`);
  }
}

export function deactivate() {
  console.log('Variable Function Deleter extension deactivated');
}