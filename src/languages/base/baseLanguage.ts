import * as vscode from 'vscode';

export enum ElementType {
  Class = 'class',
  Function = 'function',
  Variable = 'variable',
  ObjectKey = 'objectKey',
  ClassMember = 'classMember',
  MultilineString = 'multilineString'
}

export interface ElementPattern {
  regex: RegExp;
  type: ElementType;
  priority: number;
}

export interface MultilineStringPattern {
  regex: RegExp;
  delimiter: string;
  type: string;
}

export interface LanguageHandler {
  languageIds: string[];

  getConditionalBlockRange?(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  getFunctionRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  getVariableRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  getClassMemberRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;

  getNestedObjectPropertyRange?(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;


  // Optional method for JSX element range
  getJsxElementRange?(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;

  usesBraces(): boolean;
  isHtmlLike(): boolean;

  getClassPatterns(): ElementPattern[];
  getFunctionPatterns(): ElementPattern[];
  getVariablePatterns(): ElementPattern[];
  getObjectKeyPatterns(): ElementPattern[];
  getClassMemberPatterns(): ElementPattern[];
  getMultilineStringPatterns(): MultilineStringPattern[];
}

export abstract class BaseLanguageHandler implements LanguageHandler {
  abstract languageIds: string[];

  abstract getClassRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  abstract getFunctionRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  abstract getVariableRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  abstract getObjectKeyRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  abstract getClassMemberRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;
  abstract getMultilineStringRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null;

  // Default implementation for JSX element range (returns null for non-JSX languages)
  getJsxElementRange(document: vscode.TextDocument, position: vscode.Position, word: string): vscode.Range | null {
    return null;
  }

  abstract getClassPatterns(): ElementPattern[];
  abstract getFunctionPatterns(): ElementPattern[];
  abstract getVariablePatterns(): ElementPattern[];
  abstract getObjectKeyPatterns(): ElementPattern[];
  abstract getClassMemberPatterns(): ElementPattern[];
  abstract getMultilineStringPatterns(): MultilineStringPattern[];

  usesBraces(): boolean {
    return true;
  }

  isHtmlLike(): boolean {
    return false;
  }
}



const test = {
  hello: "world",
  rest: {
    test: "best"
  }
}