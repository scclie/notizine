import { loadConfig, syncZineConfig } from './lib/config.mjs';

const changed = syncZineConfig(loadConfig());
console.log(changed ? 'updated zine.ziggy' : 'zine.ziggy already synchronized');
