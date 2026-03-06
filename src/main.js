import { loadConfig } from './configManager.js';

const config = loadConfig();
console.log('Config loaded:', JSON.stringify(config, null, 2));
