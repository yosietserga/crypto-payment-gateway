// This file is used when running tests without the TypeScript setup file
// It simply loads the reflect-metadata module which is required for TypeORM

require('reflect-metadata');

// No jest mocks here - they need to be defined inside the test files
console.log('Reflect metadata loaded'); 