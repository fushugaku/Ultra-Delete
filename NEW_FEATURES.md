# Ultra Cut Delete - New Features

This document describes the new features added to the Ultra Cut Delete VSCode extension for enhanced code navigation and manipulation.

## New Features Overview

### 1. Select Current Function Scope
- **Command**: `variableFunctionDeleter.selectFunctionScope`
- **Keybinding**: `Ctrl+Shift+S` (Windows/Linux) / `Cmd+Shift+S` (Mac)
- **Description**: Selects the entire contents of the current function scope (everything inside the function body)
- **Usage**: Place cursor anywhere inside a function and execute the command to select all content within that function's body

### 2. Go to Next Member
- **Command**: `variableFunctionDeleter.goToNextMember`
- **Keybinding**: `Ctrl+Shift+N` (Windows/Linux) / `Cmd+Shift+N` (Mac)
- **Description**: Moves the cursor to the next member in the current scope level
- **Usage**: Navigate through class members, object properties, or top-level functions/variables sequentially

### 3. Select Next Member
- **Command**: `variableFunctionDeleter.selectNextMember`
- **Keybinding**: `Ctrl+Shift+M` (Windows/Linux) / `Cmd+Shift+M` (Mac)
- **Description**: Selects the next member in the current scope level
- **Usage**: Quickly select the next member for editing, cutting, or copying

### 4. Sort Members A-Z
- **Command**: `variableFunctionDeleter.sortMembersAZ`
- **Keybinding**: `Ctrl+Shift+A` (Windows/Linux) / `Cmd+Shift+A` (Mac)
- **Description**: Sorts all members in the current scope alphabetically (A to Z)
- **Usage**: Automatically organize class members, object properties, or functions in ascending alphabetical order

### 5. Sort Members Z-A
- **Command**: `variableFunctionDeleter.sortMembersZA`
- **Keybinding**: `Ctrl+Shift+Z` (Windows/Linux) / `Cmd+Shift+Z` (Mac)
- **Description**: Sorts all members in the current scope reverse alphabetically (Z to A)
- **Usage**: Automatically organize class members, object properties, or functions in descending alphabetical order

## Supported Languages

These new features currently support:
- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)
- TypeScript React (`.tsx`)
- JavaScript React (`.jsx`)

## What Counts as a "Member"

The extension recognizes the following as members depending on the context:

### Class Members
- Properties (public, private, protected)
- Methods (including getters and setters)
- Constructor

### Object Members
- Properties
- Methods (function expressions and arrow functions)

### Top-level Members
- Function declarations
- Variable declarations
- Exported items

## Usage Examples

### Example 1: Function Scope Selection
```typescript
function example() {
  const a = 1;     // ← Place cursor here
  const b = 2;     // ← or here
  return a + b;    // ← or here
}
```
Using `Ctrl+Shift+S` will select the content between the braces:
```typescript
const a = 1;
const b = 2;
return a + b;
```

### Example 2: Member Navigation
```typescript
class MyClass {
  zebra: string;   // ← cursor here
  apple: string;   // ← Ctrl+Shift+N moves to here
  mango: string;   // ← Ctrl+Shift+N moves to here next
  
  constructor() {} // ← then here
}
```

### Example 3: Member Sorting
```typescript
// Before sorting (cursor anywhere in class)
class MyClass {
  zebra: string;
  apple: string;
  mango: string;
}

// After Ctrl+Shift+A (A-Z sorting)
class MyClass {
  apple: string;
  mango: string;
  zebra: string;
}
```

## Technical Implementation

The new features use TypeScript's AST (Abstract Syntax Tree) parsing to:
1. Identify scope boundaries (functions, classes, objects)
2. Extract member information (name, position, type)
3. Navigate between members based on their position in the file
4. Sort members while preserving their structure and formatting

## Error Handling

If a feature is not available for the current context, the extension will show an informative message:
- "No function scope found at cursor position"
- "No next member found in current scope"
- "Member sorting not available for this language"

## Integration with Existing Features

These new features complement the existing cut/delete functionality:
1. Use member navigation to find the element you want to modify
2. Use the existing `Ctrl+Shift+D` (delete) or `Ctrl+Shift+X` (cut) to remove it
3. Use sorting to organize your code structure

The extension maintains its intelligent element detection for the original delete/cut operations while adding these powerful navigation and organization tools. 