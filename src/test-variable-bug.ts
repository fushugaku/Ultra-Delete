class NodeFinder {
  private state: any;

  public getNodeByPosition(pos: number) {
    const doc = this.state.doc;
    let node = doc.nodeAt(pos);

    // This selection should now properly detect 'node' as a parameter
    // Select from "if (!node)" to the closing brace
    if (!node) {
      doc.descendants((childNode: any, posInParent: number) => {
        const start = posInParent + 1; // Позиция начала узла
        const end = start + childNode.nodeSize;

        if (pos >= start && pos < end) {
          node = childNode;
          return false;
        }
      });
    }

    return node;
  }

  // Another example with similar pattern
  public findElement(container: any, targetId: string) {
    let element = container.getElementById(targetId);

    // This should also detect 'element' and 'container' as parameters
    if (!element) {
      container.querySelectorAll('*').forEach((child: any) => {
        if (child.id === targetId) {
          element = child;
        }
      });
    }

    return element;
  }

  // Example with multiple variables
  public processData(items: any[]) {
    let result: any[] = [];
    let count = 0;
    const threshold = 10;

    // This should detect 'result', 'count', 'threshold', and 'items' as parameters
    // and return both 'result' and 'count'
    for (const item of items) {
      if (item.value > threshold) {
        result.push(item);
        count++;
      }
    }

    console.log(`Processed ${count} items`);
    return result;
  }
} 