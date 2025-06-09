"use strict";
class DataProcessor {
    constructor(config) {
        this.config = config;
    }
    processData(numbers) {
        const results = [];
        // This block can be extracted - it uses external variables and modifies local ones
        for (const num of numbers) {
            const multiplied = num * this.config.multiplier;
            const adjusted = multiplied + 10;
            if (adjusted > this.config.threshold) {
                results.push(adjusted);
            }
        }
        console.log(`Processed ${results.length} items`);
        return results;
    }
    calculateStats(data) {
        let total = 0;
        let count = 0;
        // This block can be extracted - uses external variables and returns values
        for (const value of data) {
            total += value;
            count++;
        }
        const average = count > 0 ? total / count : 0;
        return { average, total };
    }
    validateAndFormat(input) {
        const trimmed = input.trim();
        // This block can be extracted - simple transformation
        const formatted = trimmed
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        if (formatted.length === 0) {
            throw new Error('Invalid input after formatting');
        }
        return formatted;
    }
}
function complexCalculation(x, y) {
    const base = 100;
    const factor = 1.5;
    // This block can be extracted - uses local variables
    const intermediate1 = x * factor + base;
    const intermediate2 = y * factor - base;
    const combined = intermediate1 + intermediate2;
    const adjusted = combined * 0.8;
    return Math.round(adjusted);
}
//# sourceMappingURL=test-extraction.js.map