# RedAlert Smoke Tests

Comprehensive smoke tests for RedAlert using Playwright.

## Overview

The test suite covers:
- ✅ Config panel loads and displays correctly
- ✅ All configuration sections visible
- ✅ Configuration API endpoints work
- ✅ Settings can be saved and loaded
- ✅ Test alerts can be triggered
- ✅ Alert history is accessible
- ✅ Input validation works
- ✅ Static assets are served
- ✅ API endpoints validate input

## Installation

```bash
npm install
```

Tests automatically start the RedAlert server on `http://localhost:3847`.

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests with UI (recommended for debugging)
```bash
npm run test:ui
```

### Run tests in debug mode
```bash
npm run test:debug
```

### View test report
```bash
npm run test:report
```

## Test Structure

**File:** `tests/smoke.spec.js`

### Test Categories

#### 1. **UI Rendering**
- Config panel loads with correct title
- All sections visible (Areas, Poll Interval, Alert Actions, etc.)
- Buttons and controls accessible

#### 2. **Configuration**
- Load config via `/api/config`
- Save configuration with validation
- Poll interval options available
- Alert actions can be toggled

#### 3. **Alerts**
- Trigger test alert
- Get alert history via `/api/history`
- Get alert status via `/api/alert-status`

#### 4. **Validation**
- Poll interval validation (1000-60000ms required)
- Browser URL must be HTTPS
- Areas array limited to 50 items

#### 5. **API**
- Config endpoint returns valid JSON
- Invalid input returns 400 status
- Static assets served correctly

## Configuration

**File:** `playwright.config.js`

- **Browser:** Chromium
- **Timeout:** 2 minutes for server startup
- **Trace:** Captured on first retry
- **Workers:** Sequential (1) to avoid conflicts

## Debugging

### View detailed error trace
```bash
npm run test:debug
```

### Slow down execution
Edit `playwright.config.js`:
```javascript
use: {
  slowMo: 1000, // milliseconds
}
```

### Inspect specific test
```bash
npx playwright test tests/smoke.spec.js -g "specific test name"
```

## CI/CD Integration

For GitHub Actions or similar CI:

```yaml
- name: Run smoke tests
  run: npm test
```

Tests will run with:
- `CI=true` (headless, no UI)
- Retries enabled (2)
- Sequential execution

## Test Results

After running tests:
- **HTML Report:** `playwright-report/index.html`
- **Test Results:** `test-results/`
- **Screenshots/Videos:** Captured on failure

View the report:
```bash
npm run test:report
```

## Known Issues

None currently.

## Adding New Tests

1. Open `tests/smoke.spec.js`
2. Add test inside the `test.describe` block:

```javascript
test('My new test', async ({ page }) => {
  await page.goto('/');
  // Your test code
});
```

3. Run with `npm test`

## Requirements

- Node.js 18+
- Windows/Linux/macOS
- Chromium browser (installed automatically by Playwright)

## Troubleshooting

### "Port 3847 already in use"
Kill any existing RedAlert process:
```bash
Get-Process node | Stop-Process
```

### "Tests timeout after 2 minutes"
The app may be slow to start. Increase timeout in `playwright.config.js`:
```javascript
webServer: {
  timeout: 180 * 1000, // 3 minutes
}
```

### "Chrome fails to launch"
Ensure Chromium is installed:
```bash
npx playwright install chromium
```
