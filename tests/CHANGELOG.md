# Test System Changelog

## 2025-04-25

### Fixed

- Server health check improved to handle both IPv4 (127.0.0.1) and IPv6 (::1) localhost addresses
- Added more robust server detection in API tests
- Fixed health check endpoint detection in run-api-tests.js
- Improved error handling in server startup
- Added --no-ts-check option to run simplified tests without TypeScript conflicts
- Added documentation for testing approach

### Added

- Support for skipping TypeScript validation on API tests
- Simplified health check testing for basic API validation
- Created reflect-metadata.js for simplified test setup
- Added comprehensive README for tests directory
- More detailed error reporting in test script

### Changed

- Updated IPv4/IPv6 detection in all test scripts
- Improved waitOn handling to try multiple addresses
- Modified test error handling to provide more context
- Enhanced server process management for Windows compatibility
- Updated command-line arguments handling for test scripts 