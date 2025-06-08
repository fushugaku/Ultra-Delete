"use strict";
class TestClass {
    constructor(name) {
        this.name = name;
    }
    getName() {
        return this.name;
    }
    setName(newName) {
        this.name = newName;
    }
    greet() {
        return `Hello, ${this.name}!`;
    }
}
function processUser(user) {
    return `Processing user: ${user.username}`;
}
const userService = {
    createUser(userData) {
        return { ...userData, id: Date.now() };
    },
    updateUser(id, updates) {
        // Mock implementation
        return { id, username: '', email: '', isActive: true, ...updates };
    },
    deleteUser(id) {
        // Mock implementation
        return true;
    }
};
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "admin";
    UserRole["USER"] = "user";
    UserRole["MODERATOR"] = "moderator";
})(UserRole || (UserRole = {}));
//# sourceMappingURL=test-navigation.js.map