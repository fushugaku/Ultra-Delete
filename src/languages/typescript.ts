// typescript.ts
import * as vscode from 'vscode';
import * as ts from 'typescript';
import { BaseLanguageHandler, ElementType } from './base/baseLanguage';
import { TypeScriptClassParser } from './typescript/classParser';
import { TypeScriptExtractionService } from './typescript/extractionService';

/**
 * TypeScript language handler for intelligent code element detection and manipulation
 * 
 * Note: This file combines AST parsing and VSCode action logic.
 * Consider splitting into separate files for better maintainability:
 * - astParser.ts: Pure TypeScript AST parsing logic
 * - vscodeHandler.ts: VSCode-specific actions and UI logic
 */
export class TypeScriptHandler extends BaseLanguageHandler {
  languageIds = ['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'];
  private classParser = new TypeScriptClassParser();
  private extractionService = new TypeScriptExtractionService();

  // ========================================
  // PUBLIC API METHODS
  // ========================================

  getImportRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.ImportDeclaration,
      ts.SyntaxKind.ImportEqualsDeclaration,
      ts.SyntaxKind.ExportDeclaration,
      ts.SyntaxKind.ExportAssignment
    ]);
  }



  getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Use class parser for class declarations, fallback to original for other types
    const classRange = this.classParser.getClassRange(document, position, word);
    if (classRange) {
      return classRange;
    }

    // Fallback for other declaration types
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.InterfaceDeclaration,
      ts.SyntaxKind.TypeAliasDeclaration,
      ts.SyntaxKind.EnumDeclaration,
      ts.SyntaxKind.ModuleDeclaration,
      ts.SyntaxKind.NamespaceExportDeclaration
    ]);
  }

  getFunctionRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // First check for call expressions (like onMounted, watch, etc.)
    const callExpressionRange = this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.CallExpression
    ]);

    if (callExpressionRange) {
      return callExpressionRange;
    }

    // Then check for function declarations/expressions
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.FunctionDeclaration,
      ts.SyntaxKind.ArrowFunction,
      ts.SyntaxKind.FunctionExpression,
      ts.SyntaxKind.MethodDeclaration
    ]);
  }

  getVariableRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.VariableStatement,
      ts.SyntaxKind.VariableDeclaration
    ]);
  }

  getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.PropertyAssignment,
      ts.SyntaxKind.ShorthandPropertyAssignment,
      ts.SyntaxKind.PropertySignature
    ]);
  }

  getClassMemberRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    // Use the dedicated class parser for class member detection
    return this.classParser.getClassMemberRange(document, position, word);
  }

  getConditionalBlockRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    try {
      const sourceFile = this.createSourceFile(document);
      const offset = document.offsetAt(position);

      // Find the if statement that contains this position
      const ifStatement = this.findIfStatementAtPosition(sourceFile, offset);
      if (!ifStatement) {
        return null;
      }

      // Determine what to cut based on cursor position
      return this.getConditionalRangeBasedOnPosition(document, ifStatement, offset);
    } catch (error) {
      console.error('Error parsing conditional block:', error);
      return null;
    }
  }

  getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return this.getElementRangeUsingAST(document, position, [
      ts.SyntaxKind.TemplateExpression,
      ts.SyntaxKind.NoSubstitutionTemplateLiteral,
      ts.SyntaxKind.StringLiteral
    ]);
  }

  // ========================================
  // NEW SCOPE AND MEMBER NAVIGATION METHODS
  // ========================================

  /**
   * Get the range of the current function scope (body contents)
   */
  getFunctionScopeRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
    try {
      const sourceFile = this.createSourceFile(document);
      const offset = document.offsetAt(position);

      // Find the function that contains this position
      const functionNode = this.findContainingFunction(sourceFile, offset);
      if (!functionNode) {
        return null;
      }

      // Get the function body range
      return this.getFunctionBodyRange(document, functionNode);
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
      const sourceFile = this.createSourceFile(document);
      const offset = document.offsetAt(position);

      console.log(`Getting members in current scope at position ${position.line}:${position.character}`);

      // Find the containing scope (class, object, module, etc.)
      const scopeNode = this.findContainingScope(sourceFile, offset);
      if (!scopeNode) {
        console.log('No scope node found');
        return [];
      }

      console.log(`Found scope node of kind: ${ts.SyntaxKind[scopeNode.kind]}`);
      const members = this.extractMembersFromScope(document, scopeNode);
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
   * Find the previous member before the current position
   */
  getPreviousMemberRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
    const members = this.getMembersInCurrentScope(document, position);
    if (members.length === 0) {
      console.log('No members found for previous member navigation');
      return null;
    }

    console.log(`Found ${members.length} members, looking for previous before position ${position.line}:${position.character}`);

    // Find the last member that starts before the current position
    const currentOffset = document.offsetAt(position);
    let previousMember: { range: vscode.Range, text: string, name: string } | null = null;

    for (const member of members) {
      const memberOffset = document.offsetAt(member.range.start);
      console.log(`Checking member "${member.name}" at offset ${memberOffset} vs current ${currentOffset}`);
      if (memberOffset < currentOffset) {
        previousMember = member;
        console.log(`Candidate previous member: ${member.name}`);
      } else {
        break; // Since members are sorted by position, we can stop here
      }
    }

    if (previousMember) {
      console.log(`Found previous member: ${previousMember.name}`);
      return previousMember.range;
    }

    // If no member found before current position, wrap to the last member
    const lastMember = members[members.length - 1];
    console.log(`No member before current position, wrapping to last: ${lastMember?.name}`);
    return lastMember.range;
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

  /**
   * Extract selected code to a new function
   */
  async extractSelectionToFunction(document: vscode.TextDocument, selection: vscode.Selection): Promise<boolean> {
    try {
      // Analyze and generate the extraction
      const extractionResult = await this.extractionService.extractSelectionToFunction(document, selection);

      if (!extractionResult) {
        vscode.window.showErrorMessage('Could not extract the selected code to a function');
        return false;
      }

      // Apply the extraction
      const success = await this.extractionService.applyExtraction(document, selection, extractionResult);

      if (success) {
        vscode.window.showInformationMessage(`Successfully extracted to function: ${extractionResult.functionName}`);
        return true;
      } else {
        vscode.window.showErrorMessage('Failed to apply the extraction');
        return false;
      }
    } catch (error) {
      console.error('Error in extractSelectionToFunction:', error);
      vscode.window.showErrorMessage(`Error extracting selection: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

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
      console.log(`     Text: ${member.text.trim().substring(0, 80)}...`);
    });

    for (let i = 0; i < allMembers.length; i++) {
      const member = allMembers[i];

      // Check if any selection intersects with this member's line (line-based detection)
      for (const selection of selections) {
        if (this.selectionIntersectsWithMemberLine(selection, member)) {
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
   * Check if two ranges intersect
   */
  private rangesIntersect(range1: vscode.Range, range2: vscode.Range): boolean {
    return !(range1.end.isBefore(range2.start) || range2.end.isBefore(range1.start));
  }

  /**
 * Check if a selection intersects with a member's range
 */
  private selectionIntersectsWithMemberLine(
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
 * Find the line number where the member name is declared using AST
 */
  private findMemberNameLine(
    document: vscode.TextDocument,
    member: { range: vscode.Range, text: string, name: string }
  ): number {
    try {
      // Create a mini source file just for this member to find the name position
      const memberText = member.text;
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        memberText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );

      // First try to find declaration nodes that match the member name
      const declarations = this.findAllDeclarationsWithName(sourceFile, member.name);

      let targetNode: ts.Node | null = null;

      if (declarations.length > 0) {
        targetNode = declarations[0];
        console.log(`  Found declaration for "${member.name}"`);
      } else {
        // If no declarations found, look for call expressions (like onBeforeMount())
        console.log(`  No declarations found for "${member.name}", looking for call expressions...`);
        targetNode = this.findCallExpressionWithName(sourceFile, member.name);

        if (targetNode) {
          console.log(`  Found call expression for "${member.name}"`);
        } else {
          console.log(`  No call expressions found for "${member.name}"`);
          return -1;
        }
      }

      // Get the position of the target node relative to the member start
      const nameOffset = targetNode.getStart();

      // Convert offset within member text to line number within member
      const memberLines = memberText.split('\n');
      let currentOffset = 0;

      for (let lineIndex = 0; lineIndex < memberLines.length; lineIndex++) {
        const lineLength = memberLines[lineIndex].length + 1; // +1 for newline

        if (currentOffset <= nameOffset && nameOffset < currentOffset + lineLength) {
          // Found the line - convert to document line number
          const memberNameLineInDocument = member.range.start.line + lineIndex;
          console.log(`  Found member "${member.name}" name at member line ${lineIndex}, document line ${memberNameLineInDocument + 1}`);
          return memberNameLineInDocument;
        }

        currentOffset += lineLength;
      }

      console.log(`Could not map offset ${nameOffset} to line for member "${member.name}"`);
      return -1;
    } catch (error) {
      console.log(`Error in findMemberNameLine for "${member.name}":`, error);
      return -1;
    }
  }

  /**
   * Find all call expressions with the given function name
   */
  private findAllCallExpressionsWithName(node: ts.Node, targetName: string): ts.Node[] {
    const callExpressions: ts.Node[] = [];

    const visit = (node: ts.Node) => {
      // Check if this node is a call expression with the target name
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === targetName) {
        callExpressions.push(node.expression); // Add the identifier part (the function name)
      }

      // Check if this is an expression statement containing our call expression
      if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
        const callExpr = node.expression;
        if (ts.isIdentifier(callExpr.expression) && callExpr.expression.text === targetName) {
          callExpressions.push(callExpr.expression); // Add the identifier part (the function name)
        }
      }

      // Continue searching children
      ts.forEachChild(node, visit);
    };

    visit(node);
    return callExpressions;
  }

  /**
   * Find a call expression with the given function name
   */
  private findCallExpressionWithName(node: ts.Node, targetName: string): ts.Node | null {
    console.log(`    Checking node ${ts.SyntaxKind[node.kind]} for call expression "${targetName}"`);

    // Check if this node is a call expression with the target name
    if (ts.isCallExpression(node)) {
      console.log(`    Found call expression, checking expression type: ${ts.SyntaxKind[node.expression.kind]}`);
      if (ts.isIdentifier(node.expression)) {
        console.log(`    Call expression has identifier: "${node.expression.text}"`);
        if (node.expression.text === targetName) {
          console.log(`    ✓ Found matching call expression for "${targetName}"`);
          return node.expression; // Return the identifier part (the function name)
        }
      }
    }

    // Check if this is an expression statement containing our call expression
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const callExpr = node.expression;
      console.log(`    Found expression statement with call expression`);
      if (ts.isIdentifier(callExpr.expression)) {
        console.log(`    Expression statement call has identifier: "${callExpr.expression.text}"`);
        if (callExpr.expression.text === targetName) {
          console.log(`    ✓ Found matching expression statement call for "${targetName}"`);
          return callExpr.expression; // Return the identifier part (the function name)
        }
      }
    }

    // Recursively search children
    let result: ts.Node | null = null;
    ts.forEachChild(node, (child) => {
      if (!result) {
        result = this.findCallExpressionWithName(child, targetName);
      }
    });

    return result;
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

    // Store the current selections relative to their members for restoration
    const selectionInfo = this.captureSelectionInfo(document, editor.selections, selectedMembers);

    // Store the original scope information to help find it after the move
    const originalScopePosition = selectedMembers[0].range.start;
    const originalScope = this.getMembersInCurrentScope(document, originalScopePosition);

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

    // Calculate what we're swapping with and the context for search
    let targetMember: { range: vscode.Range, text: string, name: string };
    let searchContext: { direction: string, targetMemberPosition: vscode.Position, originalBlockPosition: vscode.Position };

    if (direction === 'up') {
      // Moving up: swap with the member just above the block
      targetMember = allMembers[minIndex - 1];
      searchContext = {
        direction: 'up',
        targetMemberPosition: targetMember.range.start,
        originalBlockPosition: selectedMembers[0].range.start
      };

      // Perform the block move
      this.moveBlockUpWithSelection(document, selectedMembers, targetMember, selectionInfo, originalScope, searchContext);
    } else {
      // Moving down: swap with the member just below the block
      targetMember = allMembers[maxIndex + 1];
      searchContext = {
        direction: 'down',
        targetMemberPosition: targetMember.range.start,
        originalBlockPosition: selectedMembers[0].range.start
      };

      // Perform the block move
      this.moveBlockDownWithSelection(document, selectedMembers, targetMember, selectionInfo, originalScope, searchContext);
    }

    return { newPosition: selectedMembers[0].range.start, moved: true };
  }

  /**
   * Capture selection information relative to member content
   */
  private captureSelectionInfo(
    document: vscode.TextDocument,
    selections: readonly vscode.Selection[],
    selectedMembers: { range: vscode.Range, text: string, name: string, index: number }[]
  ): { memberName: string, relativeStart: number, relativeEnd: number }[] {
    const selectionInfo: { memberName: string, relativeStart: number, relativeEnd: number }[] = [];

    // First, ensure all selected members have at least a default selection
    const membersWithSelections = new Set<string>();

    for (const selection of selections) {
      // Find all members that this selection intersects with
      const intersectingMembers = selectedMembers.filter(member =>
        this.rangesIntersect(selection, member.range)
      );

      if (intersectingMembers.length === 0) continue;

      if (intersectingMembers.length === 1) {
        // Simple case: selection intersects with only one member
        const member = intersectingMembers[0];
        const memberStartOffset = document.offsetAt(member.range.start);
        const selectionStartOffset = document.offsetAt(selection.start);
        const selectionEndOffset = document.offsetAt(selection.end);

        const relativeStart = selectionStartOffset - memberStartOffset;
        const relativeEnd = selectionEndOffset - memberStartOffset;

        selectionInfo.push({
          memberName: member.name,
          relativeStart,
          relativeEnd
        });

        membersWithSelections.add(member.name);
      } else {
        // Complex case: selection spans multiple members
        // Create appropriate selections for each intersecting member
        for (const member of intersectingMembers) {
          const memberStartOffset = document.offsetAt(member.range.start);
          const memberEndOffset = document.offsetAt(member.range.end);
          const selectionStartOffset = document.offsetAt(selection.start);
          const selectionEndOffset = document.offsetAt(selection.end);

          // Calculate the intersection of the selection with this member
          const intersectionStart = Math.max(memberStartOffset, selectionStartOffset);
          const intersectionEnd = Math.min(memberEndOffset, selectionEndOffset);

          // If there's a valid intersection, create a selection for this member
          if (intersectionStart < intersectionEnd) {
            const relativeStart = intersectionStart - memberStartOffset;
            const relativeEnd = intersectionEnd - memberStartOffset;

            selectionInfo.push({
              memberName: member.name,
              relativeStart,
              relativeEnd
            });

            membersWithSelections.add(member.name);
          }
        }
      }
    }

    // For any selected members that don't have a selection yet, create a default full selection
    for (const member of selectedMembers) {
      if (!membersWithSelections.has(member.name)) {
        selectionInfo.push({
          memberName: member.name,
          relativeStart: 0,
          relativeEnd: document.offsetAt(member.range.end) - document.offsetAt(member.range.start)
        });
      }
    }

    return selectionInfo;
  }

  /**
   * Move a block of members up by swapping with the member above and preserve selections
   */
  private moveBlockUpWithSelection(
    document: vscode.TextDocument,
    selectedMembers: { range: vscode.Range, text: string, name: string, index: number }[],
    targetMember: { range: vscode.Range, text: string, name: string },
    selectionInfo: { memberName: string, relativeStart: number, relativeEnd: number }[],
    originalScope: { range: vscode.Range, text: string, name: string }[],
    searchContext: { direction: string, targetMemberPosition: vscode.Position, originalBlockPosition: vscode.Position }
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
        // Position cursor at the declaration of the first moved member
        const firstMemberName = selectedMembers[0].name;
        const targetPosition = this.findMemberDeclarationPosition(document, firstMemberName, newBlockStart.line, newBlockStart.character);
        editor.selection = new vscode.Selection(targetPosition, targetPosition);
        editor.revealRange(new vscode.Range(targetPosition, targetPosition), vscode.TextEditorRevealType.InCenter);
        console.log(`✓ Positioned cursor at moved block: line ${targetPosition.line + 1}`);
      }
    });
  }

  /**
   * Move a block of members down by swapping with the member below and preserve selections
   */
  private moveBlockDownWithSelection(
    document: vscode.TextDocument,
    selectedMembers: { range: vscode.Range, text: string, name: string, index: number }[],
    targetMember: { range: vscode.Range, text: string, name: string },
    selectionInfo: { memberName: string, relativeStart: number, relativeEnd: number }[],
    originalScope: { range: vscode.Range, text: string, name: string }[],
    searchContext: { direction: string, targetMemberPosition: vscode.Position, originalBlockPosition: vscode.Position }
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

    // Calculate where the block will end up after the swap
    // When moving down: the block will end up exactly where the target member was
    const newBlockStart = targetMember.range.start;

    // Create the edit and handle cursor positioning
    editor.edit(editBuilder => {
      // Replace the block with the target member
      editBuilder.replace(blockRange, targetMember.text);
      // Replace the target member with the complete block
      editBuilder.replace(targetMember.range, completeBlockText);
    }).then((success) => {
      if (success) {
        // Position cursor at the declaration of the first moved member  
        const firstMemberName = selectedMembers[0].name;
        const targetPosition = this.findMemberDeclarationPosition(document, firstMemberName, newBlockStart.line, newBlockStart.character);
        editor.selection = new vscode.Selection(targetPosition, targetPosition);
        editor.revealRange(new vscode.Range(targetPosition, targetPosition), vscode.TextEditorRevealType.InCenter);
        console.log(`✓ Positioned cursor at moved block: line ${targetPosition.line + 1}`);
      }
    });
  }

  /**
   * Restore selections by finding members by their names in the new document
   */
  private restoreSelectionsAfterMoveByMemberNames(
    document: vscode.TextDocument,
    selectionInfo: { memberName: string, relativeStart: number, relativeEnd: number }[],
    originalScope: { range: vscode.Range, text: string, name: string }[],
    searchContext: { direction: string, targetMemberPosition: vscode.Position, originalBlockPosition: vscode.Position }
  ): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return;
    }

    try {
      // Find the scope by looking for a position that contains the expected members
      let currentMembers: { range: vscode.Range, text: string, name: string }[] = [];

      // Create smart search positions based on movement direction
      const searchPositions: vscode.Position[] = [];

      // Add positions of non-moved members (most reliable)
      const nonMovedMembers = originalScope.filter(m => !selectionInfo.some(s => s.memberName === m.name));
      searchPositions.push(...nonMovedMembers.map(m => m.range.start));

      if (searchContext.direction === 'up') {
        // When moving up, the block moved to the target member's position
        searchPositions.push(searchContext.targetMemberPosition);
        searchPositions.push(new vscode.Position(searchContext.targetMemberPosition.line + 2, 0));
        searchPositions.push(new vscode.Position(Math.max(0, searchContext.targetMemberPosition.line - 2), 0));
      } else {
        // When moving down, the block moved to around the target member's position
        // But we need to search in a wider area since the swap affects positions
        searchPositions.push(searchContext.targetMemberPosition);
        searchPositions.push(new vscode.Position(searchContext.targetMemberPosition.line - 5, 0));
        searchPositions.push(new vscode.Position(searchContext.targetMemberPosition.line + 5, 0));
        searchPositions.push(new vscode.Position(searchContext.originalBlockPosition.line + 10, 0));

        // Also try searching from the original scope area in case the structure changed
        searchPositions.push(searchContext.originalBlockPosition);
        searchPositions.push(new vscode.Position(searchContext.originalBlockPosition.line + 15, 0));
      }

      // Add general fallback positions around the original scope
      searchPositions.push(
        new vscode.Position(Math.max(0, originalScope[0].range.start.line - 10), 0),
        new vscode.Position(originalScope[0].range.start.line, 0),
        new vscode.Position(originalScope[0].range.start.line + 20, 0)
      );

      for (const searchPos of searchPositions) {
        try {
          const testMembers = this.getMembersInCurrentScope(document, searchPos);

          console.log(`\n--- Testing search position ${searchPos.line}:${searchPos.character} ---`);
          console.log(`Found ${testMembers.length} members:`);
          testMembers.forEach((member, i) => {
            console.log(`  ${i}: "${member.name}" at line ${member.range.start.line + 1}`);
            console.log(`     Text: ${member.text.trim().substring(0, 80)}...`);
          });

          // Check if this scope contains our expected members
          const foundTargetMembers = selectionInfo.filter(s => testMembers.some(m => m.name === s.memberName));
          console.log(`Found ${foundTargetMembers.length} of ${selectionInfo.length} target members`);
          foundTargetMembers.forEach(target => {
            console.log(`  Target member found: "${target.memberName}"`);
          });

          if (foundTargetMembers.length > 0 && testMembers.length >= originalScope.length - 1) {
            console.log(`✓ Using this scope (has target members and sufficient total members)`);
            currentMembers = testMembers;
            break;
          } else {
            console.log(`✗ Skipping this scope (insufficient matches)`);
          }
        } catch (error) {
          console.log(`✗ Error at position ${searchPos.line}:${searchPos.character}:`, error instanceof Error ? error.message : String(error));
          // Continue to next search position
        }
      }

      if (currentMembers.length === 0) {
        return;
      }

      const newSelections: vscode.Selection[] = [];

      // Process each captured selection individually
      for (const selInfo of selectionInfo) {
        // Find the member by name in the new positions
        // Use improved matching to find the actual member declaration, not just any reference
        const foundMember = this.findMemberByNameAndCharacteristics(currentMembers, selInfo.memberName, originalScope);

        if (foundMember) {
          // Calculate the new selection position
          const memberStartOffset = document.offsetAt(foundMember.range.start);
          const newSelectionStartOffset = memberStartOffset + selInfo.relativeStart;
          const newSelectionEndOffset = memberStartOffset + selInfo.relativeEnd;

          // Ensure we don't go beyond the member bounds
          const memberEndOffset = document.offsetAt(foundMember.range.end);
          const clampedStartOffset = Math.max(memberStartOffset, Math.min(newSelectionStartOffset, memberEndOffset));
          const clampedEndOffset = Math.max(memberStartOffset, Math.min(newSelectionEndOffset, memberEndOffset));

          const newStart = document.positionAt(clampedStartOffset);
          const newEnd = document.positionAt(clampedEndOffset);

          newSelections.push(new vscode.Selection(newStart, newEnd));
        }
      }

      // Apply the new selections
      if (newSelections.length > 0) {
        editor.selections = newSelections;
        // Center on the first selection (the moved block)
        editor.revealRange(newSelections[0], vscode.TextEditorRevealType.InCenter);
      }
    } catch (error) {
      console.error('Error restoring selections after move:', error);
    }
  }

  /**
   * Restore selections after move using AST-based approach
   */
  private restoreSelectionsAfterMoveUsingAST(
    document: vscode.TextDocument,
    selectionInfo: { memberName: string, relativeStart: number, relativeEnd: number }[]
  ): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return;
    }

    try {
      console.log(`\n=== RESTORING SELECTIONS USING AST ===`);
      console.log(`Restoring selections for ${selectionInfo.length} members:`);
      selectionInfo.forEach(info => {
        console.log(`  Member: "${info.memberName}"`);
      });

      // Parse the updated document
      const sourceFile = this.createSourceFile(document);
      const newSelections: vscode.Selection[] = [];

      // Find each member using AST and restore its selection
      for (const selInfo of selectionInfo) {
        console.log(`\nFinding "${selInfo.memberName}" using AST...`);

        // Find all declaration nodes that match the member name
        const matchingDeclarations = this.findAllDeclarationsWithName(sourceFile, selInfo.memberName);

        if (matchingDeclarations.length === 0) {
          console.log(`✗ No declaration nodes found for "${selInfo.memberName}"`);
          continue;
        }

        // If multiple declarations, take the first one (they should be unique in scope)
        const declaration = matchingDeclarations[0];
        console.log(`✓ Found declaration for "${selInfo.memberName}" at position ${document.positionAt(declaration.getStart()).line + 1}`);

        // Get the start position of the declaration
        const declarationStart = document.positionAt(declaration.getStart());
        const declarationEnd = document.positionAt(declaration.getEnd());

        // Calculate the selection position relative to the declaration start
        const memberStartOffset = document.offsetAt(declarationStart);
        const newSelectionStartOffset = memberStartOffset + selInfo.relativeStart;
        const newSelectionEndOffset = memberStartOffset + selInfo.relativeEnd;

        // Ensure we don't go beyond the member bounds
        const memberEndOffset = document.offsetAt(declarationEnd);
        const clampedStartOffset = Math.max(memberStartOffset, Math.min(newSelectionStartOffset, memberEndOffset));
        const clampedEndOffset = Math.max(memberStartOffset, Math.min(newSelectionEndOffset, memberEndOffset));

        const newStart = document.positionAt(clampedStartOffset);
        const newEnd = document.positionAt(clampedEndOffset);

        newSelections.push(new vscode.Selection(newStart, newEnd));
        console.log(`✓ Added selection for "${selInfo.memberName}" at ${newStart.line + 1}:${newStart.character}-${newEnd.line + 1}:${newEnd.character}`);
      }

      // Apply the new selections
      if (newSelections.length > 0) {
        editor.selections = newSelections;
        // Center on the first selection (the moved block)
        editor.revealRange(newSelections[0], vscode.TextEditorRevealType.InCenter);
        console.log(`✓ Applied ${newSelections.length} selections`);
      } else {
        console.log(`✗ No selections could be restored`);
      }
    } catch (error) {
      console.error('Error restoring selections using AST:', error);
    }
  }

  /**
   * Find a member by name and characteristics to avoid finding references instead of declarations
   */
  private findMemberByNameAndCharacteristics(
    currentMembers: { range: vscode.Range, text: string, name: string }[],
    targetName: string,
    originalScope: { range: vscode.Range, text: string, name: string }[]
  ): { range: vscode.Range, text: string, name: string } | undefined {
    // Find the original member to get its characteristics
    const originalMember = originalScope.find(m => m.name === targetName);
    if (!originalMember) {
      // Fallback to simple name matching
      return currentMembers.find(m => m.name === targetName);
    }

    // Find candidates with the same name
    const candidates = currentMembers.filter(m => m.name === targetName);

    console.log(`\n=== Finding member "${targetName}" ===`);
    console.log(`Found ${candidates.length} candidates:`);
    candidates.forEach((candidate, i) => {
      console.log(`Candidate ${i + 1}: "${candidate.name}" at line ${candidate.range.start.line + 1}`);
      console.log(`Text preview: ${candidate.text.trim().substring(0, 100)}...`);
    });

    if (candidates.length === 0) {
      console.log(`No candidates found for "${targetName}"`);
      return undefined;
    }

    if (candidates.length === 1) {
      console.log(`Only one candidate, using it`);
      return candidates[0];
    }

    // Multiple candidates - use characteristics to find the best match
    const originalText = originalMember.text.trim();
    const originalLineCount = originalMember.range.end.line - originalMember.range.start.line + 1;

    console.log(`Original member had ${originalLineCount} lines`);

    // Score each candidate based on similarity to the original
    let bestCandidate = candidates[0];
    let bestScore = -1000; // Start with very low score

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      let score = 0;
      const candidateText = candidate.text.trim();
      const candidateLineCount = candidate.range.end.line - candidate.range.start.line + 1;

      console.log(`\nScoring candidate ${i + 1} for "${targetName}":`);
      console.log(`Text: ${candidateText.substring(0, 150)}...`);

      // CRITICAL: Check if this is actually a declaration of the target name
      const isActualDeclaration = this.isActualDeclaration(candidateText, targetName);
      const isJustReference = this.isJustReference(candidateText, targetName);

      console.log(`Is actual declaration: ${isActualDeclaration}`);
      console.log(`Is just reference: ${isJustReference}`);

      if (isActualDeclaration) {
        score += 1000; // VERY high score for actual declarations
        console.log(`+1000 for being actual declaration`);
      } else if (isJustReference) {
        score -= 500; // Heavy penalty for just being a reference
        console.log(`-500 for being just a reference`);
      }

      // Additional check: The member name should match the start of the declaration
      if (this.startsWithTargetName(candidateText, targetName)) {
        score += 500;
        console.log(`+500 for starting with target name`);
      }

      // Score based on text similarity (lower weight now)
      if (candidateText === originalText) {
        score += 100; // Exact match
        console.log(`+100 for exact text match`);
      } else if (candidateText.length > 0 && originalText.length > 0) {
        const similarity = this.calculateTextSimilarity(originalText, candidateText);
        const similarityScore = similarity * 50;
        score += similarityScore;
        console.log(`+${similarityScore.toFixed(1)} for text similarity (${(similarity * 100).toFixed(1)}%)`);
      }

      // Score based on line count similarity (lower weight)
      if (candidateLineCount === originalLineCount) {
        score += 20;
        console.log(`+20 for matching line count`);
      }

      console.log(`Total score: ${score}`);

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
        console.log(`New best candidate!`);
      }
    }

    console.log(`\nSelected candidate with score ${bestScore}: "${bestCandidate.name}" at line ${bestCandidate.range.start.line + 1}`);
    console.log(`Selected text: ${bestCandidate.text.trim().substring(0, 100)}...`);

    return bestCandidate;
  }

  /**
   * Check if the text starts with the target name as a declaration
   */
  private startsWithTargetName(text: string, targetName: string): boolean {
    const trimmedText = text.trim();

    // Check various patterns where the target name starts the declaration
    // const/let/var targetName
    if (this.startsWithPattern(trimmedText, 'const ', targetName) ||
      this.startsWithPattern(trimmedText, 'let ', targetName) ||
      this.startsWithPattern(trimmedText, 'var ', targetName)) {
      return true;
    }

    // function targetName or async function targetName
    if (this.startsWithPattern(trimmedText, 'function ', targetName) ||
      this.startsWithPattern(trimmedText, 'async function ', targetName)) {
      return true;
    }

    // targetName: or targetName(
    if (trimmedText.startsWith(targetName)) {
      const afterName = trimmedText.substring(targetName.length).trim();
      if (afterName.startsWith(':') || afterName.startsWith('(')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Helper method to check if text starts with a keyword followed by target name
   */
  private startsWithPattern(text: string, keyword: string, targetName: string): boolean {
    if (!text.startsWith(keyword)) {
      return false;
    }
    const afterKeyword = text.substring(keyword.length).trim();
    return afterKeyword.startsWith(targetName) &&
      (afterKeyword.length === targetName.length ||
        !this.isIdentifierChar(afterKeyword.charAt(targetName.length)));
  }

  /**
   * Check if character is a valid identifier character
   */
  private isIdentifierChar(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      (char >= '0' && char <= '9') ||
      char === '_' || char === '$';
  }

  /**
   * Check if the text is an actual declaration of the target name
   */
  private isActualDeclaration(text: string, targetName: string): boolean {
    const trimmedText = text.trim();

    // Check for various declaration patterns

    // const/let/var targetName =
    if (this.isVariableDeclaration(trimmedText, targetName)) {
      return true;
    }

    // function targetName( or async function targetName(
    if (this.isFunctionDeclaration(trimmedText, targetName)) {
      return true;
    }

    // targetName( - function call or function expression
    if (this.isFunctionCall(trimmedText, targetName)) {
      return true;
    }

    // targetName: ... - object property
    if (this.isPropertyDeclaration(trimmedText, targetName)) {
      return true;
    }

    // class/interface/type targetName
    if (this.isTypeDeclaration(trimmedText, targetName)) {
      return true;
    }

    return false;
  }

  /**
   * Check if text is a variable declaration (const/let/var targetName = ...)
   */
  private isVariableDeclaration(text: string, targetName: string): boolean {
    const keywords = ['const ', 'let ', 'var '];
    for (const keyword of keywords) {
      if (text.startsWith(keyword)) {
        const afterKeyword = text.substring(keyword.length).trim();
        if (this.nameFollowedByAssignment(afterKeyword, targetName)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if text is a function declaration
   */
  private isFunctionDeclaration(text: string, targetName: string): boolean {
    if (this.startsWithPattern(text, 'function ', targetName)) {
      const afterName = text.substring(('function ' + targetName).length).trim();
      return afterName.startsWith('(');
    }
    if (this.startsWithPattern(text, 'async function ', targetName)) {
      const afterName = text.substring(('async function ' + targetName).length).trim();
      return afterName.startsWith('(');
    }
    return false;
  }

  /**
   * Check if text is a function call or function expression
   */
  private isFunctionCall(text: string, targetName: string): boolean {
    if (text.startsWith(targetName)) {
      const afterName = text.substring(targetName.length).trim();
      return afterName.startsWith('(');
    }
    return false;
  }

  /**
   * Check if text is a property declaration (targetName: ...)
   */
  private isPropertyDeclaration(text: string, targetName: string): boolean {
    if (text.startsWith(targetName)) {
      const afterName = text.substring(targetName.length).trim();
      if (afterName.startsWith(':')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if text is a type declaration (class/interface/type targetName)
   */
  private isTypeDeclaration(text: string, targetName: string): boolean {
    const typeKeywords = ['class ', 'interface ', 'type '];
    for (const keyword of typeKeywords) {
      if (this.startsWithPattern(text, keyword, targetName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if name is followed by assignment (= or :)
   */
  private nameFollowedByAssignment(text: string, targetName: string): boolean {
    if (!text.startsWith(targetName)) {
      return false;
    }
    const afterName = text.substring(targetName.length).trim();
    return afterName.startsWith('=') || afterName.startsWith(':');
  }

  /**
   * Check if the text just contains references to the target name but isn't a declaration
   */
  private isJustReference(text: string, targetName: string): boolean {
    const trimmedText = text.trim();

    // If it's an actual declaration, it's not just a reference
    if (this.isActualDeclaration(trimmedText, targetName)) {
      return false;
    }

    // Check if the text contains the target name but doesn't declare it
    const containsName = this.containsWordBoundary(trimmedText, targetName);

    // If it contains the name but isn't a declaration, it's likely just a reference
    return containsName;
  }

  /**
   * Check if text contains target name with word boundaries
   */
  private containsWordBoundary(text: string, targetName: string): boolean {
    let index = 0;
    while ((index = text.indexOf(targetName, index)) !== -1) {
      // Check if it's a word boundary (not preceded or followed by identifier chars)
      const before = index > 0 ? text[index - 1] : ' ';
      const after = index + targetName.length < text.length ? text[index + targetName.length] : ' ';

      if (!this.isIdentifierChar(before) && !this.isIdentifierChar(after)) {
        return true;
      }
      index++;
    }
    return false;
  }

  /**
   * Calculate text similarity between two strings (simple implementation)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1.0;
    if (text1.length === 0 || text2.length === 0) return 0.0;

    // Simple similarity based on common characters and length
    const shorter = text1.length < text2.length ? text1 : text2;
    const longer = text1.length >= text2.length ? text1 : text2;

    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }

    // Count common characters (very basic similarity)
    let commonChars = 0;
    for (const char of shorter) {
      if (longer.includes(char)) {
        commonChars++;
      }
    }

    return commonChars / longer.length;
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
        // Find the actual declaration position within the moved member
        const targetPosition = this.findMemberDeclarationPosition(document, memberA.name, targetStartLine, targetStartCharacter);

        editor.selection = new vscode.Selection(targetPosition, targetPosition);
        editor.revealRange(new vscode.Range(targetPosition, targetPosition), vscode.TextEditorRevealType.InCenter);
        console.log(`✓ Positioned cursor at line ${targetPosition.line + 1}, character ${targetPosition.character + 1}`);
      }
    });

    // For immediate return, return the target position
    return { newPosition: new vscode.Position(targetStartLine, targetStartCharacter), moved: true };
  }









  /**
 * Find the moved member using AST and position cursor on it
 */
  private findMovedMemberAndPositionCursor(
    document: vscode.TextDocument,
    memberName: string,
    targetStartLine: number,
    targetEndLine: number
  ): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      console.log(`✗ No active editor or document mismatch`);
      return;
    }

    try {
      console.log(`\n=== FINDING MOVED MEMBER USING AST ===`);
      console.log(`Looking for "${memberName}" declaration using TypeScript AST`);

      // Parse the updated document
      const sourceFile = this.createSourceFile(document);

      // Find all declaration nodes that match the member name
      const matchingDeclarations = this.findAllDeclarationsWithName(sourceFile, memberName);

      console.log(`Found ${matchingDeclarations.length} declaration nodes with name "${memberName}"`);

      let targetNodes: ts.Node[] = [];

      if (matchingDeclarations.length > 0) {
        targetNodes = matchingDeclarations;
        console.log(`✓ Using ${targetNodes.length} declaration nodes for "${memberName}"`);
      } else {
        console.log(`✗ No declaration nodes found for "${memberName}", looking for call expressions...`);
        // Look for call expressions (like onBeforeMount())
        const callExpressions = this.findAllCallExpressionsWithName(sourceFile, memberName);
        console.log(`Found ${callExpressions.length} call expression nodes with name "${memberName}"`);

        if (callExpressions.length > 0) {
          targetNodes = callExpressions;
          console.log(`✓ Using ${targetNodes.length} call expression nodes for "${memberName}"`);
        } else {
          console.log(`✗ No call expressions found for "${memberName}"`);
          this.fallbackToTargetArea(document, targetStartLine);
          return;
        }
      }

      if (targetNodes.length === 0) {
        console.log(`✗ No target nodes found for "${memberName}"`);
        this.fallbackToTargetArea(document, targetStartLine);
        return;
      }

      // If only one target node, use it
      if (targetNodes.length === 1) {
        const targetNode = targetNodes[0];
        this.positionCursorOnDeclaration(document, targetNode, memberName);
        return;
      }

      // Multiple target nodes found - find the one closest to the target area
      console.log(`Multiple target nodes found, selecting closest to target area (line ${targetStartLine + 1})`);

      let bestNode = targetNodes[0];
      let bestDistance = Number.MAX_SAFE_INTEGER;

      for (const node of targetNodes) {
        const nodeLine = document.positionAt(node.getStart()).line;
        const distance = Math.abs(nodeLine - targetStartLine);

        console.log(`Target node at line ${nodeLine + 1}, distance: ${distance}`);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestNode = node;
        }
      }

      console.log(`Selected target node at line ${document.positionAt(bestNode.getStart()).line + 1} (distance: ${bestDistance})`);
      this.positionCursorOnDeclaration(document, bestNode, memberName);

    } catch (error) {
      console.error('Error finding moved member using AST:', error);
      this.fallbackToTargetArea(document, targetStartLine);
    }
  }

  /**
   * Find all declaration nodes with the given name
   */
  private findAllDeclarationsWithName(node: ts.Node, targetName: string): ts.Node[] {
    const declarations: ts.Node[] = [];

    const visit = (node: ts.Node) => {
      // Check if this node is a declaration with the target name
      if (this.isDeclarationWithName(node, targetName)) {
        declarations.push(node);
      }

      // Continue searching children
      ts.forEachChild(node, visit);
    };

    visit(node);
    return declarations;
  }

  /**
   * Check if a node is a declaration with the target name
   */
  private isDeclarationWithName(node: ts.Node, targetName: string): boolean {
    // Variable declarations
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === targetName) {
      return true;
    }

    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.name.text === targetName) {
      return true;
    }

    // Class members (methods, properties)
    if (ts.isClassElement(node) && node.name && ts.isIdentifier(node.name) && node.name.text === targetName) {
      return true;
    }

    // Constructor
    if (ts.isConstructorDeclaration(node) && targetName === 'constructor') {
      return true;
    }

    // Property assignments in object literals
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === targetName) {
      return true;
    }

    // Shorthand property assignments
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === targetName) {
      return true;
    }

    return false;
  }

  /**
   * Position cursor on the name part of a declaration node
   */
  private positionCursorOnDeclaration(document: vscode.TextDocument, declaration: ts.Node, memberName: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return;
    }

    let namePosition: vscode.Position;

    // Find the exact position of the name within the declaration
    if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
      namePosition = document.positionAt(declaration.name.getStart());
    } else if (ts.isFunctionDeclaration(declaration) && declaration.name && ts.isIdentifier(declaration.name)) {
      namePosition = document.positionAt(declaration.name.getStart());
    } else if (ts.isClassElement(declaration) && declaration.name && ts.isIdentifier(declaration.name)) {
      namePosition = document.positionAt(declaration.name.getStart());
    } else if (ts.isConstructorDeclaration(declaration)) {
      // For constructor, find the 'constructor' keyword
      const constructorKeyword = declaration.getChildren().find(child => child.kind === ts.SyntaxKind.ConstructorKeyword);
      if (constructorKeyword) {
        namePosition = document.positionAt(constructorKeyword.getStart());
      } else {
        namePosition = document.positionAt(declaration.getStart());
      }
    } else if (ts.isPropertyAssignment(declaration) && ts.isIdentifier(declaration.name)) {
      namePosition = document.positionAt(declaration.name.getStart());
    } else if (ts.isShorthandPropertyAssignment(declaration)) {
      namePosition = document.positionAt(declaration.name.getStart());
    } else {
      // Fallback to the start of the declaration
      namePosition = document.positionAt(declaration.getStart());
    }

    // Position cursor at the name
    const newSelection = new vscode.Selection(namePosition, namePosition);
    editor.selection = newSelection;
    editor.revealRange(new vscode.Range(namePosition, namePosition), vscode.TextEditorRevealType.InCenter);

    console.log(`✓ Positioned cursor on declaration of "${memberName}" at line ${namePosition.line + 1}, column ${namePosition.character + 1}`);
  }

  /**
 * Find the exact declaration position of a member within a given area
 */
  private findMemberDeclarationPosition(
    document: vscode.TextDocument,
    memberName: string,
    startLine: number,
    startCharacter: number
  ): vscode.Position {
    try {
      // Search in a much wider area since positions can shift significantly after edits
      const searchStartLine = Math.max(0, startLine - 10);
      const searchEndLine = Math.min(startLine + 30, document.lineCount - 1);

      console.log(`Searching for "${memberName}" declaration in lines ${searchStartLine + 1}-${searchEndLine + 1} (expected around line ${startLine + 1})`);

      // First try simple text search as it's more reliable after document edits
      const textPosition = this.findMemberByTextSearch(document, memberName, searchStartLine, searchEndLine);
      if (textPosition) {
        console.log(`Found "${memberName}" by text search at line ${textPosition.line + 1}, char ${textPosition.character + 1}`);
        return textPosition;
      }

      // If text search fails, try AST search with full document parsing
      console.log(`Text search failed, trying AST search for "${memberName}"`);
      const astPosition = this.findMemberByAST(document, memberName, startLine);
      if (astPosition) {
        console.log(`Found "${memberName}" by AST search at line ${astPosition.line + 1}, char ${astPosition.character + 1}`);
        return astPosition;
      }

      console.log(`Could not find declaration for "${memberName}", using fallback position`);
    } catch (error) {
      console.log(`Error finding declaration position for "${memberName}":`, error);
    }

    // Fallback to original position
    return new vscode.Position(startLine, startCharacter);
  }

  /**
   * Find member using AST on the full document
   */
  private findMemberByAST(
    document: vscode.TextDocument,
    memberName: string,
    expectedLine: number
  ): vscode.Position | null {
    try {
      const sourceFile = this.createSourceFile(document);

      // Find all declarations with the target name
      const declarations = this.findAllDeclarationsWithName(sourceFile, memberName);

      if (declarations.length === 0) {
        // Try call expressions
        const callExpressions = this.findAllCallExpressionsWithName(sourceFile, memberName);
        if (callExpressions.length > 0) {
          return document.positionAt(callExpressions[0].getStart());
        }
        return null;
      }

      if (declarations.length === 1) {
        return document.positionAt(declarations[0].getStart());
      }

      // Multiple declarations - find the closest to expected line
      let bestDeclaration = declarations[0];
      let bestDistance = Number.MAX_SAFE_INTEGER;

      for (const declaration of declarations) {
        const declarationLine = document.positionAt(declaration.getStart()).line;
        const distance = Math.abs(declarationLine - expectedLine);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestDeclaration = declaration;
        }
      }

      return document.positionAt(bestDeclaration.getStart());
    } catch (error) {
      console.log(`AST search error for "${memberName}":`, error);
      return null;
    }
  }

  /**
   * Convert search-relative offset to document position
   */
  private convertSearchOffsetToDocumentPosition(
    searchText: string,
    offsetInSearch: number,
    searchStartLine: number,
    searchStartCharacter: number
  ): vscode.Position | null {
    const lines = searchText.split('\n');
    let currentOffset = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineLength = lines[lineIndex].length + 1; // +1 for newline

      if (currentOffset <= offsetInSearch && offsetInSearch < currentOffset + lineLength) {
        const declarationLine = searchStartLine + lineIndex;
        const declarationChar = searchStartCharacter + (offsetInSearch - currentOffset);
        return new vscode.Position(declarationLine, declarationChar);
      }

      currentOffset += lineLength;
    }

    return null;
  }

  /**
 * Find member by simple text search as fallback
 */
  private findMemberByTextSearch(
    document: vscode.TextDocument,
    memberName: string,
    startLine: number,
    endLine: number
  ): vscode.Position | null {
    console.log(`Text search for "${memberName}" in lines ${startLine + 1}-${endLine + 1}`);

    // Search line by line for better debugging
    for (let lineNum = startLine; lineNum <= endLine && lineNum < document.lineCount; lineNum++) {
      const line = document.lineAt(lineNum);
      const lineText = line.text;

      // Log each line we're checking
      if (lineText.includes(memberName)) {
        console.log(`  Line ${lineNum + 1}: ${lineText.trim()}`);

        const position = this.findMemberInLine(lineText, memberName, lineNum);
        if (position) {
          console.log(`  ✓ Found "${memberName}" at line ${position.line + 1}, char ${position.character + 1}`);
          return position;
        }
      }
    }

    console.log(`  ✗ No text matches found for "${memberName}"`);
    return null;
  }

  /**
   * Find member declaration in a single line using string operations
   */
  private findMemberInLine(lineText: string, memberName: string, lineNum: number): vscode.Position | null {
    const trimmed = lineText.trim();

    // Check for variable declarations: const memberName =, let memberName =, var memberName =
    if (this.isVariableDeclarationLine(trimmed, memberName)) {
      const nameIndex = this.findMemberNameIndex(lineText, memberName, 'const', 'let', 'var');
      if (nameIndex !== -1) {
        return new vscode.Position(lineNum, nameIndex);
      }
    }

    // Check for function declarations: function memberName(, async function memberName(
    if (this.isFunctionDeclarationLine(trimmed, memberName)) {
      const nameIndex = this.findMemberNameIndex(lineText, memberName, 'function');
      if (nameIndex !== -1) {
        return new vscode.Position(lineNum, nameIndex);
      }
    }

    // Check for call expressions: memberName(
    if (this.isCallExpressionLine(trimmed, memberName)) {
      const nameIndex = this.findCallExpressionNameIndex(lineText, memberName);
      if (nameIndex !== -1) {
        return new vscode.Position(lineNum, nameIndex);
      }
    }

    // Check for object properties: memberName:
    if (this.isObjectPropertyLine(trimmed, memberName)) {
      const nameIndex = this.findObjectPropertyNameIndex(lineText, memberName);
      if (nameIndex !== -1) {
        return new vscode.Position(lineNum, nameIndex);
      }
    }

    return null;
  }

  /**
   * Check if line contains a variable declaration for the member
   */
  private isVariableDeclarationLine(trimmed: string, memberName: string): boolean {
    return (trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('var ')) &&
      trimmed.includes(memberName) &&
      (trimmed.includes('=') || trimmed.includes(':'));
  }

  /**
   * Check if line contains a function declaration for the member
   */
  private isFunctionDeclarationLine(trimmed: string, memberName: string): boolean {
    return (trimmed.startsWith('function ') || trimmed.startsWith('async function ')) &&
      trimmed.includes(memberName) &&
      trimmed.includes('(');
  }

  /**
   * Check if line contains a call expression for the member
   */
  private isCallExpressionLine(trimmed: string, memberName: string): boolean {
    return trimmed.startsWith(memberName + '(');
  }

  /**
   * Check if line contains an object property for the member
   */
  private isObjectPropertyLine(trimmed: string, memberName: string): boolean {
    return trimmed.startsWith(memberName + ':') ||
      (trimmed.includes(memberName + ':') && trimmed.indexOf(memberName + ':') < 50); // Allow some indentation
  }

  /**
   * Find the index of the member name after certain keywords
   */
  private findMemberNameIndex(lineText: string, memberName: string, ...keywords: string[]): number {
    for (const keyword of keywords) {
      const keywordIndex = lineText.indexOf(keyword);
      if (keywordIndex !== -1) {
        // Look for the member name after the keyword
        const afterKeyword = lineText.substring(keywordIndex + keyword.length);
        const nameInAfterKeyword = afterKeyword.indexOf(memberName);

        if (nameInAfterKeyword !== -1) {
          // Check if it's a word boundary (not part of another identifier)
          const absoluteIndex = keywordIndex + keyword.length + nameInAfterKeyword;
          if (this.isValidMemberNameBoundary(lineText, absoluteIndex, memberName)) {
            return absoluteIndex;
          }
        }
      }
    }
    return -1;
  }

  /**
   * Find the index of the member name in a call expression
   */
  private findCallExpressionNameIndex(lineText: string, memberName: string): number {
    const nameIndex = lineText.indexOf(memberName);
    if (nameIndex !== -1 && this.isValidMemberNameBoundary(lineText, nameIndex, memberName)) {
      // Check if it's followed by an opening parenthesis
      const afterName = lineText.substring(nameIndex + memberName.length).trim();
      if (afterName.startsWith('(')) {
        return nameIndex;
      }
    }
    return -1;
  }

  /**
   * Find the index of the member name in an object property
   */
  private findObjectPropertyNameIndex(lineText: string, memberName: string): number {
    const nameIndex = lineText.indexOf(memberName);
    if (nameIndex !== -1 && this.isValidMemberNameBoundary(lineText, nameIndex, memberName)) {
      // Check if it's followed by a colon
      const afterName = lineText.substring(nameIndex + memberName.length).trim();
      if (afterName.startsWith(':')) {
        return nameIndex;
      }
    }
    return -1;
  }

  /**
   * Check if the member name at the given index has valid word boundaries
   */
  private isValidMemberNameBoundary(lineText: string, index: number, memberName: string): boolean {
    const before = index > 0 ? lineText[index - 1] : ' ';
    const after = index + memberName.length < lineText.length ? lineText[index + memberName.length] : ' ';

    // Check that it's not part of another identifier
    return !this.isIdentifierChar(before) && !this.isIdentifierChar(after);
  }

  /**
   * Fallback to target area when AST search fails
   */
  private fallbackToTargetArea(document: vscode.TextDocument, targetStartLine: number): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return;
    }

    const fallbackPosition = new vscode.Position(targetStartLine, 0);
    const newSelection = new vscode.Selection(fallbackPosition, fallbackPosition);
    editor.selection = newSelection;
    editor.revealRange(new vscode.Range(fallbackPosition, fallbackPosition), vscode.TextEditorRevealType.InCenter);

    console.log(`Fallback: positioned cursor at line ${targetStartLine + 1}`);
  }

  // ========================================
  // CORE AST PROCESSING
  // ========================================

  /**
   * Main method for finding element ranges using TypeScript AST
   */
  private getElementRangeUsingAST(
    document: vscode.TextDocument,
    position: vscode.Position,
    targetKinds: ts.SyntaxKind[]
  ): vscode.Range | null {
    try {
      console.log(`Parsing ${document.languageId} file: ${document.fileName}`);
      const sourceFile = this.createSourceFile(document);
      console.log(`Created source file successfully`);

      const offset = document.offsetAt(position);
      console.log(`Looking for kinds: ${targetKinds.map(k => ts.SyntaxKind[k]).join(', ')}`);

      // Find the node that directly contains the cursor position
      const node = this.findDirectNodeAtPosition(sourceFile, offset, targetKinds);
      if (!node) {
        console.log('No matching node found');
        return null;
      }

      console.log(`Found node of kind: ${ts.SyntaxKind[node.kind]}`);
      return this.getNodeRange(document, node);
    } catch (error) {
      console.error('Error parsing TypeScript/TSX:', error);
      return null;
    }
  }

  private getNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    switch (node.kind) {
      case ts.SyntaxKind.ImportDeclaration:
      case ts.SyntaxKind.ImportEqualsDeclaration:
      case ts.SyntaxKind.ExportDeclaration:
      case ts.SyntaxKind.ExportAssignment:
        return this.getImportExportRange(document, node);

      case ts.SyntaxKind.CallExpression:
        return this.getCallExpressionRange(document, node);

      case ts.SyntaxKind.VariableDeclaration:
        const statement = this.findAncestorOfKind(node, ts.SyntaxKind.VariableStatement);
        if (statement) {
          return this.nodeToRange(document, statement);
        }
        break;

      case ts.SyntaxKind.PropertyAssignment:
      case ts.SyntaxKind.ShorthandPropertyAssignment:
      case ts.SyntaxKind.PropertySignature:
        return this.getPropertyRange(document, node);

      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.Constructor:
        return this.getClassMemberNodeRange(document, node);

      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
        return this.getFunctionNodeRange(document, node);

      default:
        return this.nodeToRange(document, node);
    }

    return this.nodeToRange(document, node);
  }

  private getImportExportRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For import/export statements, include the entire statement
    let start = document.positionAt(node.getStart());
    let end = document.positionAt(node.getEnd());

    // Try to include the semicolon if it exists
    const line = document.lineAt(end.line);
    const textAfterNode = line.text.substring(end.character);
    const semicolonMatch = textAfterNode.match(/^\s*;/);
    if (semicolonMatch) {
      end = new vscode.Position(end.line, end.character + semicolonMatch[0].length);
    }

    return new vscode.Range(start, end);
  }

  // Update the findDirectNodeAtPosition to be more precise about property detection
  private findDirectNodeAtPosition(
    node: ts.Node,
    position: number,
    targetKinds: ts.SyntaxKind[]
  ): ts.Node | null {
    // Find the deepest node that contains the position
    const containingNode = this.findDeepestContainingNode(node, position);
    if (!containingNode) {
      return null;
    }

    // For property assignments, we want to be very specific
    if (targetKinds.includes(ts.SyntaxKind.PropertyAssignment) ||
      targetKinds.includes(ts.SyntaxKind.ShorthandPropertyAssignment)) {

      // Walk up to find the most immediate property assignment
      let current: ts.Node | undefined = containingNode;
      let foundProperty: ts.Node | null = null;

      while (current) {
        if ((ts.isPropertyAssignment(current) || ts.isShorthandPropertyAssignment(current)) &&
          this.isValidScopeForPosition(current, position)) {
          foundProperty = current;
          // Don't break here - we want the most immediate property
        }
        current = current.parent;
      }

      if (foundProperty) {
        return foundProperty;
      }
    }

    // For other kinds, use the original logic
    let current: ts.Node | undefined = containingNode;
    while (current) {
      if (targetKinds.includes(current.kind)) {
        // Additional validation to ensure we're at the right scope level
        if (this.isValidScopeForPosition(current, position)) {
          return current;
        }
      }
      current = current.parent;
    }

    return null;
  }

  private createSourceFile(document: vscode.TextDocument): ts.SourceFile {
    // Determine script kind based on file extension or language ID
    let scriptKind = ts.ScriptKind.TS;

    if (document.languageId === 'tsx' ||
      document.languageId === 'typescriptreact' ||
      document.languageId === 'jsx' ||
      document.languageId === 'javascriptreact' ||
      document.fileName.endsWith('.tsx') ||
      document.fileName.endsWith('.jsx')) {
      scriptKind = ts.ScriptKind.TSX;
      console.log('Using TSX script kind for parsing');
    } else if (document.languageId === 'javascript' ||
      document.fileName.endsWith('.js')) {
      scriptKind = ts.ScriptKind.JS;
      console.log('Using JS script kind for parsing');
    } else {
      console.log('Using TS script kind for parsing');
    }

    return ts.createSourceFile(
      document.fileName,
      document.getText(),
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );
  }

  // ========================================
  // NODE FINDING AND VALIDATION
  // ========================================



  private findDeepestContainingNode(node: ts.Node, position: number): ts.Node | null {
    // Check if position is within this node
    if (position < node.getStart() || position > node.getEnd()) {
      return null;
    }

    // Check children first (depth-first search)
    let deepestChild: ts.Node | null = null;
    ts.forEachChild(node, (child) => {
      const childResult = this.findDeepestContainingNode(child, position);
      if (childResult) {
        deepestChild = childResult;
      }
    });

    // Return the deepest child if found, otherwise this node
    return deepestChild || node;
  }

  private isValidScopeForPosition(node: ts.Node, position: number): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.ImportDeclaration:
        return this.isCursorOnImportDeclaration(node, position);

      case ts.SyntaxKind.ImportEqualsDeclaration:
        return this.isCursorOnImportEqualsDeclaration(node, position);

      case ts.SyntaxKind.ExportDeclaration:
        return this.isCursorOnExportDeclaration(node, position);

      case ts.SyntaxKind.ExportAssignment:
        return this.isCursorOnExportAssignment(node, position);

      case ts.SyntaxKind.CallExpression:
        return this.isCursorOnCallExpression(node, position);

      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
        return this.isCursorOnFunctionDeclaration(node, position);

      case ts.SyntaxKind.MethodDeclaration:
        return this.isCursorOnMethodDeclaration(node, position);

      case ts.SyntaxKind.VariableDeclaration:
        return this.isCursorOnVariableName(node, position);

      case ts.SyntaxKind.PropertyAssignment:
      case ts.SyntaxKind.ShorthandPropertyAssignment:
        return this.isCursorOnPropertyKey(node, position);

      default:
        return true;
    }
  }

  private isCursorOnImportDeclaration(node: ts.Node, position: number): boolean {
    if (!ts.isImportDeclaration(node)) {
      return false;
    }

    // Check if cursor is on the import keyword, module specifier, or import clause
    const importKeywordStart = node.getStart();
    const importKeywordEnd = importKeywordStart + 6; // "import".length

    // Cursor on "import" keyword
    if (position >= importKeywordStart && position <= importKeywordEnd) {
      return true;
    }

    // Cursor on module specifier (the string after 'from')
    if (node.moduleSpecifier) {
      const moduleStart = node.moduleSpecifier.getStart();
      const moduleEnd = node.moduleSpecifier.getEnd();
      if (position >= moduleStart && position <= moduleEnd) {
        return true;
      }
    }

    // Cursor on import clause (the imported names)
    if (node.importClause) {
      const clauseStart = node.importClause.getStart();
      const clauseEnd = node.importClause.getEnd();
      if (position >= clauseStart && position <= clauseEnd) {
        return true;
      }
    }

    return false;
  }

  private isCursorOnImportEqualsDeclaration(node: ts.Node, position: number): boolean {
    if (!ts.isImportEqualsDeclaration(node)) {
      return false;
    }

    // Check if cursor is on the import keyword or the imported name
    const importKeywordStart = node.getStart();
    const nameEnd = node.name.getEnd();

    return position >= importKeywordStart && position <= nameEnd;
  }


  private isCursorOnExportDeclaration(node: ts.Node, position: number): boolean {
    if (!ts.isExportDeclaration(node)) {
      return false;
    }

    // Check if cursor is on the export keyword or export clause
    const exportKeywordStart = node.getStart();
    const exportKeywordEnd = exportKeywordStart + 6; // "export".length

    // Cursor on "export" keyword
    if (position >= exportKeywordStart && position <= exportKeywordEnd) {
      return true;
    }

    // Cursor on export clause or module specifier
    if (node.exportClause) {
      const clauseStart = node.exportClause.getStart();
      const clauseEnd = node.exportClause.getEnd();
      if (position >= clauseStart && position <= clauseEnd) {
        return true;
      }
    }

    if (node.moduleSpecifier) {
      const moduleStart = node.moduleSpecifier.getStart();
      const moduleEnd = node.moduleSpecifier.getEnd();
      if (position >= moduleStart && position <= moduleEnd) {
        return true;
      }
    }

    return false;
  }

  private isCursorOnExportAssignment(node: ts.Node, position: number): boolean {
    if (!ts.isExportAssignment(node)) {
      return false;
    }

    // Check if cursor is on the export keyword
    const exportKeywordStart = node.getStart();
    const exportKeywordEnd = exportKeywordStart + 6; // "export".length

    return position >= exportKeywordStart && position <= exportKeywordEnd;
  }



  // ========================================
  // CURSOR POSITION VALIDATION
  // ========================================

  private isCursorOnCallExpression(node: ts.Node, position: number): boolean {
    if (!ts.isCallExpression(node)) {
      return false;
    }

    // Check if cursor is on the function name being called
    const expression = node.expression;

    if (ts.isIdentifier(expression)) {
      // Simple function call like onMounted()
      const nameStart = expression.getStart();
      const nameEnd = expression.getEnd();
      return position >= nameStart && position <= nameEnd;
    } else if (ts.isPropertyAccessExpression(expression)) {
      // Method call like obj.method()
      const nameStart = expression.name.getStart();
      const nameEnd = expression.name.getEnd();
      return position >= nameStart && position <= nameEnd;
    }

    // For other types of call expressions, allow if cursor is anywhere in the expression part
    const expressionEnd = expression.getEnd();
    return position >= expression.getStart() && position <= expressionEnd;
  }

  private isCursorOnFunctionDeclaration(node: ts.Node, position: number): boolean {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      // Check if cursor is on the function keyword or name
      const functionKeywordStart = node.getStart();
      const nameEnd = node.name ? node.name.getEnd() : node.getStart() + 8; // "function".length
      return position >= functionKeywordStart && position <= nameEnd;
    }

    if (ts.isArrowFunction(node)) {
      // For arrow functions, check if cursor is on parameters or before =>
      const arrowToken = node.getChildren().find(child => child.kind === ts.SyntaxKind.EqualsGreaterThanToken);
      if (arrowToken) {
        return position <= arrowToken.getStart();
      }
    }

    return true;
  }

  private isCursorOnMethodDeclaration(node: ts.Node, position: number): boolean {
    if (ts.isMethodDeclaration(node)) {
      // Check if cursor is on method name or before the opening brace
      const name = node.name;
      if (name) {
        const nameStart = name.getStart();
        const nameEnd = name.getEnd();

        // Find the opening brace of the method body
        const openBrace = node.getChildren().find(child => child.kind === ts.SyntaxKind.OpenBraceToken);
        const beforeBody = openBrace ? openBrace.getStart() : nameEnd;

        return position >= nameStart && position <= beforeBody;
      }
    }
    return true;
  }

  private isCursorOnVariableName(node: ts.Node, position: number): boolean {
    if (ts.isVariableDeclaration(node)) {
      const name = node.name;
      if (name) {
        const nameStart = name.getStart();
        const nameEnd = name.getEnd();
        return position >= nameStart && position <= nameEnd;
      }
    }
    return true;
  }

  private isCursorOnPropertyKey(node: ts.Node, position: number): boolean {
    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const name = node.name;
      if (name) {
        const nameStart = name.getStart();
        const nameEnd = name.getEnd();
        // Allow cursor anywhere on the property name
        return position >= nameStart && position <= nameEnd;
      }
    }
    return true;
  }

  // ========================================
  // RANGE CALCULATION
  // ========================================



  private getCallExpressionRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    if (!ts.isCallExpression(node)) {
      return this.nodeToRange(document, node);
    }

    // Check if this call expression is part of an expression statement
    // If so, include the entire statement (which will include the semicolon if present)
    const parent = node.parent;
    if (ts.isExpressionStatement(parent)) {
      return this.nodeToRange(document, parent);
    }

    // If it's part of a variable declaration, include the entire declaration
    if (ts.isVariableDeclaration(parent)) {
      const variableStatement = this.findAncestorOfKind(node, ts.SyntaxKind.VariableStatement);
      if (variableStatement) {
        return this.nodeToRange(document, variableStatement);
      }
    }

    // Otherwise, just return the call expression itself
    return this.nodeToRange(document, node);
  }

  private getFunctionNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For functions, include any leading comments or decorators
    let start = node.getStart();

    // Check for leading trivia (comments, etc.)
    const fullStart = node.getFullStart();
    if (fullStart < start) {
      const leadingTrivia = node.getSourceFile().text.substring(fullStart, start);
      if (leadingTrivia.trim()) {
        start = fullStart;
      }
    }

    return new vscode.Range(
      document.positionAt(start),
      document.positionAt(node.getEnd())
    );
  }

  private getPropertyRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    if (!ts.isPropertyAssignment(node) && !ts.isShorthandPropertyAssignment(node)) {
      return this.nodeToRange(document, node);
    }

    // For property assignments, include the entire property (key + value)
    let start = document.positionAt(node.getStart());
    let end = document.positionAt(node.getEnd());

    // Try to include trailing comma if it exists on the same line
    const endLine = document.lineAt(end.line);
    const textAfterNode = endLine.text.substring(end.character);
    const commaMatch = textAfterNode.match(/^\s*,/);
    if (commaMatch) {
      end = new vscode.Position(end.line, end.character + commaMatch[0].length);
    } else {
      // If no comma on the same line, check if there's a comma on the next line
      if (end.line + 1 < document.lineCount) {
        const nextLine = document.lineAt(end.line + 1);
        const nextLineCommaMatch = nextLine.text.match(/^\s*,/);
        if (nextLineCommaMatch) {
          end = new vscode.Position(end.line + 1, nextLineCommaMatch[0].length);
        }
      }
    }

    return new vscode.Range(start, end);
  }


  private getClassMemberNodeRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    // For class members, include any decorators and modifiers but don't expand to class level
    return this.nodeToRange(document, node);
  }

  // ... (rest of the conditional block handling methods remain the same)
  // ... (rest of the class member handling methods remain the same)
  // ... (rest of the utility methods remain the same)

  // ========================================
  // CONDITIONAL BLOCK HANDLING
  // ========================================

  private findIfStatementAtPosition(node: ts.Node, position: number): ts.IfStatement | null {
    // Check if this node is an if statement and contains the position
    if (ts.isIfStatement(node) && position >= node.getStart() && position <= node.getEnd()) {
      // Check if cursor is specifically on a keyword in this if statement
      if (this.isCursorOnConditionalKeyword(node, position)) {
        return node;
      }
    }

    // Recursively search children
    let result: ts.IfStatement | null = null;
    ts.forEachChild(node, (child) => {
      if (!result) {
        result = this.findIfStatementAtPosition(child, position);
      }
    });

    return result;
  }

  private isCursorOnConditionalKeyword(node: ts.Node, position: number): boolean {
    if (!ts.isIfStatement(node)) {
      return false;
    }

    const sourceFile = node.getSourceFile();
    const text = sourceFile.text;

    // Check if cursor is on the main "if" keyword
    const ifKeywordStart = node.getStart();
    const ifKeywordEnd = ifKeywordStart + 2; // "if".length

    if (this.isCursorOnKeywordOnly(position, ifKeywordStart, ifKeywordEnd, text)) {
      return true;
    }

    // Check for else/else if keywords in the chain
    return this.isCursorOnElseKeywords(node, position, text);
  }

  private isCursorOnElseKeywords(ifStatement: ts.IfStatement, position: number, sourceText: string): boolean {
    let current: ts.IfStatement = ifStatement;

    while (current.elseStatement) {
      const elseKeywordPos = this.findElseKeywordPosition(current, sourceText);
      if (elseKeywordPos === -1) break;

      const elseKeywordEnd = elseKeywordPos + 4; // "else".length

      // Check if cursor is on "else" keyword
      if (position >= elseKeywordPos && position <= elseKeywordEnd) {
        return true;
      }

      // If else statement is another if statement, check the "if" part of "else if"
      if (ts.isIfStatement(current.elseStatement)) {
        const elseIfStart = current.elseStatement.getStart();
        const elseIfEnd = elseIfStart + 2; // "if".length after "else "

        if (position >= elseIfStart && position <= elseIfEnd) {
          return true;
        }

        current = current.elseStatement;
      } else {
        break;
      }
    }

    return false;
  }

  private getConditionalRangeBasedOnPosition(
    document: vscode.TextDocument,
    ifStatement: ts.IfStatement,
    position: number
  ): vscode.Range | null {
    const sourceText = ifStatement.getSourceFile().text;

    // Case 1: Cursor on main "if" keyword - cut entire if/else if/else chain
    const ifKeywordStart = ifStatement.getStart();
    const ifKeywordEnd = ifKeywordStart + 2; // "if".length

    if (position >= ifKeywordStart && position <= ifKeywordEnd) {
      return this.getEntireIfChainRange(document, ifStatement);
    }

    // Case 2: Cursor on "else if" or "else" - find which one and cut from there
    return this.getElseChainRange(document, ifStatement, position, sourceText);
  }

  private getEntireIfChainRange(document: vscode.TextDocument, ifStatement: ts.IfStatement): vscode.Range {
    // Find the end of the entire if/else chain
    let endNode: ts.Node = ifStatement;
    let current = ifStatement;

    while (current.elseStatement) {
      endNode = current.elseStatement;
      if (ts.isIfStatement(current.elseStatement)) {
        current = current.elseStatement;
      } else {
        break;
      }
    }

    return new vscode.Range(
      document.positionAt(ifStatement.getStart()),
      document.positionAt(endNode.getEnd())
    );
  }

  private getElseChainRange(
    document: vscode.TextDocument,
    ifStatement: ts.IfStatement,
    position: number,
    sourceText: string
  ): vscode.Range | null {
    let current = ifStatement;

    while (current.elseStatement) {
      const elseKeywordPos = this.findElseKeywordPosition(current, sourceText);
      if (elseKeywordPos === -1) break;

      const elseKeywordEnd = elseKeywordPos + 4; // "else".length

      // Check if cursor is on "else" keyword
      if (position >= elseKeywordPos && position <= elseKeywordEnd) {
        // If the else statement is another if statement, this is "else if"
        if (ts.isIfStatement(current.elseStatement)) {
          // Cursor on "else if" - cut from this else if to the end of the chain
          return this.getElseIfChainRange(document, current.elseStatement);
        } else {
          // Cursor on final "else" - cut just the else block
          return new vscode.Range(
            document.positionAt(elseKeywordPos),
            document.positionAt(current.elseStatement.getEnd())
          );
        }
      }

      // Check if cursor is on the "if" part of "else if"
      if (ts.isIfStatement(current.elseStatement)) {
        const elseIfStart = current.elseStatement.getStart();
        const elseIfEnd = elseIfStart + 2; // "if".length

        if (position >= elseIfStart && position <= elseIfEnd) {
          // Cursor on "else if" - cut from this else if to the end
          return this.getElseIfChainRange(document, current.elseStatement);
        }

        current = current.elseStatement;
      } else {
        break;
      }
    }

    return null;
  }

  private getElseIfChainRange(document: vscode.TextDocument, elseIfStatement: ts.IfStatement): vscode.Range {
    // Find the end of the chain starting from this else if
    let endNode: ts.Node = elseIfStatement;
    let current = elseIfStatement;

    while (current.elseStatement) {
      endNode = current.elseStatement;
      if (ts.isIfStatement(current.elseStatement)) {
        current = current.elseStatement;
      } else {
        break;
      }
    }

    // Start from the "else" keyword that precedes this else if
    const parent = elseIfStatement.parent;
    if (ts.isIfStatement(parent)) {
      const sourceText = elseIfStatement.getSourceFile().text;
      const elseKeywordPos = this.findElseKeywordPosition(parent, sourceText);
      if (elseKeywordPos !== -1) {
        return new vscode.Range(
          document.positionAt(elseKeywordPos),
          document.positionAt(endNode.getEnd())
        );
      }
    }

    // Fallback: just the else if statement itself
    return new vscode.Range(
      document.positionAt(elseIfStatement.getStart()),
      document.positionAt(endNode.getEnd())
    );
  }

  // ========================================
  // CLASS MEMBER HANDLING
  // ========================================

  private isAccessModifier(word: string): boolean {
    const accessModifiers = ['private', 'public', 'protected', 'readonly', 'static', 'abstract', 'override'];
    return accessModifiers.includes(word.toLowerCase());
  }

  private getClassMemberRangeFromModifier(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string
  ): vscode.Range | null {
    try {
      const sourceFile = this.createSourceFile(document);
      const offset = document.offsetAt(position);

      // Find the class member that has this modifier
      const classMember = this.findClassMemberWithModifierAtPosition(sourceFile, offset, word);
      if (!classMember) {
        return null;
      }

      return this.getClassMemberNodeRange(document, classMember);
    } catch (error) {
      console.error('Error finding class member from modifier:', error);
      return null;
    }
  }

  private findClassMemberWithModifierAtPosition(
    node: ts.Node,
    position: number,
    modifierWord: string
  ): ts.Node | null {
    // Check if this node is a class member with the modifier at the position
    if (this.isClassMemberNode(node)) {
      const modifierRange = this.findModifierInNode(node, position, modifierWord);
      if (modifierRange) {
        return node;
      }
    }

    // Recursively search children
    let result: ts.Node | null = null;
    ts.forEachChild(node, (child) => {
      if (!result) {
        result = this.findClassMemberWithModifierAtPosition(child, position, modifierWord);
      }
    });

    return result;
  }

  private isClassMemberNode(node: ts.Node): boolean {
    return ts.isMethodDeclaration(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node);
  }

  private findModifierInNode(node: ts.Node, position: number, modifierWord: string): boolean {
    // Get all modifiers for this node
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;

    if (!modifiers) {
      return false;
    }

    // Check each modifier
    for (const modifier of modifiers) {
      const modifierStart = modifier.getStart();
      const modifierEnd = modifier.getEnd();

      // Check if the position is within this modifier and it matches our word
      if (position >= modifierStart && position <= modifierEnd) {
        const modifierText = modifier.getText().trim();
        if (modifierText.toLowerCase() === modifierWord.toLowerCase()) {
          return true;
        }
      }
    }

    return false;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  private isCursorOnKeywordOnly(position: number, keywordStart: number, keywordEnd: number, sourceText: string): boolean {
    // Check if cursor is within the keyword bounds
    if (position < keywordStart || position > keywordEnd) {
      return false;
    }

    // Additional check: make sure we're not inside a string or comment
    const charAtPosition = sourceText[position];
    const charBefore = position > 0 ? sourceText[position - 1] : '';
    const charAfter = position < sourceText.length - 1 ? sourceText[position + 1] : '';

    // Simple heuristic: if surrounded by quotes, we're probably in a string
    if ((charBefore === '"' || charBefore === "'" || charBefore === '`') ||
      (charAfter === '"' || charAfter === "'" || charAfter === '`')) {
      return false;
    }

    return true;
  }

  private findElseKeywordPosition(ifStatement: ts.IfStatement, sourceText: string): number {
    if (!ifStatement.elseStatement) {
      return -1;
    }

    // Find the end of the if statement's then statement
    const thenStatement = ifStatement.thenStatement;
    const thenEnd = thenStatement.getEnd();

    // Look for "else" keyword after the then statement
    const searchStart = thenEnd;
    const searchEnd = ifStatement.elseStatement.getStart();
    const searchText = sourceText.substring(searchStart, searchEnd);

    // Be more precise with the regex to avoid false matches
    const elseMatch = searchText.match(/^\s*else\b/);
    if (elseMatch && elseMatch.index !== undefined) {
      return searchStart + elseMatch.index + elseMatch[0].indexOf('else');
    }

    return -1;
  }

  private findAncestorOfKind(node: ts.Node, kind: ts.SyntaxKind): ts.Node | null {
    let current = node.parent;
    while (current) {
      if (current.kind === kind) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  private nodeToRange(document: vscode.TextDocument, node: ts.Node): vscode.Range {
    const start = document.positionAt(node.getStart());
    const end = document.positionAt(node.getEnd());
    return new vscode.Range(start, end);
  }

  // ========================================
  // HELPER METHODS FOR SCOPE AND MEMBER NAVIGATION
  // ========================================

  /**
   * Find the function node that contains the given position
   */
  private findContainingFunction(node: ts.Node, position: number): ts.Node | null {
    // Check if current node is a function and contains the position
    if (this.isFunctionNode(node) && this.nodeContainsPosition(node, position)) {
      return node;
    }

    // Recursively search children
    for (const child of node.getChildren()) {
      if (this.nodeContainsPosition(child, position)) {
        const result = this.findContainingFunction(child, position);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Find the scope node that contains the given position
   */
  private findContainingScope(node: ts.Node, position: number): ts.Node | null {
    console.log(`Checking node of kind ${ts.SyntaxKind[node.kind]} for position ${position}`);

    // Check if current node is a scope container and contains the position
    if (this.isScopeContainer(node) && this.nodeContainsPosition(node, position)) {
      console.log(`Found potential scope container: ${ts.SyntaxKind[node.kind]}`);

      // Look for a more specific scope in children first
      let bestScope = node;
      for (const child of node.getChildren()) {
        if (this.nodeContainsPosition(child, position)) {
          const childScope = this.findContainingScope(child, position);
          if (childScope) {
            // Prefer object literals and classes over individual methods
            if (this.isPreferredScope(childScope) || !this.isPreferredScope(bestScope)) {
              bestScope = childScope;
            }
          }
        }
      }

      console.log(`Using scope container: ${ts.SyntaxKind[bestScope.kind]}`);
      return bestScope;
    }

    // Recursively search children
    for (const child of node.getChildren()) {
      if (this.nodeContainsPosition(child, position)) {
        const result = this.findContainingScope(child, position);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Check if a scope type is preferred for member navigation
   */
  private isPreferredScope(node: ts.Node): boolean {
    return ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isObjectLiteralExpression(node) ||
      ts.isSourceFile(node) ||
      ts.isModuleDeclaration(node) ||
      // Allow function bodies for local variable navigation
      (ts.isBlock(node) && this.isDirectFunctionBody(node));
  }

  /**
   * Get the range of a function's body content
   */
  private getFunctionBodyRange(document: vscode.TextDocument, functionNode: ts.Node): vscode.Range | null {
    // Find the function body
    let body: ts.Node | undefined;

    if (ts.isFunctionDeclaration(functionNode) || ts.isFunctionExpression(functionNode) || ts.isMethodDeclaration(functionNode)) {
      body = functionNode.body;
    } else if (ts.isArrowFunction(functionNode)) {
      body = functionNode.body;
    }

    if (!body) {
      return null;
    }

    // If it's a block, return the content inside the braces
    if (ts.isBlock(body)) {
      const start = document.positionAt(body.getStart() + 1); // +1 to skip opening brace
      const end = document.positionAt(body.getEnd() - 1); // -1 to skip closing brace
      return new vscode.Range(start, end);
    }

    // For arrow functions with expression bodies
    return this.nodeToRange(document, body);
  }

  /**
   * Extract all members from a scope node
   */
  private extractMembersFromScope(document: vscode.TextDocument, scopeNode: ts.Node): Array<{ range: vscode.Range, text: string, name: string }> {
    const members: Array<{ range: vscode.Range, text: string, name: string }> = [];

    console.log(`Extracting members from ${ts.SyntaxKind[scopeNode.kind]}`);

    const addMember = (node: ts.Node, name: string) => {
      const range = this.nodeToRange(document, node);
      const text = document.getText(range);
      members.push({ range, text, name });
      console.log(`Added member: ${name} at line ${range.start.line}`);
    };

    const visitNode = (node: ts.Node) => {
      console.log(`Visiting node: ${ts.SyntaxKind[node.kind]}`);
      switch (node.kind) {
        case ts.SyntaxKind.PropertyDeclaration:
        case ts.SyntaxKind.MethodDeclaration:
        case ts.SyntaxKind.GetAccessor:
        case ts.SyntaxKind.SetAccessor:
        case ts.SyntaxKind.Constructor:
          if (ts.isClassElement(node) && node.name && ts.isIdentifier(node.name)) {
            addMember(node, node.name.text);
          } else if (ts.isConstructorDeclaration(node)) {
            addMember(node, 'constructor');
          }
          break;

        case ts.SyntaxKind.FunctionDeclaration:
          if (ts.isFunctionDeclaration(node) && node.name) {
            addMember(node, node.name.text);
          }
          break;

        case ts.SyntaxKind.VariableStatement:
          if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach(decl => {
              if (ts.isIdentifier(decl.name)) {
                addMember(node, decl.name.text);
              }
            });
          }
          break;

        case ts.SyntaxKind.VariableDeclaration:
          // Handle individual variable declarations (for function scopes)
          if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            // Find the parent variable statement for the full range
            const parentStatement = node.parent?.parent;
            if (parentStatement && ts.isVariableStatement(parentStatement)) {
              addMember(parentStatement, node.name.text);
            } else {
              addMember(node, node.name.text);
            }
          }
          break;

        case ts.SyntaxKind.FunctionExpression:
        case ts.SyntaxKind.ArrowFunction:
          // Handle function expressions/arrows as members when they're assigned to variables
          if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
            const parentStatement = node.parent.parent?.parent;
            if (parentStatement && ts.isVariableStatement(parentStatement)) {
              addMember(parentStatement, node.parent.name.text);
            }
          }
          break;

        case ts.SyntaxKind.PropertyAssignment:
        case ts.SyntaxKind.ShorthandPropertyAssignment:
          if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
            addMember(node, node.name.text);
          } else if (ts.isShorthandPropertyAssignment(node)) {
            addMember(node, node.name.text);
          }
          break;

        case ts.SyntaxKind.PropertySignature:
          if (ts.isPropertySignature(node) && node.name && ts.isIdentifier(node.name)) {
            addMember(node, node.name.text);
          }
          break;

        case ts.SyntaxKind.MethodSignature:
          if (ts.isMethodSignature(node) && node.name && ts.isIdentifier(node.name)) {
            addMember(node, node.name.text);
          }
          break;
      }
    };

    // Visit direct children of the scope
    if (ts.isClassDeclaration(scopeNode) || ts.isInterfaceDeclaration(scopeNode)) {
      console.log(`Processing class/interface with ${scopeNode.members?.length || 0} members`);
      scopeNode.members?.forEach(visitNode);
    } else if (ts.isObjectLiteralExpression(scopeNode)) {
      console.log(`Processing object literal with ${scopeNode.properties.length} properties`);
      scopeNode.properties.forEach(visitNode);
    } else if (ts.isBlock(scopeNode)) {
      console.log(`Processing block with ${scopeNode.statements.length} statements`);
      // For function blocks, we want to find variable declarations
      const processBlockStatement = (stmt: ts.Node) => {
        if (ts.isVariableStatement(stmt)) {
          visitNode(stmt);
        } else if (ts.isFunctionDeclaration(stmt)) {
          visitNode(stmt);
        } else if (ts.isExpressionStatement(stmt)) {
          // Handle call expressions like watch(), onBeforeMount(), etc.
          if (ts.isCallExpression(stmt.expression)) {
            const callExpr = stmt.expression;
            if (ts.isIdentifier(callExpr.expression)) {
              addMember(stmt, callExpr.expression.text);
            }
          }
        }
      };

      scopeNode.statements.forEach(processBlockStatement);
    } else if (ts.isSourceFile(scopeNode)) {
      console.log(`Processing source file with ${scopeNode.statements.length} statements`);
      scopeNode.statements.forEach(visitNode);
    } else {
      console.log(`Processing other scope type, visiting all children`);
      // For other scope types, visit all direct children
      scopeNode.getChildren().forEach(visitNode);
    }

    console.log(`Total members extracted: ${members.length}`);

    // Sort members by their position in the file
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
   * Check if a node is a function node
   */
  private isFunctionNode(node: ts.Node): boolean {
    return ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node);
  }

  /**
   * Check if a node is a scope container
   */
  private isScopeContainer(node: ts.Node): boolean {
    return ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isObjectLiteralExpression(node) ||
      ts.isSourceFile(node) ||
      ts.isModuleDeclaration(node) ||
      // Include function bodies for local variable navigation
      (ts.isBlock(node) && this.isDirectFunctionBody(node)) ||
      // Include other blocks
      ts.isBlock(node) ||
      // Include functions as fallback scopes
      this.isFunctionNode(node);
  }

  /**
   * Check if a block is directly the body of a function
   */
  private isDirectFunctionBody(node: ts.Node): boolean {
    if (!ts.isBlock(node) || !node.parent) {
      return false;
    }

    return ts.isFunctionDeclaration(node.parent) ||
      ts.isFunctionExpression(node.parent) ||
      ts.isArrowFunction(node.parent) ||
      ts.isMethodDeclaration(node.parent) ||
      ts.isConstructorDeclaration(node.parent);
  }

  /**
   * Check if a node contains a position
   */
  private nodeContainsPosition(node: ts.Node, position: number): boolean {
    return node.getStart() <= position && position < node.getEnd();
  }

  // ========================================
  // BASE CLASS REQUIREMENTS
  // ========================================

  // Required methods from base class (simplified implementations)
  getClassPatterns() { return []; }
  getFunctionPatterns() { return []; }
  getVariablePatterns() { return []; }
  getObjectKeyPatterns() { return []; }
  getClassMemberPatterns() { return []; }
  getMultilineStringPatterns() { return []; }
}
