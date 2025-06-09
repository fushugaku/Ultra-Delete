class UserService {
  private apiUrl: string;
  private timeout: number;

  constructor(apiUrl: string, timeout: number = 5000) {
    this.apiUrl = apiUrl;
    this.timeout = timeout;
  }

  async fetchUserData(userId: string): Promise<any> {
    const headers = { 'Content-Type': 'application/json' };

    // This block can be extracted to a private method
    // It uses this.apiUrl and this.timeout (class properties)
    const url = `${this.apiUrl}/users/${userId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  validateUser(userData: any): boolean {
    // This block can be extracted to a private method
    // It's a pure validation function
    if (!userData || typeof userData !== 'object') {
      return false;
    }

    const requiredFields = ['id', 'email', 'name'];
    for (const field of requiredFields) {
      if (!userData[field] || typeof userData[field] !== 'string') {
        return false;
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      return false;
    }

    return true;
  }

  async updateUserProfile(userId: string, updates: any): Promise<any> {
    const currentData = await this.fetchUserData(userId);

    // This block can be extracted to a private method
    // It merges data and validates
    const mergedData = { ...currentData, ...updates };

    if (!this.validateUser(mergedData)) {
      throw new Error('Invalid user data after merge');
    }

    mergedData.updatedAt = new Date().toISOString();

    // This block can be extracted to a private method  
    // It handles the API call with error handling
    const url = `${this.apiUrl}/users/${userId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mergedData)
    });

    if (!response.ok) {
      throw new Error(`Failed to update user: ${response.statusText}`);
    }

    return await response.json();
  }

  private logActivity(action: string, userId: string): void {
    const timestamp = new Date().toISOString();

    // This block can be extracted to a private method
    // It formats and outputs log messages
    const message = `[${timestamp}] ${action.toUpperCase()}: User ${userId}`;
    const level = action.includes('error') ? 'ERROR' : 'INFO';
    const formatted = `${level} - ${message}`;

    if (level === 'ERROR') {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }
} 