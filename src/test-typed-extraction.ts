interface User {
  id: number;
  name: string;
  email: string;
}

class TypedExtractionDemo {
  private users: User[] = [];
  private apiUrl: string = 'https://api.example.com';

  // Test 1: Properly typed parameters from explicit declarations
  processUserData(userData: User[], threshold: number): User[] {
    const results: User[] = [];
    const startTime = Date.now();

    // Extract this block - should have typed parameters:
    // userData: User[], threshold: number, results: User[], startTime: number
    for (const user of userData) {
      if (user.id > threshold) {
        const processedUser = {
          ...user,
          email: user.email.toLowerCase(),
          name: user.name.trim()
        };
        results.push(processedUser);
      }
    }

    console.log(`Processed in ${Date.now() - startTime}ms`);
    return results;
  }

  // Test 2: Inferred types from initializers
  validateAndSanitize(input: string): string {
    const trimmed = input.trim();
    const minLength = 3; // should infer as number
    const maxLength = 50; // should infer as number
    const allowedChars = /^[a-zA-Z0-9\s]+$/; // should infer as RegExp

    // Extract this block - should detect types:
    // trimmed: string, minLength: number, maxLength: number, allowedChars: RegExp
    if (trimmed.length < minLength || trimmed.length > maxLength) {
      throw new Error(`Invalid length: must be between ${minLength} and ${maxLength}`);
    }

    if (!allowedChars.test(trimmed)) {
      throw new Error('Invalid characters detected');
    }

    return trimmed;
  }

  // Test 3: Class properties should be accessed via 'this', not parameters
  async fetchUserProfile(userId: number): Promise<User | null> {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer token'
    });

    // Extract this block - should NOT include this.apiUrl as parameter
    // Should only have: userId: number, headers: Headers
    const url = `${this.apiUrl}/users/${userId}`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json() as User;
  }

  // Test 4: Complex object types
  mergeUserData(primary: User, secondary: Partial<User>): User {
    const timestamp = new Date(); // should infer as Date
    const metadata = { updated: true, version: 1 }; // should infer object type

    // Extract this block - should have proper types:
    // primary: User, secondary: Partial<User>, timestamp: Date, metadata: { updated: boolean, version: number }
    const merged = {
      ...primary,
      ...secondary,
      updatedAt: timestamp.toISOString(),
      metadata: {
        ...metadata,
        updatedBy: 'system'
      }
    };

    return merged as User;
  }

  // Test 5: Array types and complex objects
  formatUserList(): string[] {
    const formatted: string[] = []; // should infer as string[]
    const template = 'User: {name} - {email}'; // should infer as string

    // Extract this block - should detect types:
    // formatted: string[], template: string
    for (const user of this.users) {
      const userString = template
        .replace('{name}', user.name)
        .replace('{email}', user.email);

      formatted.push(userString);
    }

    return formatted;
  }

  // Test 6: Function parameters and return values
  calculateStats(data: number[]): { sum: number; average: number; count: number } {
    let sum = 0; // should infer as number
    let count = 0; // should infer as number

    // Extract this block - should return sum and count:
    // Parameters: data: number[]
    // Return: { sum: number, count: number }
    for (const value of data) {
      sum += value;
      count++;
    }

    const average = count > 0 ? sum / count : 0;
    return { sum, average, count };
  }

  // Test 7: Promise and async types
  async processAsyncData(urls: string[]): Promise<any[]> {
    const results: any[] = []; // should infer as any[]
    const concurrency = 3; // should infer as number

    // Extract this block - should handle Promise types:
    // urls: string[], results: any[], concurrency: number
    const chunks: string[][] = [];
    for (let i = 0; i < urls.length; i += concurrency) {
      chunks.push(urls.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(url => fetch(url).then(r => r.json()));
      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }

    return results;
  }
} 