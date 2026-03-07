import { test, expect } from '@playwright/test';

// Helper function to get CSRF token
async function getCsrfToken(page) {
  const response = await page.request.get('/api/csrf-token');
  const data = await response.json();
  return data.token;
}

test.describe('RedAlert Smoke Tests', () => {
  
  test('Config panel loads and displays correctly', async ({ page }) => {
    // Navigate to config page
    await page.goto('/');
    
    // Check page title
    await expect(page).toHaveTitle('RedAlert - Settings');
    
    // Check main heading exists
    const heading = page.locator('.nd-title');
    await expect(heading).toContainText('RedAlert');
  });

  test('Config panel shows all sections', async ({ page }) => {
    await page.goto('/');
    
    // Check all major sections exist
    const sections = [
      'Monitored Areas',
      'Poll Interval',
      'Alert Actions',
      'News Feed URL',
      'Alert Cooldown',
      'Alert History'
    ];

    for (const section of sections) {
      const sectionElement = page.locator(`:text("${section}")`);
      await expect(sectionElement).toBeVisible();
    }
  });

  test('Load configuration via API', async ({ page }) => {
    // Get config from API
    const response = await page.request.get('/api/config');
    expect(response.ok()).toBeTruthy();
    
    const config = await response.json();
    
    // Verify config structure
    expect(config).toHaveProperty('areas');
    expect(config).toHaveProperty('pollInterval');
    expect(config).toHaveProperty('alertActions');
    expect(config).toHaveProperty('browserUrl');
    expect(config).toHaveProperty('alertCooldown');
    expect(config).toHaveProperty('configPort');
  });

  test('Save configuration', async ({ page }) => {
    await page.goto('/');
    
    // Fill in test data
    await page.fill('#browserUrl', 'https://www.example.com/');
    
    // Click save button
    await page.click('#saveBtn');
    
    // Wait for success message
    const toast = page.locator('text=Settings saved');
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('Validate poll interval options exist', async ({ page }) => {
    await page.goto('/');
    
    const intervals = ['3s', '5s', '10s', '15s', '30s'];
    
    for (const interval of intervals) {
      const radio = page.getByText(interval, { exact: true });
      await expect(radio).toBeVisible();
    }
  });

  test('Validate alert actions checkboxes', async ({ page }) => {
    await page.goto('/');
    
    const actions = ['Open Browser', 'Desktop Notification', 'Alert Sound'];
    
    for (const action of actions) {
      const toggle = page.locator(`text=${action}`);
      await expect(toggle).toBeVisible();
    }
  });

  test('Trigger test alert', async ({ page }) => {
    await page.goto('/');
    
    // Click test alert button
    const testBtn = page.locator('#testBtn');
    await expect(testBtn).toBeVisible();
    await testBtn.click();
    
    // Wait for success message
    const toast = page.locator('text=Test alert triggered');
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('Get alert history via API', async ({ page }) => {
    const response = await page.request.get('/api/history');
    expect(response.ok()).toBeTruthy();
    
    const history = await response.json();
    expect(Array.isArray(history)).toBeTruthy();
  });

  test('Get alert status via API', async ({ page }) => {
    const response = await page.request.get('/api/alert-status');
    expect(response.ok()).toBeTruthy();
    
    const status = await response.json();
    
    // Verify status structure
    expect(status).toHaveProperty('active');
    expect(status).toHaveProperty('areas');
    expect(status).toHaveProperty('title');
  });

  test('Validate input - empty areas saved', async ({ page }) => {
    await page.goto('/');
    
    // Clear areas and save
    await page.fill('#areas', '');
    await page.click('#saveBtn');
    
    // Verify success
    const toast = page.locator('text=Settings saved');
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('Config panel has footer', async ({ page }) => {
    await page.goto('/');
    
    const footer = page.locator('.nd-footer');
    await expect(footer).toContainText('RedAlert');
  });

  test('Refresh history button works', async ({ page }) => {
    await page.goto('/');
    
    const refreshBtn = page.locator('#refreshHistory');
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    
    // Wait for history to load
    await page.waitForTimeout(500);
  });

  test('Browser URL accepts valid HTTPS', async ({ page }) => {
    await page.goto('/');
    
    const urls = [
      'https://www.n12.co.il/',
      'https://www.bbc.com/',
      'https://example.com'
    ];

    for (const url of urls) {
      await page.fill('#browserUrl', url);
      await page.click('#saveBtn');
      
      const toast = page.locator('text=Settings saved');
      await expect(toast).toBeVisible({ timeout: 5000 });
    }
  });

  test('API config endpoint validates input', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    
    // Try invalid pollInterval
    const response = await page.request.post('/api/config', {
      headers: {
        'x-csrf-token': csrfToken
      },
      data: {
        areas: ['Test'],
        pollInterval: 100, // Too low
        alertActions: { openBrowser: true, notification: true, sound: true },
        browserUrl: 'https://example.com',
        alertCooldown: 60000
      }
    });

    // Should return 400 error
    expect(response.status()).toBe(400);
  });

  test('API config endpoint accepts valid input', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    
    const response = await page.request.post('/api/config', {
      headers: {
        'x-csrf-token': csrfToken
      },
      data: {
        areas: ['תל אביב'],
        pollInterval: 5000,
        alertActions: { openBrowser: true, notification: true, sound: true },
        browserUrl: 'https://www.n12.co.il/',
        alertCooldown: 60000
      }
    });

    expect(response.ok()).toBeTruthy();
    const config = await response.json();
    expect(config.areas).toContain('תל אביב');
  });

  test('Alert view page accessible', async ({ page }) => {
    const response = await page.request.get('/alert-view.html');
    expect(response.ok()).toBeTruthy();
  });

  test('Static assets are served', async ({ page }) => {
    const assets = [
      '/style.css',
      '/app.js',
      '/alert-view.html'
    ];

    for (const asset of assets) {
      const response = await page.request.get(asset);
      expect(response.ok()).toBeTruthy();
    }
  });
});
