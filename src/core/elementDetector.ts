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

    console.log(`ElementDetector: Processing ${languageId} file, word: "${word}"`);

    const handler = this.handlers.get(languageId);
    if (!handler) {
      console.log(`No handler found for language: ${languageId}`);
      return null;
    }

    console.log(`Handler found: ${handler.constructor.name} for language: ${languageId}`);

    // Special handling for JSON
    if (languageId === 'json' || languageId === 'jsonc') {
      const jsonHandler = handler as JsonHandler;
      return jsonHandler.getJsonPropertyRange(document, position, word);
    }

    // For TypeScript, TSX, JavaScript, and JSX files - all use the TypeScript handler
    if (['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
      console.log('Using TypeScript handler for code detection');

      // Verify this is actually a TypeScript handler
      if (handler.constructor.name !== 'TypeScriptHandler') {
        console.error(`Expected TypeScriptHandler but got ${handler.constructor.name} for language ${languageId}`);
        console.log('Available handlers:', Array.from(this.handlers.entries()).map(([key, value]) => `${key}: ${value.constructor.name}`));
      }

      return this.getTypescriptElementRange(document, position, word, handler as TypeScriptHandler, languageId);
    }

    return this.getStandardElementRange(document, position, word, handler, languageId);
  }

  private getTypescriptElementRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string,
    handler: TypeScriptHandler,
    languageId: string
  ): vscode.Range | null {
    console.log(`getTypescriptElementRange: word="${word}", languageId="${languageId}"`);
    console.log(`Handler type: ${handler.constructor.name}`);

    // For TSX/JSX files, check JSX elements FIRST
    if (['tsx', 'typescriptreact', 'jsx', 'javascriptreact'].includes(languageId)) {
      console.log('Checking JSX elements first');
      const jsxRange = handler.getJsxElementRange!(document, position, word);
      if (jsxRange) {
        console.log('Found JSX element');
        return jsxRange;
      }
    }

    // Check for conditional blocks (if/else keywords)
    if (['if', 'else'].includes(word) && handler.getConditionalBlockRange) {
      console.log('Checking conditional blocks');
      const conditionalRange = handler.getConditionalBlockRange(document, position, word);
      if (conditionalRange) {
        console.log('Found conditional block');
        return conditionalRange;
      }
    }

    // PRIORITIZE FUNCTION CALLS - check functions BEFORE class members
    // This will catch function calls like onMounted(), watch(), etc.
    console.log('Checking functions (including calls)');
    const functionRange = handler.getFunctionRange(document, position, word);
    if (functionRange) {
      console.log('Found function/call');
      return functionRange;
    }

    // Check for variables
    console.log('Checking variables');
    const variableRange = handler.getVariableRange(document, position, word);
    if (variableRange) {
      console.log('Found variable');
      return variableRange;
    }

    // Check for object keys/properties
    console.log('Checking object keys');
    const objectKeyRange = handler.getObjectKeyRange(document, position, word);
    if (objectKeyRange) {
      console.log('Found object key');
      return objectKeyRange;
    }

    // Check for class members AFTER function calls
    // This prevents method declarations from overriding function calls inside them
    console.log('Checking class members');
    const classMemberRange = handler.getClassMemberRange(document, position, word);
    if (classMemberRange) {
      console.log('Found class member');
      return classMemberRange;
    }

    // Check for multiline strings
    console.log('Checking multiline strings');
    const multilineStringRange = handler.getMultilineStringRange(document, position, word);
    if (multilineStringRange) {
      console.log('Found multiline string');
      return multilineStringRange;
    }

    // Check for classes
    console.log('Checking classes');
    const classRange = handler.getClassRange(document, position, word);
    if (classRange) {
      console.log('Found class');
      return classRange;
    }

    console.log('No element found in TypeScript handler');
    return null;
  }

  private initializeHandlers() {
    console.log('Initializing handlers...');

    // HTML Handler FIRST (so it doesn't overwrite TypeScript handler)
    const htmlHandler = new HtmlHandler();
    console.log('Created HTML handler:', htmlHandler.constructor.name);
    console.log('HTML handler language IDs:', htmlHandler.languageIds);
    htmlHandler.languageIds.forEach(id => {
      console.log(`Setting HTML handler for language: ${id}`);
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
    console.log('Created TypeScript handler:', tsHandler.constructor.name);

    ['javascript', 'jsx', 'javascriptreact', 'typescript', 'tsx', 'typescriptreact'].forEach(id => {
      console.log(`Setting TypeScript handler for language: ${id}`);
      this.handlers.set(id, tsHandler);

      // Verify it was set correctly
      const retrievedHandler = this.handlers.get(id);
      console.log(`Verified handler for ${id}: ${retrievedHandler?.constructor.name}`);
    });

    console.log('Handler initialization complete');
    console.log('Final handler mapping:');
    Array.from(this.handlers.entries()).forEach(([key, value]) => {
      console.log(`  ${key}: ${value.constructor.name}`);
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