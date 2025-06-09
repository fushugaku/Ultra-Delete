import * as vscode from 'vscode';
import * as ts from 'typescript';

export interface ExtractedVariable {
  name: string;
  type: string;
  isUsedAfterSelection: boolean;
  isModified: boolean;
  declaration: ts.Node;
}

export interface ExtractionResult {
  functionName: string;
  parameters: ExtractedVariable[];
  returnType: string;
  functionCode: string;
  functionCall: string;
  insertionPoint: vscode.Position;
  isClassMethod: boolean;
}

export class TypeScriptExtractionService {

  /**
   * Extract selected code to a new function
   */
  async extractSelectionToFunction(
    document: vscode.TextDocument,
    selection: vscode.Selection
  ): Promise<ExtractionResult | null> {
    try {
      const sourceFile = this.createSourceFile(document);
      const selectedText = document.getText(selection);

      if (!selectedText.trim()) {
        throw new Error('No code selected for extraction');
      }

      const startOffset = document.offsetAt(selection.start);
      const endOffset = document.offsetAt(selection.end);

      // Analyze the selection and surrounding context
      const analysisResult = this.analyzeSelection(sourceFile, startOffset, endOffset, selectedText);

      if (!analysisResult) {
        throw new Error('Could not analyze the selected code');
      }

      // Generate the extracted function
      const functionName = await this.promptForFunctionName() || 'extractedFunction';
      const extractionResult = this.generateExtractedFunction(
        analysisResult,
        selectedText,
        functionName,
        document,
        selection
      );

      return extractionResult;
    } catch (error) {
      console.error('Error extracting selection to function:', error);
      throw error;
    }
  }

  /**
 * Apply the extraction by replacing code and inserting the new function
 */
  async applyExtraction(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    extraction: ExtractionResult
  ): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return false;
    }

    return await editor.edit(editBuilder => {
      // Replace selected code with function call
      editBuilder.replace(selection, extraction.functionCall);

      // Insert the new function/method
      const insertLine = extraction.insertionPoint.line;

      if (extraction.isClassMethod) {
        // Insert method inside class with proper indentation
        const insertText = `\n  ${extraction.functionCode}\n`;
        editBuilder.insert(new vscode.Position(insertLine, 0), insertText);
      } else {
        // Insert standalone function
        const insertText = `\n${extraction.functionCode}\n`;
        editBuilder.insert(new vscode.Position(insertLine, 0), insertText);
      }
    });
  }

  /**
   * Analyze the selected code and determine variable dependencies
   */
  private analyzeSelection(
    sourceFile: ts.SourceFile,
    startOffset: number,
    endOffset: number,
    selectedText: string
  ): {
    variables: ExtractedVariable[];
    containingScope: ts.Node;
    statements: ts.Statement[];
  } | null {

    const containingScope = this.findContainingScope(sourceFile, startOffset);
    if (!containingScope) {
      return null;
    }

    // Parse the selected text as statements
    const selectedStatements = this.parseSelectedStatements(selectedText, sourceFile);

    // Find all variable references in the selection
    const referencedVariables = this.findReferencedVariables(selectedStatements, sourceFile);

    // Analyze which variables need to be parameters
    const variableAnalysis = this.analyzeVariableDependencies(
      referencedVariables,
      containingScope,
      startOffset,
      endOffset,
      sourceFile
    );

    return {
      variables: variableAnalysis,
      containingScope,
      statements: selectedStatements
    };
  }

  /**
   * Find all variables referenced in the selected code
   */
  private findReferencedVariables(statements: ts.Statement[], sourceFile: ts.SourceFile): string[] {
    const variables = new Set<string>();

    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node)) {
        // Exclude property names in property access expressions
        const parent = node.parent;
        if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
          return; // Skip property names like 'nodeSize' in 'childNode.nodeSize'
        }

        // Exclude parameter names in function declarations
        if (ts.isParameter(parent) && parent.name === node) {
          return; // Skip parameter declarations
        }

        variables.add(node.text);
      }
      ts.forEachChild(node, visit);
    };

    statements.forEach(statement => visit(statement));
    return Array.from(variables).filter(name =>
      // Filter out common keywords and built-in types
      !['true', 'false', 'null', 'undefined', 'super', 'Node', 'number', 'string', 'boolean'].includes(name)
    );
  }

  /**
   * Analyze variable dependencies to determine parameters and return values
   */
  private analyzeVariableDependencies(
    referencedVariables: string[],
    containingScope: ts.Node,
    selectionStart: number,
    selectionEnd: number,
    sourceFile: ts.SourceFile
  ): ExtractedVariable[] {
    const dependencies: ExtractedVariable[] = [];

    for (const varName of referencedVariables) {
      // Skip 'this' as it shouldn't be a parameter in class methods
      if (varName === 'this') {
        continue;
      }

      const declaration = this.findVariableDeclaration(varName, containingScope, selectionStart);

      if (declaration && this.isOutOfScope(declaration, selectionStart, selectionEnd)) {
        const isModified = this.isVariableModified(varName, selectionStart, selectionEnd, sourceFile);
        const isUsedAfter = this.isVariableUsedAfterSelection(varName, containingScope, selectionEnd);
        const type = this.inferVariableType(declaration, sourceFile);

        dependencies.push({
          name: varName,
          type,
          isUsedAfterSelection: isUsedAfter,
          isModified,
          declaration
        });
      }
    }

    return dependencies;
  }

  /**
   * Generate the extracted function code and call
   */
  private generateExtractedFunction(
    analysis: {
      variables: ExtractedVariable[];
      containingScope: ts.Node;
      statements: ts.Statement[];
    },
    selectedText: string,
    functionName: string,
    document: vscode.TextDocument,
    selection: vscode.Selection
  ): ExtractionResult {

    // Check if we're inside a class
    const containingClass = this.findContainingClass(analysis.containingScope);
    const isClassMethod = containingClass !== null;

    // All variables used in the selection (that are declared outside) should be parameters
    const parameters = analysis.variables;

    // Determine which variables should be returned
    // Only return variables if:
    // 1. The selected code explicitly returns something, OR
    // 2. The selection includes the end of the function (where variables would be returned)
    const selectionIncludesEnd = this.selectionIncludesFunctionEnd(document, selection, analysis.containingScope);
    const returnVariables = selectionIncludesEnd
      ? analysis.variables.filter(v => v.isModified && v.isUsedAfterSelection)
      : [];

    // Generate parameter list
    const paramList = parameters.map(p => `${p.name}: ${p.type}`).join(', ');

    // Analyze return statements in the selected code
    const returnStatementAnalysis = this.analyzeReturnStatements(analysis.statements, document);

    // Generate return type
    let returnType = 'void';
    let returnStatement = '';

    // Handle explicit return statements
    if (returnStatementAnalysis.hasReturns) {
      if (returnVariables.length > 0) {
        // Both explicit returns and variable returns - explicit returns determine the type
        const explicitTypes = returnStatementAnalysis.returnTypes;
        const hasUnconditionalReturn = this.hasUnconditionalReturn(analysis.statements);

        if (hasUnconditionalReturn) {
          // Function always returns explicitly
          returnType = explicitTypes.length > 1
            ? explicitTypes.join(' | ')
            : explicitTypes[0] || 'void';
        } else {
          // Function can end without explicit return, so add void to union
          const uniqueTypes = new Set([...explicitTypes, 'void']);
          returnType = uniqueTypes.size > 1 ? Array.from(uniqueTypes).join(' | ') : Array.from(uniqueTypes)[0];
        }

        // Add variable return at the end
        if (returnVariables.length === 1) {
          returnStatement = `\n  return ${returnVariables[0].name};`;
        } else {
          const returnValues = returnVariables.map(v => v.name).join(', ');
          returnStatement = `\n  return { ${returnValues} };`;
        }
      } else {
        // Only explicit returns - need to check if the function can also implicitly return void
        const explicitTypes = returnStatementAnalysis.returnTypes;
        const hasUnconditionalReturn = this.hasUnconditionalReturn(analysis.statements);

        if (hasUnconditionalReturn) {
          // Function always returns explicitly
          returnType = explicitTypes.length > 1
            ? explicitTypes.join(' | ')
            : explicitTypes[0] || 'void';
        } else {
          // Function can end without explicit return, so add void to union
          const uniqueTypes = new Set([...explicitTypes, 'void']);
          returnType = uniqueTypes.size > 1 ? Array.from(uniqueTypes).join(' | ') : Array.from(uniqueTypes)[0];
        }
      }
    } else if (returnVariables.length > 0) {
      // Only variable returns (existing logic)
      if (returnVariables.length === 1) {
        returnType = returnVariables[0].type;
        returnStatement = `\n  return ${returnVariables[0].name};`;
      } else {
        const returnTypeMembers = returnVariables.map(v => `${v.name}: ${v.type}`).join(', ');
        returnType = `{ ${returnTypeMembers} }`;
        const returnValues = returnVariables.map(v => v.name).join(', ');
        returnStatement = `\n  return { ${returnValues} };`;
      }
    }

    // Generate function code based on context
    const indentedSelectedText = this.indentCode(selectedText, isClassMethod ? 4 : 2);
    let functionCode: string;

    if (isClassMethod) {
      // Generate class method
      const methodVisibility = this.shouldBePrivateMethod(analysis.containingScope) ? 'private ' : '';
      functionCode = `${methodVisibility}${functionName}(${paramList}): ${returnType} {
${indentedSelectedText}${returnStatement}
  }`;
    } else {
      // Generate standalone function
      functionCode = `function ${functionName}(${paramList}): ${returnType} {
${indentedSelectedText}${returnStatement}
}`;
    }

    // Generate function call
    const callParams = parameters.map(p => p.name).join(', ');
    let functionCall = isClassMethod ? `this.${functionName}(${callParams})` : `${functionName}(${callParams})`;

    if (returnVariables.length === 1) {
      functionCall = `${returnVariables[0].name} = ${functionCall}`;
    } else if (returnVariables.length > 1) {
      const destructure = returnVariables.map(v => v.name).join(', ');
      functionCall = `const { ${destructure} } = ${functionCall}`;
    }

    // Find insertion point
    const insertionPoint = isClassMethod
      ? this.findClassMethodInsertionPoint(document, selection, containingClass!)
      : this.findInsertionPoint(document, selection, analysis.containingScope);

    return {
      functionName,
      parameters,
      returnType,
      functionCode,
      functionCall,
      insertionPoint,
      isClassMethod
    };
  }

  /**
   * Find where to insert the new function
   */
  private findInsertionPoint(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    containingScope: ts.Node
  ): vscode.Position {
    // Insert before the containing function/class
    const scopeStart = document.positionAt(containingScope.getStart());
    return new vscode.Position(Math.max(0, scopeStart.line - 1), 0);
  }

  /**
   * Check if a variable declaration is outside the selection
   */
  private isOutOfScope(declaration: ts.Node, selectionStart: number, selectionEnd: number): boolean {
    const declStart = declaration.getStart();
    const declEnd = declaration.getEnd();
    return declEnd < selectionStart || declStart > selectionEnd;
  }

  /**
   * Check if a variable is modified within the selection
   */
  private isVariableModified(
    varName: string,
    selectionStart: number,
    selectionEnd: number,
    sourceFile: ts.SourceFile
  ): boolean {
    // Check for various assignment patterns
    const sourceText = sourceFile.text.substring(selectionStart, selectionEnd);

    // Direct assignment: node = value
    const directAssignment = new RegExp(`\\b${this.escapeRegex(varName)}\\s*=(?!=)`, 'g');
    if (directAssignment.test(sourceText)) {
      return true;
    }

    // Compound assignments: node += value, node -= value, etc.
    const compoundAssignment = new RegExp(`\\b${this.escapeRegex(varName)}\\s*[+\\-*/]?=`, 'g');
    if (compoundAssignment.test(sourceText)) {
      return true;
    }

    // Increment/decrement: node++, ++node, node--, --node
    const incrementDecrement = new RegExp(`(\\+\\+|\\-\\-)\\s*\\b${this.escapeRegex(varName)}\\b|\\b${this.escapeRegex(varName)}\\b\\s*(\\+\\+|\\-\\-)`, 'g');
    if (incrementDecrement.test(sourceText)) {
      return true;
    }

    return false;
  }

  /**
   * Check if a variable is used after the selection
   */
  private isVariableUsedAfterSelection(
    varName: string,
    containingScope: ts.Node,
    selectionEnd: number
  ): boolean {
    const scopeEnd = containingScope.getEnd();
    const textAfterSelection = containingScope.getSourceFile().text.substring(selectionEnd, scopeEnd);
    return new RegExp(`\\b${this.escapeRegex(varName)}\\b`).test(textAfterSelection);
  }

  /**
 * Find variable declaration in scope
 */
  private findVariableDeclaration(
    varName: string,
    scope: ts.Node,
    beforeOffset: number
  ): ts.Node | null {
    let declaration: ts.Node | null = null;

    const visit = (node: ts.Node) => {
      if (node.getStart() >= beforeOffset) {
        return; // Don't look at declarations after the selection
      }

      // Variable declarations
      if (ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === varName) {
        declaration = node;
      }
      // Function parameters
      else if (ts.isParameter(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === varName) {
        declaration = node;
      }
      // Class properties
      else if (ts.isPropertyDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === varName) {
        declaration = node;
      }
      // Property signatures (interfaces)
      else if (ts.isPropertySignature(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === varName) {
        declaration = node;
      }

      if (!declaration) {
        ts.forEachChild(node, visit);
      }
    };

    // Start from the source file to find all possible declarations
    const sourceFile = scope.getSourceFile();
    visit(sourceFile);

    // If not found in global scope, look specifically in the containing class
    if (!declaration) {
      const containingClass = this.findContainingClass(scope);
      if (containingClass) {
        visit(containingClass);
      }
    }

    return declaration;
  }

  /**
 * Infer the type of a variable from its declaration using TypeScript's type checker
 */
  private inferVariableType(declaration: ts.Node, sourceFile: ts.SourceFile): string {
    // For variable declarations, try to infer from the initializer first with type checker
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      const typeChecker = this.createTypeChecker(sourceFile);
      if (typeChecker) {
        try {
          // Try to get the type of the initializer expression directly
          const type = typeChecker.getTypeAtLocation(declaration.initializer);
          if (type) {
            const typeString = typeChecker.typeToString(type, declaration.initializer,
              ts.TypeFormatFlags.InTypeAlias | ts.TypeFormatFlags.WriteArrayAsGenericType
            );
            if (typeString && typeString !== 'any' && !typeString.includes('typeof')) {
              const cleanedType = this.cleanupTypeString(typeString);
              if (cleanedType === 'true' || cleanedType === 'false') {
                return 'boolean';
              }
              return cleanedType;
            }
          }
        } catch (error) {
          console.error('Error getting initializer type:', error);
        }
      }
    }

    // Try to use TypeScript's type checker for accurate type information
    const typeChecker = this.createTypeChecker(sourceFile);
    if (typeChecker) {
      try {
        const symbol = typeChecker.getSymbolAtLocation(declaration);
        if (symbol) {
          const type = typeChecker.getTypeOfSymbolAtLocation(symbol, declaration);
          if (type) {
            // Get the type string with full type information
            const typeString = typeChecker.typeToString(type, declaration,
              ts.TypeFormatFlags.InTypeAlias |
              ts.TypeFormatFlags.WriteArrayAsGenericType |
              ts.TypeFormatFlags.UseFullyQualifiedType
            );

            if (typeString && typeString !== 'any' && !typeString.includes('typeof')) {
              return this.cleanupTypeString(typeString);
            }
          }
        }

        // For variable declarations and parameters, try to get type from the node itself
        if (ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) {
          if (ts.isIdentifier(declaration.name)) {
            const type = typeChecker.getTypeAtLocation(declaration.name);
            if (type) {
              const typeString = typeChecker.typeToString(type, declaration,
                ts.TypeFormatFlags.InTypeAlias |
                ts.TypeFormatFlags.WriteArrayAsGenericType
              );

              if (typeString && typeString !== 'any' && !typeString.includes('typeof')) {
                return this.cleanupTypeString(typeString);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error using type checker:', error);
      }
    }

    // Fallback to manual type extraction for explicit type annotations
    if (ts.isVariableDeclaration(declaration)) {
      if (declaration.type) {
        return declaration.type.getText(sourceFile);
      }

      // Try to infer from initializer
      if (declaration.initializer) {
        return this.inferTypeFromInitializer(declaration.initializer, sourceFile);
      }
    }

    if (ts.isParameter(declaration)) {
      if (declaration.type) {
        return declaration.type.getText(sourceFile);
      }

      if (declaration.initializer) {
        return this.inferTypeFromInitializer(declaration.initializer, sourceFile);
      }
    }

    // Handle property declarations
    if (ts.isPropertyDeclaration(declaration)) {
      if (declaration.type) {
        return declaration.type.getText(sourceFile);
      }

      if (declaration.initializer) {
        return this.inferTypeFromInitializer(declaration.initializer, sourceFile);
      }
    }

    // Handle property signatures (in interfaces)
    if (ts.isPropertySignature(declaration)) {
      if (declaration.type) {
        return declaration.type.getText(sourceFile);
      }
    }

    // Last resort: try to infer from usage patterns in the containing scope
    if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
      const varName = declaration.name.text;
      const scopeText = declaration.parent?.parent?.getText(sourceFile) || '';

      // Look for method calls that give hints about the type
      if (scopeText.includes(`${varName}.nodeAt`) || scopeText.includes(`${varName}.descendants`)) {
        return 'Document'; // ProseMirror document type
      }
      if (scopeText.includes(`${varName}.nodeSize`) || scopeText.includes(`${varName}.type`)) {
        return 'Node';
      }
    }

    return 'any';
  }

  /**
 * Clean up type strings from the type checker
 */
  private cleanupTypeString(typeString: string): string {
    // Remove import() types and module references
    let cleaned = typeString.replace(/import\(".*?"\)\./g, '');

    // Simplify some common complex types
    cleaned = cleaned.replace(/\bNodeListOf<(\w+)>/g, 'NodeList<$1>');
    cleaned = cleaned.replace(/\bHTMLElementTagNameMap\["\w+"\]/g, 'HTMLElement');

    // Remove excessive whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Analyze return statements in the selected code
   */
  private analyzeReturnStatements(
    statements: ts.Statement[],
    document: vscode.TextDocument
  ): { hasReturns: boolean; returnTypes: string[] } {
    const returnTypes = new Set<string>();
    let hasReturns = false;

    const visitNode = (node: ts.Node) => {
      if (ts.isReturnStatement(node)) {
        hasReturns = true;

        if (node.expression) {
          // Try to infer the type of the return expression
          const returnType = this.inferReturnExpressionType(node.expression, document);
          returnTypes.add(returnType);
        } else {
          // Empty return statement
          returnTypes.add('void');
        }
      }

      // Continue visiting child nodes
      ts.forEachChild(node, visitNode);
    };

    statements.forEach(statement => visitNode(statement));

    return {
      hasReturns,
      returnTypes: Array.from(returnTypes)
    };
  }

  /**
   * Check if the statements contain an unconditional return (always returns)
   */
  private hasUnconditionalReturn(statements: ts.Statement[]): boolean {
    for (const stmt of statements) {
      if (ts.isReturnStatement(stmt)) {
        return true; // Direct return statement
      }

      if (ts.isIfStatement(stmt)) {
        // Check if if/else both have unconditional returns
        const ifHasReturn = stmt.thenStatement ? this.statementHasUnconditionalReturn(stmt.thenStatement) : false;
        const elseHasReturn = stmt.elseStatement ? this.statementHasUnconditionalReturn(stmt.elseStatement) : false;
        if (ifHasReturn && elseHasReturn) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if a single statement has an unconditional return
   */
  private statementHasUnconditionalReturn(statement: ts.Statement): boolean {
    if (ts.isReturnStatement(statement)) {
      return true;
    }

    if (ts.isBlock(statement)) {
      return this.hasUnconditionalReturn(Array.from(statement.statements));
    }

    if (ts.isIfStatement(statement)) {
      const ifHasReturn = statement.thenStatement ? this.statementHasUnconditionalReturn(statement.thenStatement) : false;
      const elseHasReturn = statement.elseStatement ? this.statementHasUnconditionalReturn(statement.elseStatement) : false;
      return ifHasReturn && elseHasReturn;
    }

    return false;
  }

  /**
   * Infer the type of a return expression
   */
  private inferReturnExpressionType(expression: ts.Expression, document: vscode.TextDocument): string {
    // Create a source file for the document to use with type checking
    const sourceFile = this.createSourceFile(document);

    // Try to use type checker first
    const typeChecker = this.createTypeChecker(sourceFile);
    if (typeChecker) {
      try {
        const type = typeChecker.getTypeAtLocation(expression);
        if (type) {
          const typeString = typeChecker.typeToString(type, expression,
            ts.TypeFormatFlags.InTypeAlias | ts.TypeFormatFlags.WriteArrayAsGenericType
          );

          if (typeString && typeString !== 'any' && !typeString.includes('typeof')) {
            const cleanedType = this.cleanupTypeString(typeString);
            // Convert literal boolean types to general boolean
            if (cleanedType === 'true' || cleanedType === 'false') {
              return 'boolean';
            }
            return cleanedType;
          }
        }
      } catch (error) {
        console.error('Error getting return expression type:', error);
      }
    }

    // Fallback to simple inference
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return 'string';
    }

    if (ts.isNumericLiteral(expression)) {
      return 'number';
    }

    if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
      return 'boolean';
    }

    if (expression.kind === ts.SyntaxKind.NullKeyword) {
      return 'null';
    }

    if (expression.kind === ts.SyntaxKind.UndefinedKeyword) {
      return 'undefined';
    }

    // For simple identifiers, try to get their text
    if (ts.isIdentifier(expression)) {
      const text = expression.text;
      // Common boolean values
      if (text === 'true' || text === 'false') {
        return 'boolean';
      }
    }

    // Check the expression text for common patterns
    const expressionText = expression.getText(sourceFile);
    if (expressionText === 'false' || expressionText === 'true') {
      return 'boolean';
    }

    return 'any';
  }

  /**
   * Infer type from variable initializer
   */
  private inferTypeFromInitializer(initializer: ts.Expression, sourceFile: ts.SourceFile): string {
    if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
      return 'string';
    }
    if (ts.isNumericLiteral(initializer)) {
      return 'number';
    }
    if (initializer.kind === ts.SyntaxKind.TrueKeyword || initializer.kind === ts.SyntaxKind.FalseKeyword) {
      return 'boolean';
    }
    if (initializer.kind === ts.SyntaxKind.NullKeyword) {
      return 'null';
    }
    if (initializer.kind === ts.SyntaxKind.UndefinedKeyword) {
      return 'undefined';
    }
    if (ts.isArrayLiteralExpression(initializer)) {
      // Try to infer array element type
      if (initializer.elements.length > 0) {
        const firstElement = initializer.elements[0];
        if (firstElement && !ts.isSpreadElement(firstElement)) {
          const elementType = this.inferTypeFromInitializer(firstElement, sourceFile);
          return `${elementType}[]`;
        }
      }
      return 'any[]';
    }
    if (ts.isObjectLiteralExpression(initializer)) {
      // For object literals, try to create a type from properties
      const properties: string[] = [];
      for (const prop of initializer.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const propType = this.inferTypeFromInitializer(prop.initializer, sourceFile);
          properties.push(`${prop.name.text}: ${propType}`);
        }
      }
      if (properties.length > 0) {
        return `{ ${properties.join(', ')} }`;
      }
      return 'object';
    }
    if (ts.isCallExpression(initializer)) {
      // Try TypeScript type checker first for call expressions
      const typeChecker = this.createTypeChecker(sourceFile);
      if (typeChecker) {
        try {
          const type = typeChecker.getTypeAtLocation(initializer);
          if (type) {
            const typeString = typeChecker.typeToString(type, initializer,
              ts.TypeFormatFlags.InTypeAlias | ts.TypeFormatFlags.WriteArrayAsGenericType
            );
            if (typeString && typeString !== 'any' && !typeString.includes('typeof')) {
              const cleanedType = this.cleanupTypeString(typeString);
              // Convert literal boolean types to general boolean
              if (cleanedType === 'true' || cleanedType === 'false') {
                return 'boolean';
              }
              return cleanedType;
            }
          }
        } catch (error) {
          console.error('Error getting call expression type:', error);
        }
      }

      // Fallback to common patterns
      const text = initializer.getText(sourceFile);
      if (text.includes('nodeAt')) {
        return 'Node | null';
      }
      if (text.includes('.descendants(')) {
        return 'void';
      }
      // Common ProseMirror patterns
      if (text.includes('.node') || text.includes('.firstChild') || text.includes('.lastChild')) {
        return 'Node | null';
      }
      if (text.includes('getElementById') || text.includes('querySelector')) {
        return 'HTMLElement | null';
      }
      if (text.includes('querySelectorAll')) {
        return 'NodeList';
      }
      if (text.includes('fetch(')) {
        return 'Promise<Response>';
      }
      if (text.includes('JSON.parse')) {
        return 'any';
      }
      if (text.includes('Array.from') || text.includes('split(')) {
        return 'any[]';
      }
    }
    if (ts.isNewExpression(initializer)) {
      // For new expressions, get the constructor name
      const text = initializer.expression.getText(sourceFile);
      return text;
    }
    return 'any';
  }

  /**
   * Parse selected text as TypeScript statements
   */
  private parseSelectedStatements(selectedText: string, originalFile: ts.SourceFile): ts.Statement[] {
    try {
      // First try parsing as statements directly
      const wrappedCode = `function temp() {\n${selectedText}\n}`;
      const tempFile = ts.createSourceFile(
        'temp.ts',
        wrappedCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );

      const functionDecl = tempFile.statements[0] as ts.FunctionDeclaration;
      if (functionDecl.body && functionDecl.body.statements.length > 0) {
        return Array.from(functionDecl.body.statements);
      }

      // If that fails, try parsing as a single expression
      const expressionCode = `function temp() { return (${selectedText}); }`;
      const expressionFile = ts.createSourceFile(
        'temp.ts',
        expressionCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );

      const expressionDecl = expressionFile.statements[0] as ts.FunctionDeclaration;
      if (expressionDecl.body) {
        return Array.from(expressionDecl.body.statements);
      }
    } catch (error) {
      console.error('Error parsing selected statements:', error);
    }
    return [];
  }

  /**
   * Find the containing scope for the selection
   */
  private findContainingScope(node: ts.Node, position: number): ts.Node | null {
    if (this.isScopeContainer(node) && this.nodeContainsPosition(node, position)) {
      // Look for a more specific scope in children
      for (const child of node.getChildren()) {
        if (this.nodeContainsPosition(child, position)) {
          const childScope = this.findContainingScope(child, position);
          if (childScope) {
            return childScope;
          }
        }
      }
      return node;
    }

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
   * Check if node is a scope container
   */
  private isScopeContainer(node: ts.Node): boolean {
    return ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isSourceFile(node);
  }

  /**
   * Check if node contains position
   */
  private nodeContainsPosition(node: ts.Node, position: number): boolean {
    return node.getStart() <= position && position <= node.getEnd();
  }

  /**
 * Check if the selection includes the end of the function/scope
 * This is true if there are no significant statements after the selection
 */
  private selectionIncludesFunctionEnd(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    containingScope: ts.Node
  ): boolean {
    const selectionEnd = document.offsetAt(selection.end);

    // Check if there are any statements after the selection in the same scope
    if (ts.isFunctionDeclaration(containingScope) || ts.isMethodDeclaration(containingScope)) {
      if (containingScope.body) {
        const statements = containingScope.body.statements;
        for (const stmt of statements) {
          if (stmt.getStart() >= selectionEnd) {
            // There's a statement after the selection, so selection doesn't include end
            return false;
          }
        }
        return true; // No statements after selection
      }
    }

    return false;
  }

  /**
   * Indent code by specified number of spaces
   */
  private indentCode(code: string, spaces: number): string {
    const indent = ' '.repeat(spaces);
    return code.split('\n').map(line => line.trim() ? indent + line : line).join('\n');
  }

  /**
   * Escape string for regex
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Prompt user for function name
   */
  private async promptForFunctionName(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
      prompt: 'Enter function name',
      value: 'extractedFunction',
      validateInput: (value: string) => {
        if (!value.trim()) {
          return 'Function name cannot be empty';
        }
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
          return 'Invalid function name';
        }
        return null;
      }
    });
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

  /**
   * Create TypeScript program and type checker for advanced type analysis
   */
  private createTypeChecker(sourceFile: ts.SourceFile): ts.TypeChecker | null {
    try {
      const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.CommonJS,
        strict: false,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        lib: ['ES2020', 'DOM']
      };

      const program = ts.createProgram([sourceFile.fileName], compilerOptions, {
        getSourceFile: (fileName) => fileName === sourceFile.fileName ? sourceFile : undefined,
        writeFile: () => { },
        getCurrentDirectory: () => '',
        getDirectories: () => [],
        fileExists: () => true,
        readFile: () => '',
        getCanonicalFileName: (fileName) => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        getDefaultLibFileName: () => 'lib.d.ts'
      });

      return program.getTypeChecker();
    } catch (error) {
      console.error('Failed to create type checker:', error);
      return null;
    }
  }

  /**
   * Find the containing class for a given scope
   */
  private findContainingClass(scope: ts.Node): ts.ClassDeclaration | null {
    let current: ts.Node | undefined = scope;

    while (current) {
      if (ts.isClassDeclaration(current)) {
        return current;
      }
      current = current.parent;
    }

    return null;
  }

  /**
   * Determine if the extracted method should be private
   */
  private shouldBePrivateMethod(containingScope: ts.Node): boolean {
    // If the containing scope is a private method, make the extracted method private too
    if (ts.isMethodDeclaration(containingScope)) {
      const modifiers = ts.canHaveModifiers(containingScope) ? ts.getModifiers(containingScope) : undefined;
      if (modifiers) {
        return modifiers.some(mod => mod.kind === ts.SyntaxKind.PrivateKeyword);
      }
    }
    // Default to private for better encapsulation
    return true;
  }

  /**
   * Find where to insert the new class method
   */
  private findClassMethodInsertionPoint(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    containingClass: ts.ClassDeclaration
  ): vscode.Position {
    // Find the end of the current method and insert after it
    const containingMethod = this.findContainingMethod(selection, containingClass, document);

    if (containingMethod) {
      const methodEnd = document.positionAt(containingMethod.getEnd());
      return new vscode.Position(methodEnd.line + 1, 0);
    }

    // Fallback: insert before the class closing brace
    const classEnd = document.positionAt(containingClass.getEnd());
    return new vscode.Position(Math.max(0, classEnd.line - 1), 0);
  }

  /**
   * Find the method containing the selection
   */
  private findContainingMethod(
    selection: vscode.Selection,
    containingClass: ts.ClassDeclaration,
    document: vscode.TextDocument
  ): ts.MethodDeclaration | ts.ConstructorDeclaration | null {
    const selectionOffset = document.offsetAt(selection.start);

    const visit = (node: ts.Node): ts.MethodDeclaration | ts.ConstructorDeclaration | null => {
      if ((ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) &&
        node.getStart() <= selectionOffset && selectionOffset <= node.getEnd()) {
        return node;
      }

      for (const child of node.getChildren()) {
        const result = visit(child);
        if (result) {
          return result;
        }
      }

      return null;
    };

    return visit(containingClass);
  }
} 