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

    // Special handling for JSON
    if (languageId === 'json' || languageId === 'jsonc') {
      const jsonHandler = handler as JsonHandler;
      return jsonHandler.getJsonPropertyRange(document, position, word);
    }

    // For TypeScript, TSX, JavaScript, and JSX files - all use the TypeScript handler
    if (['typescript', 'tsx', 'typescriptreact', 'javascript', 'jsx', 'javascriptreact'].includes(languageId)) {
      console.log('Using TypeScript handler for code detection');
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
    console.log(`Handler has getObjectKeyRange: ${typeof handler.getObjectKeyRange}`);

    // Check for conditional blocks (if/else keywords) first
    if (['if', 'else'].includes(word) && handler.getConditionalBlockRange) {
      console.log('Checking conditional blocks');
      const conditionalRange = handler.getConditionalBlockRange(document, position, word);
      if (conditionalRange) {
        console.log('Found conditional block');
        return conditionalRange;
      }
    }

    // Check for class members (including access modifiers)
    console.log('Checking class members');
    console.log('About to call handler.getClassMemberRange');
    const classMemberRange = handler.getClassMemberRange(document, position, word);
    console.log('Called handler.getClassMemberRange, result:', classMemberRange);
    if (classMemberRange) {
      console.log('Found class member');
      return classMemberRange;
    }

    // Check for functions
    console.log('Checking functions');
    console.log('About to call handler.getFunctionRange');
    const functionRange = handler.getFunctionRange(document, position, word);
    console.log('Called handler.getFunctionRange, result:', functionRange);
    if (functionRange) {
      console.log('Found function');
      return functionRange;
    }

    // Check for variables
    console.log('Checking variables');
    console.log('About to call handler.getVariableRange');
    const variableRange = handler.getVariableRange(document, position, word);
    console.log('Called handler.getVariableRange, result:', variableRange);
    if (variableRange) {
      console.log('Found variable');
      return variableRange;
    }

    // Check for object keys/properties
    console.log('Checking object keys');
    console.log('About to call handler.getObjectKeyRange');
    const objectKeyRange = handler.getObjectKeyRange(document, position, word);
    console.log('Called handler.getObjectKeyRange, result:', objectKeyRange);
    if (objectKeyRange) {
      console.log('Found object key');
      return objectKeyRange;
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
    // TypeScript Handler (AST-based) - Handle all JS/TS variants including JSX/TSX
    const tsHandler = new TypeScriptHandler();
    ['javascript', 'jsx', 'javascriptreact', 'typescript', 'tsx', 'typescriptreact'].forEach(id => {
      this.handlers.set(id, tsHandler);
      console.log(`Registered TypeScript handler for: ${id}`);
    });

    // HTML Handler
    const htmlHandler = new HtmlHandler();
    htmlHandler.languageIds.forEach(id => this.handlers.set(id, htmlHandler));

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