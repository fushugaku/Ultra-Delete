class ReturnTypeDemo {

  // Test 1: Boolean return (like your example)
  getNodeByPosition(pos: number): any {
    const doc = this.getDocument();
    let node = doc.nodeAt(pos);

    // Extract this block - should return: void | boolean
    // because it has "return false" AND modifies node (which might be used after)
    if (!node) {
      doc.descendants((childNode: any, posInParent: number) => {
        const start = posInParent + 1;
        const end = start + childNode.nodeSize;

        if (pos >= start && pos < end) {
          node = childNode;
          return false; // This should be detected!
        }
      });
    }

    return node;
  }

  // Test 2: Multiple return types
  processValue(value: any): string | null | undefined {
    const defaultValue = "default";
    let result = "";

    // Extract this block - should return: string | null | undefined
    if (value === null) {
      return null;
    }

    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'string') {
      result = value.trim();
      return result;
    }

    result = defaultValue;
    console.log(`Using default: ${result}`);
    return result; // This should combine with variable return
  }

  // Test 3: Mixed return types with variables
  calculateResult(numbers: number[]): number | null {
    let sum = 0;
    let count = 0;

    // Extract this block - should return: number | null
    // because it returns null explicitly AND modifies sum/count
    for (const num of numbers) {
      if (isNaN(num)) {
        return null; // Early return
      }
      sum += num;
      count++;
    }

    // sum and count are used after, so they should also be returned
    console.log(`Sum: ${sum}, Count: ${count}`);
    return sum / count;
  }

  // Test 4: Complex return expressions
  findElement(container: any, selector: string): any {
    let element = null;
    const options = { deep: true };

    // Extract this block - should return: any | boolean
    element = container.querySelector(selector);
    if (element) {
      return element; // Variable type
    }

    if (options.deep) {
      element = container.querySelectorAll(selector)[0];
      if (element) {
        return true; // Boolean type
      }
    }

    // element is modified and used after
    console.log('Element not found');
    return element;
  }

  // Test 5: Void returns
  logMessage(message: string): void {
    const timestamp = new Date();
    const prefix = "[LOG]";

    // Extract this block - should return: void
    // because it has early void returns but no variable returns
    if (!message) {
      console.error("Empty message");
      return; // void return
    }

    if (message.length > 1000) {
      console.error("Message too long");
      return; // void return
    }

    console.log(`${prefix} ${timestamp.toISOString()}: ${message}`);
  }

  // Test 6: Object returns
  createConfig(options: any): any {
    const config: any = {};
    const defaults = { theme: 'light', debug: false };

    // Extract this block - should return: any | { error: string }
    if (!options) {
      return { error: 'No options provided' }; // Object type
    }

    config.theme = options.theme || defaults.theme;
    config.debug = options.debug !== undefined ? options.debug : defaults.debug;

    // config is used after
    console.log('Config created:', config);
    return config;
  }

  // Test 7: Array returns
  filterItems(items: any[], predicate: (item: any) => boolean): any[] {
    const filtered: any[] = [];
    const errors: string[] = [];

    // Extract this block - should return: any[] | string[]
    for (const item of items) {
      try {
        if (predicate(item)) {
          filtered.push(item);
        }
      } catch (error) {
        errors.push(String(error));
        if (errors.length > 10) {
          return errors; // Return errors array
        }
      }
    }

    // filtered is used after
    console.log(`Filtered ${filtered.length} items`);
    return filtered;
  }

  private getDocument(): any {
    return { nodeAt: () => null, descendants: () => { } };
  }
}

// Test cases for return type analysis
function testConditionalReturn() {
  let node: any = null;
  const pos = 100;
  const doc: any = {}; // Mock doc object

  interface Node {
    nodeSize: number;
  }

  // Test case: conditional return without else
  if (!node) {
    doc.descendants = (callback: (childNode: Node, posInParent: number) => boolean | void) => {
      const start = pos + 1;
      const end = start + 10;

      if (pos >= start && pos < end) {
        node = { nodeSize: 10 };
        return false; // This should make return type 'boolean | void'
      }
    };
  }

  // Test case: unconditional return
  return true;
}

function testUnconditionalReturn() {
  const value = 42;
  return value > 0; // This should make return type 'boolean'
}

function testIfElseReturn(condition: boolean) {
  if (condition) {
    return 'success'; // Both branches return, so no void needed
  } else {
    return 'failure';
  }
}

function testMixedReturn(items: any[]) {
  if (items.length === 0) {
    return false; // boolean
  }

  const result = items.map(item => item.value);
  // No explicit return here, should add void to union
}

// Test case for the fixed behavior
function testFixedBehavior() {
  let node: any = null; // Properly typed variable
  const pos = 100;
  const doc: any = {
    descendants: (callback: (childNode: any, posInParent: number) => boolean | void) => { }
  };

  // Extract this selection - should return boolean | void, not boolean | any
  if (!node) {
    doc.descendants((childNode: any, posInParent: number) => {
      const start = posInParent + 1;
      const end = start + childNode.nodeSize;

      if (pos >= start && pos < end) {
        node = childNode;
        return false;
      }
    });
  }

  return node; // This shows that node variable will be returned via the generated return statement
} 