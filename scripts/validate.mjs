import { loadConfig, assertZineConfigSync } from './lib/config.mjs';

const config = loadConfig();
assertZineConfigSync(config);
console.log('notizine configuration is valid');
