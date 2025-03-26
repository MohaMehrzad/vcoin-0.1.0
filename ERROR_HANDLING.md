# Standardized Error Handling in VCoin

This document outlines the standardized approach to error handling implemented throughout the VCoin codebase.

## Custom Error Classes

The codebase uses a set of specialized error classes that extend the base `VCoinError` class. Each error class is designed for specific types of errors:

- **`ValidationError`**: For validation failures, invalid inputs, or format issues
- **`SecurityError`**: For security-related issues like unauthorized access or signature verification failures
- **`AuthorizationError`**: For permission-related issues
- **`FileOperationError`**: For file system operation failures
- **`BalanceError`**: For token balance issues
- **`TransactionError`**: For blockchain transaction failures

Each error includes:
- A descriptive message
- An error code
- Optional metadata

## Standard Error Handling with `handleError`

The `handleError` function provides a standardized way to handle errors across the application:

```typescript
handleError(error, shouldExit, context)
```

Parameters:
- `error`: The error object or message string
- `shouldExit`: Boolean indicating whether to exit the process
- `context`: String identifying where the error occurred

### Error Handling Behavior

The `handleError` function:

1. Logs different information based on the environment:
   - **Production**: Minimal information for security and privacy
   - **Development**: Full details including stack traces
   
2. Includes context information for better tracking

3. Can terminate the process if the error is critical

## Best Practices

1. **Always use custom error classes** when throwing errors
   ```typescript
   throw new ValidationError('Invalid input', 'INVALID_INPUT');
   ```

2. **Use handleError for consistent reporting**
   ```typescript
   try {
     // Operation that might fail
   } catch (error: any) {
     handleError(error, false, 'moduleName:functionName');
   }
   ```

3. **Include error codes** for easier programmatic handling
   ```typescript
   throw new SecurityError('Signature verification failed', 'INVALID_SIGNATURE');
   ```

4. **Add metadata for contextual information** when relevant
   ```typescript
   throw new TransactionError(
     'Transaction failed', 
     'TX_FAILURE',
     { txId: '123', block: 5000 }
   );
   ```

5. **Properly propagate errors** when they should be handled at a higher level
   ```typescript
   try {
     // operation
   } catch (error: any) {
     if (error instanceof ValidationError) {
       // Handle validation error
     } else {
       // Propagate other errors
       throw error;
     }
   }
   ```

## Production vs Development Handling

In production environments, error information is minimized to prevent information disclosure:
- Full stack traces are not displayed
- Error details are logged appropriately
- Critical security errors always terminate the process

In development environments, more information is provided:
- Full stack traces
- Detailed error information
- Helpful debugging information 