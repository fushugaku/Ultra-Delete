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

  private initializeHandlers() {
    // JavaScript Handler (only for pure JS)
    const jsHandler = new JavaScriptHandler();
    ['javascript', 'jsx', 'javascriptreact'].forEach(id => this.handlers.set(id, jsHandler));

    // TypeScript Handler (AST-based)
    const tsHandler = new TypeScriptHandler();
    tsHandler.languageIds.forEach(id => this.handlers.set(id, tsHandler));

    // TSX Handler (AST-based with JSX support)
    const tsxHandler = new TSXHandler();
    tsxHandler.languageIds.forEach(id => this.handlers.set(id, tsxHandler));

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

  getElementRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    languageId: string
  ): vscode.Range | null {


    const wordRange = document.getWordRangeAtPosition(position);

    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);
    const handler = this.handlers.get(languageId);

    if (!handler) {
      return null;
    }

    // Special handling for JSON
    if (languageId === 'json' || languageId === 'jsonc') {
      const jsonHandler = handler as JsonHandler;
      return jsonHandler.getJsonPropertyRange(document, position, word);
    }

    console.log

    // For TypeScript and TSX, use a different priority order that favors granular elements
    // if (languageId === 'typescript' || languageId === 'tsx' || languageId === 'typescriptreact') {
    //   return this.getTypescriptElementRange(document, position, word, handler, languageId);
    // }

    // if (handler.isHtmlLike()) {
    //   const htmlHandler = handler as HtmlHandler;
    //   const htmlRange = htmlHandler.getHtmlElementRange(document, position, word);
    //   if (htmlRange) {
    //     return htmlRange;
    //   }
    // }

    // Original priority order for other languages
    return this.getStandardElementRange(document, position, word, handler, languageId);
  }

  private getTypescriptElementRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    word: string,
    handler: LanguageHandler,
    languageId: string
  ): vscode.Range | null {

    console.log("getTypescriptElementRange")
    // Special handling for TSX (check for JSX elements first)
    if ((languageId === 'tsx' || languageId === 'typescriptreact') && handler.getJsxElementRange) {
      console.log("IS TSX")
      const jsxRange = handler.getJsxElementRange(document, position, word);
      if (jsxRange) {
        console.log("RANGE", jsxRange)
        return jsxRange;
      }
    }

    // Priority order for TypeScript/TSX - most specific first:
    // 1. Variables
    // 2. Object properties (inside object literals)
    // 3. Functions (standalone functions)
    // 4. Multiline strings
    // 5. Class members (methods, properties inside classes)



    // 6. Classes (only if not inside a class member)

    const variableRange = handler.getVariableRange(document, position, word);
    if (variableRange) {
      return variableRange;
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

    // Only check for classes last, when we're not inside a more specific element
    const classRange = handler.getClassRange(document, position, word);
    if (classRange) {
      return classRange;
    }

    return null;
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