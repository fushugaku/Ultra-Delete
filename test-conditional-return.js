"use strict";
function findNodeExample() {
    let node = null;
    const pos = 100;
    const doc = {
        descendants: (callback) => {
            // Mock implementation
        }
    };
    if (!node) {
        doc.descendants((childNode, posInParent) => {
            const start = posInParent + 1;
            const end = start + childNode.nodeSize;
            if (pos >= start && pos < end) {
                node = childNode;
                return false;
            }
        });
    }
    console.log(node);
}
//# sourceMappingURL=test-conditional-return.js.map