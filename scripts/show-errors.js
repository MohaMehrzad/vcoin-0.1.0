#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper function to color text
function colorize(text, color) {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    gray: '\x1b[90m',
    reset: '\x1b[0m'
  };
  
  return `${colors[color]}${text}${colors.reset}`;
}

try {
  console.log(colorize('Running TypeScript type checker...\n', 'blue'));

  // Run tsc and capture the output
  let output;
  try {
    output = execSync('npx tsc --noEmit', { encoding: 'utf8' });
  } catch (error) {
    output = error.stdout;
  }

  // Parse the output
  const errors = [];
  
  // Regular expression to parse tsc error output
  const regex = /^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/gm;
  let match;
  
  while ((match = regex.exec(output)) !== null) {
    const [_, filePath, line, column, errorCode, message] = match;
    
    const fileName = path.basename(filePath);
    
    errors.push({
      filePath,
      fileName,
      line: parseInt(line),
      column: parseInt(column),
      errorCode,
      message
    });
  }

  // Group errors by file
  const errorsByFile = {};
  
  errors.forEach(error => {
    if (!errorsByFile[error.filePath]) {
      errorsByFile[error.filePath] = [];
    }
    errorsByFile[error.filePath].push(error);
  });
  
  // Print errors in a readable format
  if (Object.keys(errorsByFile).length === 0) {
    console.log(colorize('No TypeScript errors found! 🎉', 'green'));
  } else {
    console.log(colorize(`Found ${errors.length} TypeScript errors in ${Object.keys(errorsByFile).length} files:\n`, 'red'));
    
    Object.entries(errorsByFile).forEach(([filePath, fileErrors]) => {
      console.log(colorize(`File: ${filePath}`, 'yellow'));
      
      // Try to read the file content
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');
        
        fileErrors.forEach(error => {
          console.log(colorize(`  Line ${error.line}, Column ${error.column}: ${error.errorCode}: ${error.message}`, 'red'));
          
          // Show the code context (3 lines before and after the error)
          const startLine = Math.max(0, error.line - 4);
          const endLine = Math.min(lines.length - 1, error.line + 2);
          
          console.log(colorize('\n  Code context:', 'gray'));
          
          for (let i = startLine; i <= endLine; i++) {
            const lineNum = i + 1;
            const prefix = lineNum === error.line ? colorize('> ', 'red') : '  ';
            const lineNumStr = colorize(`${prefix}${lineNum.toString().padStart(4)}: `, 'gray');
            const codeLine = lineNum === error.line ? colorize(lines[i], 'red') : colorize(lines[i], 'gray');
            console.log(lineNumStr + codeLine);
          }
          
          console.log('');
        });
      } catch (err) {
        console.log(colorize(`  Could not read file content: ${err.message}`, 'red'));
      }
      
      console.log('');
    });
    
    console.log(colorize(`Total: ${errors.length} errors in ${Object.keys(errorsByFile).length} files`, 'red'));
  }
} catch (error) {
  console.error('Error running the script:', error);
  process.exit(1);
} 