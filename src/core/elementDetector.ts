import * as vscode from 'vscode';
import { LanguageHandler } from '../languages/base/baseLanguage';
import { JavaScriptHandler } from '../languages/javascript';
import { TypeScriptHandler } from '../languages/typescript';
import { TSXHandler } from '../languages/tsx';
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


  // elementDetector.ts - Update the getElementRange method:

  getElementRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    languageId: string
  ): vscode.Range | null {

    const wordRange = document.getWordRangeAtPosition(position);

    // Get the word at cursor position
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

    // For TypeScript and TSX, use the improved detection
    if (languageId === 'typescript' || languageId === 'tsx' || languageId === 'typescriptreact') {
      return this.getTypescriptElementRange(document, position, word, handler, languageId);
    }

    return this.getStandardElementRange(document, position, word, handler, languageId);
  }


  private getTypescriptElementRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string,
    handler: LanguageHandler,
    languageId: string
  ): vscode.Range | null {

    console.log("getTypescriptElementRange", "word:", word);

    // Special handling for TSX (check for JSX elements first)
    // if ((languageId === 'tsx' || languageId === 'typescriptreact') && handler.getJsxElementRange) {
    //   const jsxRange = handler.getJsxElementRange(document, position, word);
    //   if (jsxRange) {
    //     return jsxRange;
    //   }
    // }

    // Check for conditional blocks (if/else keywords)
    if (['if', 'else'].includes(word) && handler.getConditionalBlockRange) {
      const conditionalRange = handler.getConditionalBlockRange(document, position, word);
      if (conditionalRange) {
        return conditionalRange;
      }
    }

    // Check for class members (including access modifiers)
    const classMemberRange = handler.getClassMemberRange(document, position, word);
    if (classMemberRange) {
      return classMemberRange;
    }

    // Continue with normal priority order
    const functionRange = handler.getFunctionRange(document, position, word);
    if (functionRange) {
      return functionRange;
    }

    const variableRange = handler.getVariableRange(document, position, word);
    if (variableRange) {
      return variableRange;
    }

    const objectKeyRange = handler.getObjectKeyRange(document, position, word);
    if (objectKeyRange) {
      return objectKeyRange;
    }

    const multilineStringRange = handler.getMultilineStringRange(document, position, word);
    if (multilineStringRange) {
      return multilineStringRange;
    }

    const classRange = handler.getClassRange(document, position, word);
    if (classRange) {
      return classRange;
    }

    return null;
  }

  private initializeHandlers() {


    // TypeScript Handler (AST-based) - Handle both TS and TSX
    const tsHandler = new TypeScriptHandler();
    ['javascript', 'jsx', 'javascriptreact', 'typescript', 'tsx', 'typescriptreact'].forEach(id => this.handlers.set(id, tsHandler));

    // TSX Handler (AST-based with JSX support) - This should handle TSX

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