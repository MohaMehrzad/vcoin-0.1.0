// Test for handleError function with 100% coverage

// Mock process.exit to prevent tests from exiting
const originalExit = process.exit;
process.exit = jest.fn();

// Mock console.error to prevent output
console.error = jest.fn();

// Import the function to test
const { handleError } = require('./create-token-functions.js');

describe('handleError', () => {
  // Save original NODE_ENV
  const originalNodeEnv = process.env.NODE_ENV;
  
  afterEach(() => {
    // Reset mocks and env variables after each test
    jest.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });
  
  afterAll(() => {
    // Restore process.exit after all tests
    process.exit = originalExit;
    console.error = console.error; // Restore console.error
  });
  
  test('should throw error when NODE_ENV is test', () => {
    // Set NODE_ENV to test
    process.env.NODE_ENV = 'test';
    
    const errorMsg = 'Test error message';
    const error = new Error('Test error');
    
    // Function should throw when NODE_ENV is test
    expect(() => handleError(errorMsg, error)).toThrow(error);
    
    // Verify console.error was called
    expect(console.error).toHaveBeenCalledWith(errorMsg, error);
    
    // Verify process.exit was not called
    expect(process.exit).not.toHaveBeenCalled();
  });
  
  test('should throw default error when error is not provided', () => {
    // Set NODE_ENV to test
    process.env.NODE_ENV = 'test';
    
    const errorMsg = 'Test error message';
    
    // Function should throw a new error with the message when error is not provided
    expect(() => handleError(errorMsg)).toThrow(errorMsg);
    
    // Verify console.error was called
    expect(console.error).toHaveBeenCalledWith(errorMsg, undefined);
    
    // Verify process.exit was not called
    expect(process.exit).not.toHaveBeenCalled();
  });
  
  test('should call process.exit(1) when NODE_ENV is not test', () => {
    // Set NODE_ENV to something other than test
    process.env.NODE_ENV = 'production';
    
    const errorMsg = 'Production error message';
    
    // Call the function
    handleError(errorMsg);
    
    // Verify console.error was called
    expect(console.error).toHaveBeenCalledWith(errorMsg, undefined);
    
    // Verify process.exit was called with 1
    expect(process.exit).toHaveBeenCalledWith(1);
  });
}); 