# Ultra Cut Delete

A powerful VS Code extension for intelligent code navigation and manipulation. Delete, cut, navigate, and organize entire code elements with single keypress commands.

## 🚀 Features

### **Code Deletion & Cutting**
- **Variable Deletion**: When cursor is on a variable name, deletes the entire variable declaration including its content
- **Function Deletion**: When cursor is on a function name, deletes the entire function including its body
- **Smart Detection**: Handles complex variable assignments (objects, arrays) and various function syntaxes
- **Multi-cursor Support**: Delete/cut multiple elements simultaneously

### **Code Navigation** ⭐ NEW!
- **Function Scope Selection**: Select all content within the current function body
- **Member Navigation**: Navigate between class members, object properties, or function variables
- **Smart Scope Detection**: Automatically finds the appropriate scope (class, object, function)

### **Code Organization** ⭐ NEW!
- **Multi-Selection**: Add multiple members to selection for bulk operations
- **Alphabetical Sorting**: Sort class members, object properties, or variables A-Z or Z-A
- **Scope-aware Operations**: All operations work within the current scope context

## 🎮 Commands & Keybindings

| Command | Keybinding (Mac) | Keybinding (Win/Linux) | Description |
|---------|------------------|------------------------|-------------|
| Delete Element | `Cmd+Shift+D` | `Ctrl+Shift+D` | Delete entire variable/function at cursor |
| Cut Element | `Cmd+Shift+X` | `Ctrl+Shift+X` | Cut entire variable/function to clipboard |
| **Select Function Scope** | `Cmd+Shift+S` | `Ctrl+Shift+S` | Select all content inside current function |
| **Go to Next Member** | `Cmd+Shift+N` | `Ctrl+Shift+N` | Move cursor to next member in scope |
| **Select Next Member** | `Cmd+Shift+M` | `Ctrl+Shift+M` | Select the next member in scope |
| **Add Member to Selection** | `Cmd+Shift+Alt+M` | `Ctrl+Shift+Alt+M` | Add next member to multi-selection |
| **Sort Members A-Z** | `Cmd+Shift+A` | `Ctrl+Shift+A` | Sort members alphabetically |
| **Sort Members Z-A** | `Cmd+Shift+Z` | `Ctrl+Shift+Z` | Sort members reverse alphabetically |

## 🛠 Supported Languages

### **Full Feature Support** (Navigation + Deletion)
- JavaScript (`.js`, `.jsx`)
- TypeScript (`.ts`, `.tsx`)
- React (JSX/TSX)

### **Deletion Support**
- Python
- Java
- C#
- C/C++
- Go
- Rust

## 📖 Usage Examples

### **Basic Deletion & Cutting**

```typescript
// Place cursor on 'myVariable' and press Cmd+Shift+D
const myVariable = {
  complex: "object",
  with: ["arrays", "and", "stuff"]
}; // ← Entire declaration deleted

function myFunction() {
  return "hello world";
} // ← Place cursor on 'myFunction' and press Cmd+Shift+X to cut
```

### **Function Scope Selection** ⭐

```typescript
function setupComponent(props) {
  const tiptap = ref<Editor>()           // ← Place cursor anywhere
  const isReady = ref(false)             //   in this function
  const data = reactive({ count: 0 })    //   and press Cmd+Shift+S
  
  return { tiptap, isReady, data }       // ← Selects all content
}
```

### **Member Navigation** ⭐

```typescript
class MyClass {
  zebra: string;    // ← Start here, press Cmd+Shift+N
  apple: string;    // ← Moves here
  mango: string;    // ← Then here
  
  constructor() {}  // ← Then here
  methodZ() {}      // ← And so on...
  methodA() {}
}
```

### **Multi-Selection** ⭐

```typescript
export const config = {
  zebra: "last",     // ← Cursor here
  apple: "first",    // ← Cmd+Shift+Alt+M adds this
  mango: "middle",   // ← Cmd+Shift+Alt+M adds this too
  // Now you can delete/cut all selected members at once!
}
```

### **Smart Sorting** ⭐

```typescript
// Before sorting (cursor anywhere in class)
class ApiService {
  zebra() { return "z" }
  apple() { return "a" }  
  mango() { return "m" }
}

// After Cmd+Shift+A (A-Z sorting)
class ApiService {
  apple() { return "a" }
  mango() { return "m" }
  zebra() { return "z" }
}
```

## 🎯 What Counts as a "Member"?

The extension intelligently detects different types of members based on context:

### **Class Context**
- Properties (public, private, protected)
- Methods (including getters, setters, constructor)
- Static members

### **Object Context**
- Properties and values
- Methods (function expressions, arrow functions)
- Nested objects

### **Function Context**
- Local variables (`const`, `let`, `var`)
- Inner function declarations
- Function calls (like `watch()`, `onMounted()`)

### **File Context**
- Top-level functions
- Variable declarations
- Import/export statements

## 🔥 Pro Tips

1. **Multi-Selection Workflow**: Use `Cmd+Shift+Alt+M` to select multiple related members, then `Cmd+Shift+D` to delete them all at once

2. **Quick Organization**: Place cursor in a class and use `Cmd+Shift+A` to instantly organize all members alphabetically

3. **Function Scope Editing**: Use `Cmd+Shift+S` to select function content, then type to replace entire function body

4. **Navigation + Selection**: Use `Cmd+Shift+N` to browse through members, then `Cmd+Shift+M` when you find what you want to select

5. **Scope Awareness**: All operations automatically work within the appropriate scope - no need to manually select ranges

## 🛡 Smart Detection

The extension uses TypeScript AST parsing for intelligent code analysis:
- **Scope Detection**: Automatically identifies classes, objects, functions, and modules
- **Element Recognition**: Distinguishes between variables, functions, properties, and methods  
- **Context Awareness**: Operations adapt based on cursor position and surrounding code
- **Multi-cursor Support**: All operations work with multiple cursors/selections

## 🐛 Known Limitations

- Navigation features currently work best with JavaScript/TypeScript files
- Some complex nested structures may require precise cursor positioning
- Very large files (>10k lines) may experience slower performance

---

**Enjoy more productive coding with Ultra Cut Delete!** 🚀