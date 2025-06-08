"use strict";
// Test file to demonstrate Ultra Cut Delete new features
Object.defineProperty(exports, "__esModule", { value: true });
exports.testObject = exports.ExampleClass = void 0;
class ExampleClass {
    constructor() {
        // Class members to test sorting and navigation
        this.zebra = "last";
        this.apple = "first";
        this.mango = "middle";
        console.log("Constructor");
    }
    // Methods to test navigation
    zMethod() {
        console.log("Z method");
    }
    aMethod() {
        console.log("A method");
        // Function scope to test selection
        const localVariable = "test";
        const anotherLocal = "another";
        if (true) {
            console.log("Inside function scope");
            const nestedVariable = "nested";
        }
        return localVariable + anotherLocal;
    }
    mMethod() {
        console.log("M method");
    }
}
exports.ExampleClass = ExampleClass;
// Object with members to test sorting
const testObject = {
    zebra: "last property",
    apple: "first property",
    mango: "middle property",
    zFunction: () => {
        console.log("Z function");
    },
    aFunction: () => {
        console.log("A function");
    },
    mFunction: () => {
        console.log("M function");
    }
};
exports.testObject = testObject;
// Top-level functions to test navigation
function zTopFunction() {
    console.log("Z top function");
    // Function scope content
    const x = 1;
    const y = 2;
    const z = 3;
    return x + y + z;
}
function aTopFunction() {
    console.log("A top function");
}
function mTopFunction() {
    console.log("M top function");
}
//# sourceMappingURL=test-example.js.map