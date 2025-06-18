#!/usr/bin/env node

/**
 * Pre-commit Hook for Cloudflare Agents
 * 
 * Enforces critical constraints before allowing commits:
 * - No hardcoded secrets
 * - Configuration integrity
 * - Structured logging compliance
 */

const { validateProject } = require('./validate-config.js');
const { execSync } = require('child_process');
const fs = require('fs');

function checkStagedFiles() {
  try {
    const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' })
      .split('\n')
      .filter(file => file.trim() !== '');
    
    return stagedFiles;
  } catch (error) {
    console.error('Failed to get staged files:', error.message);
    return [];
  }
}

function checkStructuredLogging(files) {
  const errors = [];
  const tsFiles = files.filter(file => file.endsWith('.ts') && file.startsWith('src/agents/'));
  
  for (const file of tsFiles) {
    if (!fs.existsSync(file)) continue;
    
    const content = fs.readFileSync(file, 'utf8');
    
    // Check for direct console.log usage in agent files
    if (content.includes('console.log') && !content.includes('StructuredLogger')) {
      errors.push(`${file}: Uses console.log instead of StructuredLogger`);
    }
    
    // Check for StructuredLogger import
    if (content.includes('console.log') && !content.includes('import') && !content.includes('StructuredLogger')) {
      errors.push(`${file}: Missing StructuredLogger import`);
    }
  }
  
  return errors;
}

function main() {
  console.log('🔒 Running pre-commit checks...\n');
  
  const stagedFiles = checkStagedFiles();
  let hasErrors = false;
  
  // Run project validation
  const { errors: configErrors, warnings } = validateProject();
  
  if (configErrors.length > 0) {
    console.log('❌ Configuration errors:');
    for (const error of configErrors) {
      console.log(`   ${error}`);
    }
    hasErrors = true;
  }
  
  // Check structured logging compliance
  const loggingErrors = checkStructuredLogging(stagedFiles);
  if (loggingErrors.length > 0) {
    console.log('❌ Structured logging violations:');
    for (const error of loggingErrors) {
      console.log(`   ${error}`);
    }
    hasErrors = true;
  }
  
  // Check for .dev.vars in staged files
  if (stagedFiles.includes('.dev.vars')) {
    console.log('❌ Attempted to commit .dev.vars file');
    console.log('   This file contains local secrets and must not be committed.');
    hasErrors = true;
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  Warnings (not blocking commit):');
    for (const warning of warnings) {
      console.log(`   ${warning}`);
    }
    console.log();
  }
  
  if (hasErrors) {
    console.log('\n❌ Pre-commit checks failed. Commit blocked.');
    console.log('Fix the above issues and try again.');
    process.exit(1);
  } else {
    console.log('✅ Pre-commit checks passed.');
  }
}

if (require.main === module) {
  main();
}