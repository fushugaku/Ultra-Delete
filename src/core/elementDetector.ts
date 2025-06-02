// elementDetector.ts
import * as vscode from 'vscode';
import { LanguageHandler } from '../languages/base/baseLanguage';
import { JavaScriptHandler } from '../languages/javascript';
import { TypeScriptHandler } from '../languages/typescript';
import { HtmlHandler } from '../languages/html';
import { JsonHandler } from '../languages/json';
import { PythonHandler } from '../languages/python';
import { JavaHandler } from '../languages/java';
import { CSharpHandler } from '../languages/csharp';
import { CppHandler } from '../languages/cpp';
import { GoHandler } from '../languages/go';
import { RustHandler } from '../languages/rust';

export class ElementDetector {
  private handlers: Map<string, LanguageHandler> = new Map();

  constructor() {
    this.initializeHandlers();
  }

  getElementRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    languageId: string
  ): vscode.Range | null {
    const wordRange = document.getWordRangeAtPosition(position);
    const word = wordRange ? document.getText(wordRange) : '';


    const handler = this.handlers.get(languageId);
    if (!handler) {
      return null;
    }


    // Special handling for JSON
    if (languageId === 'json' || languageId === 'jsonc') {
      const jsonHandler = handler as JsonHandler;
      return jsonHandler.getJsonPropertyRange(document, position, word);
    }

    // For TypeScript, TSX, JavaScript, and JSX files - all use the TypeScript handler
    if (['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {

      // Verify this is actually a TypeScript handler
      if (handler.constructor.name !== 'TypeScriptHandler') {
        console.error(`Expected TypeScriptHandler but got ${handler.constructor.name} for language ${languageId}`);
      }

      return this.getTypescriptElementRange(document, position, word, handler as TypeScriptHandler, languageId);
    }

    return this.getStandardElementRange(document, position, word, handler, languageId);
  }

  // In elementDetector.ts - update the getTypescriptElementRange method:

  private getTypescriptElementRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string,
    handler: TypeScriptHandler,
    languageId: string
  ): vscode.Range | null {

    // For TSX/JSX files, check JSX elements FIRST
    if (['tsx', 'typescriptreact', 'jsx', 'javascriptreact'].includes(languageId)) {
      const jsxRange = handler.getJsxElementRange!(document, position, word);
      if (jsxRange) {
        return jsxRange;
      }
    }

    // Check for conditional blocks (if/else keywords)
    if (['if', 'else'].includes(word) && handler.getConditionalBlockRange) {
      const conditionalRange = handler.getConditionalBlockRange(document, position, word);
      if (conditionalRange) {
        return conditionalRange;
      }
    }

    // Check for object keys/properties EARLY - before function calls
    // This ensures nested object properties are detected before the containing object
    const objectKeyRange = handler.getObjectKeyRange(document, position, word);
    if (objectKeyRange) {
      return objectKeyRange;
    }

    // PRIORITIZE FUNCTION CALLS - check functions BEFORE class members
    // This will catch function calls like onMounted(), watch(), etc.
    const functionRange = handler.getFunctionRange(document, position, word);
    if (functionRange) {
      return functionRange;
    }

    // Check for variables
    const variableRange = handler.getVariableRange(document, position, word);
    if (variableRange) {
      return variableRange;
    }

    // Check for class members AFTER function calls
    // This prevents method declarations from overriding function calls inside them
    const classMemberRange = handler.getClassMemberRange(document, position, word);
    if (classMemberRange) {
      return classMemberRange;
    }

    // Check for multiline strings
    const multilineStringRange = handler.getMultilineStringRange(document, position, word);
    if (multilineStringRange) {
      return multilineStringRange;
    }

    // Check for classes
    const classRange = handler.getClassRange(document, position, word);
    if (classRange) {
      return classRange;
    }

    return null;
  }

  private initializeHandlers() {

    // HTML Handler FIRST (so it doesn't overwrite TypeScript handler)
    const htmlHandler = new HtmlHandler();
    htmlHandler.languageIds.forEach(id => {
      this.handlers.set(id, htmlHandler);
    });

    // JSON Handler
    const jsonHandler = new JsonHandler();
    jsonHandler.languageIds.forEach(id => this.handlers.set(id, jsonHandler));

    // Python Handler
    const pythonHandler = new PythonHandler();
    pythonHandler.languageIds.forEach(id => this.handlers.set(id, pythonHandler));

    // Java Handler
    const javaHandler = new JavaHandler();
    javaHandler.languageIds.forEach(id => this.handlers.set(id, javaHandler));

    // C# Handler
    const csharpHandler = new CSharpHandler();
    csharpHandler.languageIds.forEach(id => this.handlers.set(id, csharpHandler));

    // C/C++ Handler
    const cppHandler = new CppHandler();
    cppHandler.languageIds.forEach(id => this.handlers.set(id, cppHandler));

    // Go Handler
    const goHandler = new GoHandler();
    goHandler.languageIds.forEach(id => this.handlers.set(id, goHandler));

    // Rust Handler
    const rustHandler = new RustHandler();
    rustHandler.languageIds.forEach(id => this.handlers.set(id, rustHandler));

    // TypeScript Handler LAST (so it overwrites any conflicts)
    const tsHandler = new TypeScriptHandler();

    ['javascript', 'jsx', 'javascriptreact', 'typescript', 'tsx', 'typescriptreact'].forEach(id => {
      this.handlers.set(id, tsHandler);

      // Verify it was set correctly
      const retrievedHandler = this.handlers.get(id);
    });

    Array.from(this.handlers.entries()).forEach(([key, value]) => {
    });
  }

  private getStandardElementRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string,
    handler: LanguageHandler,
    languageId: string
  ): vscode.Range | null {
    // Original priority order for non-TypeScript languages:
    // 1. Class definition
    // 2. Function
    // 3. Multiline string assignment
    // 4. Object key/property
    // 5. Class member (method or property)
    // 6. Variable

    const classRange = handler.getClassRange(document, position, word);
    if (classRange) {
      return classRange;
    }

    const functionRange = handler.getFunctionRange(document, position, word);
    if (functionRange) {
      return functionRange;
    }

    const multilineStringRange = handler.getMultilineStringRange(document, position, word);
    if (multilineStringRange) {
      return multilineStringRange;
    }

    const objectKeyRange = handler.getObjectKeyRange(document, position, word);
    if (objectKeyRange) {
      return objectKeyRange;
    }

    const classMemberRange = handler.getClassMemberRange(document, position, word);
    if (classMemberRange) {
      return classMemberRange;
    }

    const variableRange = handler.getVariableRange(document, position, word);
    if (variableRange) {
      return variableRange;
    }

    return null;
  }
}