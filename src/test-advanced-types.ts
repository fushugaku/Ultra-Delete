interface UserProfile {
  id: number;
  name: string;
  email: string;
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
}

type ApiResponse<T> = {
  data: T;
  status: 'success' | 'error';
  message?: string;
};

class AdvancedTypesDemo {
  private userCache = new Map<string, UserProfile>();
  private apiEndpoint: string = 'https://api.example.com';

  // Test 1: Complex generic types
  async processApiResponse<T>(response: Promise<Response>): Promise<ApiResponse<T>> {
    const result = await response;
    const parsed: ApiResponse<T> = await result.json() as ApiResponse<T>;

    // Extract this block - should detect:
    // result: Response, parsed: ApiResponse<T>
    if (parsed.status === 'error') {
      console.error('API Error:', parsed.message);
      throw new Error(parsed.message || 'Unknown API error');
    }

    if (!parsed.data) {
      throw new Error('No data in response');
    }

    return parsed;
  }

  // Test 2: Union types and literal types  
  validateTheme(user: UserProfile, newTheme: 'light' | 'dark' | 'auto'): UserProfile {
    const validThemes: ('light' | 'dark')[] = ['light', 'dark'];
    const currentPrefs = user.preferences;

    // Extract this block - should detect:
    // newTheme: 'light' | 'dark' | 'auto', validThemes: ('light' | 'dark')[], currentPrefs: { theme: 'light' | 'dark'; notifications: boolean; }, user: UserProfile
    if (newTheme === 'auto') {
      const systemTheme: 'light' | 'dark' = 'light'; // simplified
      user.preferences = {
        ...currentPrefs,
        theme: systemTheme
      };
    } else if (validThemes.includes(newTheme as 'light' | 'dark')) {
      user.preferences = {
        ...currentPrefs,
        theme: newTheme as 'light' | 'dark'
      };
    }

    return user;
  }

  // Test 3: Mapped types and utility types
  updateUserPartial(userId: string, updates: Partial<UserProfile>): void {
    const existingUser = this.userCache.get(userId);
    const requiredFields: (keyof UserProfile)[] = ['id', 'name', 'email'];

    // Extract this block - should detect:
    // existingUser: UserProfile | undefined, updates: Partial<UserProfile>, requiredFields: (keyof UserProfile)[]
    if (!existingUser) {
      throw new Error(`User ${userId} not found`);
    }

    for (const field of requiredFields) {
      if (updates[field] === undefined && existingUser[field] === undefined) {
        throw new Error(`Required field ${String(field)} is missing`);
      }
    }

    const updatedUser: UserProfile = {
      ...existingUser,
      ...updates
    } as UserProfile;

    this.userCache.set(userId, updatedUser);
  }

  // Test 4: Function types and callbacks
  processUsersWithCallback(
    users: UserProfile[],
    processor: (user: UserProfile, index: number) => Promise<UserProfile>
  ): Promise<UserProfile[]> {
    const results: Promise<UserProfile>[] = [];
    const batchSize = 5;

    // Extract this block - should detect:
    // users: UserProfile[], processor: (user: UserProfile, index: number) => Promise<UserProfile>, results: Promise<UserProfile>[], batchSize: number
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      for (let j = 0; j < batch.length; j++) {
        const userPromise = processor(batch[j], i + j);
        results.push(userPromise);
      }
    }

    return Promise.all(results);
  }

  // Test 5: Complex object types with methods
  createUserManager(): {
    add: (user: UserProfile) => void;
    remove: (id: string) => boolean;
    find: (predicate: (user: UserProfile) => boolean) => UserProfile | undefined;
    count: () => number;
  } {
    const users: UserProfile[] = [];
    const indexMap = new Map<string, number>();

    // Extract this block - should detect:
    // users: UserProfile[], indexMap: Map<string, number>
    const addUser = (user: UserProfile) => {
      const existingIndex = indexMap.get(user.id.toString());
      if (existingIndex !== undefined) {
        users[existingIndex] = user;
      } else {
        const newIndex = users.length;
        users.push(user);
        indexMap.set(user.id.toString(), newIndex);
      }
    };

    return {
      add: addUser,
      remove: (id: string) => {
        const index = indexMap.get(id);
        if (index !== undefined) {
          users.splice(index, 1);
          indexMap.delete(id);
          return true;
        }
        return false;
      },
      find: (predicate) => users.find(predicate),
      count: () => users.length
    };
  }

  // Test 6: Conditional types and template literals
  formatUserField<K extends keyof UserProfile>(
    user: UserProfile,
    field: K
  ): string {
    const value: UserProfile[K] = user[field];
    const fieldName: string = String(field);

    // Extract this block - should detect:
    // value: UserProfile[K], fieldName: string, field: K
    if (typeof value === 'string') {
      return `${fieldName}: ${value}`;
    } else if (typeof value === 'number') {
      return `${fieldName}: #${value}`;
    } else if (typeof value === 'object' && value !== null) {
      return `${fieldName}: ${JSON.stringify(value)}`;
    }

    return `${fieldName}: ${String(value)}`;
  }

  // Test 7: Array methods with complex return types
  analyzeUserData(users: UserProfile[]): {
    byTheme: Record<'light' | 'dark', UserProfile[]>;
    emailDomains: Map<string, number>;
    statistics: {
      total: number;
      withNotifications: number;
      averageIdLength: number;
    };
  } {
    const byTheme: Record<'light' | 'dark', UserProfile[]> = { light: [], dark: [] };
    const emailDomains = new Map<string, number>();
    const stats = { total: 0, withNotifications: 0, totalIdLength: 0 };

    // Extract this block - should detect:
    // users: UserProfile[], byTheme: Record<'light' | 'dark', UserProfile[]>, emailDomains: Map<string, number>, stats: { total: number; withNotifications: number; totalIdLength: number; }
    for (const user of users) {
      // Group by theme
      byTheme[user.preferences.theme].push(user);

      // Count email domains
      const domain = user.email.split('@')[1];
      if (domain) {
        emailDomains.set(domain, (emailDomains.get(domain) || 0) + 1);
      }

      // Collect statistics
      stats.total++;
      if (user.preferences.notifications) {
        stats.withNotifications++;
      }
      stats.totalIdLength += user.id.toString().length;
    }

    return {
      byTheme,
      emailDomains,
      statistics: {
        total: stats.total,
        withNotifications: stats.withNotifications,
        averageIdLength: stats.total > 0 ? stats.totalIdLength / stats.total : 0
      }
    };
  }
} 