# Extract Selection to Function Guide

## Overview
The "Extract Selection to Function" feature allows you to refactor selected TypeScript/JavaScript code into a new function with intelligent variable dependency analysis.

## How to Use

### 1. **Select Code**
Highlight the code block you want to extract to a function.

### 2. **Trigger Command**
- **Keyboard Shortcut**: `Ctrl+Shift+E` (Windows/Linux) / `Cmd+Shift+E` (Mac)
- **Command Palette**: "Extract Selection to Function"

### 3. **Name the Function**
Enter a name for the new function when prompted.

### 4. **Review Results**
The extension will:
- Create a new function with proper parameters
- Replace the selected code with a function call
- Handle variable dependencies automatically

## Smart Variable Analysis

The extension analyzes your code to determine:

### **Parameters** 
Variables that are:
- Used in the selection
- Declared outside the selection
- Not modified within the selection (or modified but not used after)

### **Return Values**
The extension intelligently analyzes both variable mutations and explicit return statements:

#### **Variable Returns**
Variables that are:
- Modified within the selection
- Used after the selection in the same scope

#### **Explicit Returns**
- Detects `return` statements within the selected code
- Infers types from return expressions (`return false` → `boolean`)
- Handles multiple return types with union types (`string | null`)

#### **Combined Returns**
When both variable modifications and explicit returns exist:
- Creates union types combining all return possibilities
- Example: `void | boolean` for early returns + variable changes

## Examples

### Example 1: Simple Extraction
**Before:**
```typescript
function processData(items: string[]) {
  const results: string[] = [];
  
  // Select this block ↓
  for (const item of items) {
    const processed = item.trim().toLowerCase();
    if (processed.length > 0) {
      results.push(processed);
    }
  }
  // Select this block ↑
  
  return results;
}
```

**After:**
```typescript
function processItems(items: string[], results: string[]): void {
  for (const item of items) {
    const processed = item.trim().toLowerCase();
    if (processed.length > 0) {
      results.push(processed);
    }
  }
}

function processData(items: string[]) {
  const results: string[] = [];
  
  processItems(items, results);
  
  return results;
}
```

### Example 2: With Return Value
**Before:**
```typescript
function calculate(x: number, y: number): number {
  const base = 10;
  
  // Select this block ↓
  const temp1 = x * base;
  const temp2 = y * base;
  const result = temp1 + temp2;
  // Select this block ↑
  
  return result * 2;
}
```

**After:**
```typescript
function calculateTemp(x: number, y: number, base: number): number {
  const temp1 = x * base;
  const temp2 = y * base;
  const result = temp1 + temp2;
  return result;
}

function calculate(x: number, y: number): number {
  const base = 10;
  
  const result = calculateTemp(x, y, base);
  
  return result * 2;
}
```

### Example 3: Multiple Return Values
**Before:**
```typescript
function analyzeData(data: number[]) {
  let sum = 0;
  let count = 0;
  let max = Number.MIN_VALUE;
  
  // Select this block ↓
  for (const value of data) {
    sum += value;
    count++;
    if (value > max) {
      max = value;
    }
  }
  // Select this block ↑
  
  const average = sum / count;
  console.log(`Sum: ${sum}, Count: ${count}, Max: ${max}, Average: ${average}`);
}
```

**After:**
```typescript
function processData(data: number[]): { sum: number, count: number, max: number } {
  let sum = 0;
  let count = 0;
  let max = Number.MIN_VALUE;
  
  for (const value of data) {
    sum += value;
    count++;
    if (value > max) {
      max = value;
    }
  }
  return { sum, count, max };
}

function analyzeData(data: number[]) {
  let sum = 0;
  let count = 0;
  let max = Number.MIN_VALUE;
  
  const { sum, count, max } = processData(data);
  
  const average = sum / count;
  console.log(`Sum: ${sum}, Count: ${count}, Max: ${max}, Average: ${average}`);
}
```

### Example 4: Return Type Analysis
**Before:**
```typescript
public getNodeByPosition(pos: number): any {
  const doc = this.state.doc;
  let node = doc.nodeAt(pos);

  // Select this block ↓
  if (!node) {
    doc.descendants((childNode: Node, posInParent: number) => {
      const start = posInParent + 1;
      const end = start + childNode.nodeSize;

      if (pos >= start && pos < end) {
        node = childNode;
        return false; // Explicit return!
      }
    });
  }
  // Select this block ↑

  return node;
}
```

**After:**
```typescript
public getNodeByPosition(pos: number): any {
  const doc = this.state.doc;
  let node = doc.nodeAt(pos);

  node = this.findNodeInDescendants(node, doc, pos);

  return node;
}

private findNodeInDescendants(node: any, doc: any, pos: number): void | boolean {
  if (!node) {
    doc.descendants((childNode: Node, posInParent: number) => {
      const start = posInParent + 1;
      const end = start + childNode.nodeSize;

      if (pos >= start && pos < end) {
        node = childNode;
        return false; // This return type is detected!
      }
    });
  }
  return node;
}
```

### Example 5: Class Method Extraction
**Before:**
```typescript
class DataProcessor {
  private apiUrl: string;
  
  async fetchData(id: string): Promise<any> {
    const headers = { 'Content-Type': 'application/json' };
    
    // Select this block ↓
    const url = `${this.apiUrl}/data/${id}`;
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
    // Select this block ↑
  }
}
```

**After:**
```typescript
class DataProcessor {
  private apiUrl: string;
  
  async fetchData(id: string): Promise<any> {
    const headers = { 'Content-Type': 'application/json' };
    
    return await this.makeApiRequest(id, headers);
  }

  private async makeApiRequest(id: string, headers: any): Promise<any> {
    const url = `${this.apiUrl}/data/${id}`;
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  }
}
```

## Type Inference

The extension provides intelligent type inference for function parameters:

### **Explicit Types**
When variables have explicit type annotations, those exact types are used:
```typescript
const userData: User[] = [];     // → User[]
const threshold: number = 10;    // → number
const config: AppConfig = {};    // → AppConfig
```

### **Inferred Types**
For variables without explicit types, the extension intelligently infers from:

#### **Primitive Literals**
- **String literals** → `string`
- **Numeric literals** → `number`  
- **Boolean literals** → `boolean`

#### **Complex Types**
- **Array literals** → `ElementType[]` (infers element type)
- **Object literals** → `{ prop1: type1, prop2: type2 }` (structured types)
- **Function calls** → Common patterns like `HTMLElement | null`, `Promise<Response>`
- **Constructor calls** → Constructor name (e.g., `new Date()` → `Date`)

#### **Common API Patterns**
- `getElementById()` → `HTMLElement | null`
- `querySelectorAll()` → `NodeList`
- `fetch()` → `Promise<Response>`
- `JSON.parse()` → `any`
- `Array.from()` → `any[]`

### **Advanced TypeScript Types**
The extension now uses TypeScript's compiler API for sophisticated type analysis:

#### **Generic Types**
- `Promise<Response>` → `Promise<Response>`
- `Map<string, UserProfile>` → `Map<string, UserProfile>`
- `ApiResponse<T>` → `ApiResponse<T>`

#### **Union & Literal Types**
- `'light' | 'dark' | 'auto'` → `'light' | 'dark' | 'auto'`
- `UserProfile | undefined` → `UserProfile | undefined`

#### **Utility Types**
- `Partial<UserProfile>` → `Partial<UserProfile>`
- `keyof UserProfile` → `keyof UserProfile`
- `Record<string, number>` → `Record<string, number>`

#### **Complex Object Types**
- `{ add: (user: User) => void; remove: (id: string) => boolean }` → Full object type
- Nested object structures with proper typing

#### **Function Types**
- `(user: UserProfile, index: number) => Promise<UserProfile>` → Complete function signature

### **Class Properties**
Class properties accessed via `this` are not included as parameters since they're already available in the class context.

## Function Placement

The extracted function is automatically placed based on context:

### **Standalone Functions**
When extracting from global scope or regular functions:
- **Before the containing function**
- **At the appropriate scope level**
- **With proper indentation**

### **Class Methods**
When extracting from within a class:
- **As a new class method** (private by default)
- **After the current method**
- **With `this.` prefix for method calls**
- **Maintains class context and `this` references**

## Supported Languages

- TypeScript (`.ts`)
- TypeScript React (`.tsx`)
- JavaScript (`.js`)
- JavaScript React (`.jsx`)

## Best Practices

### ✅ **Good Candidates for Extraction**
- Complex loops with logic
- Repeated calculations
- Data transformation blocks
- Validation routines
- Formatting operations

### ❌ **Avoid Extracting**
- Single statements
- Variable declarations only
- Code with complex control flow (try/catch, return statements)
- Code that heavily depends on `this` context

## Limitations

1. **Simple Analysis**: Uses text-based heuristics for variable modification detection
2. **No `this` Handling**: Doesn't handle class method extraction with `this` references
3. **Control Flow**: May not handle complex control flow correctly
4. **Scope Limitations**: Works best within function/method scopes

## Tips

1. **Select Complete Statements**: Ensure you select complete statements for best results
2. **Test Extracted Code**: Always verify the extracted function works as expected
3. **Review Parameters**: Check if the generated parameters make sense
4. **Rename If Needed**: Use VS Code's rename functionality to improve names

## Error Handling

The extension will show helpful error messages for:
- Empty selections
- Unsupported file types
- Analysis failures
- Invalid function names

## Integration with Refactoring

This feature complements VS Code's built-in refactoring tools and can be used alongside:
- Rename Symbol (`F2`)
- Move to File
- Extract Variable
- Extract Interface

The Extract Selection to Function feature provides a powerful way to improve code organization and reusability with minimal manual effort! 