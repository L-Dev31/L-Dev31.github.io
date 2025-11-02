/**
 * Main entry point - Simplified following AeonMSBT architecture
 */

import './state.js';
import './utils.js';
import './bmg-format.js';
import './ui.js';
import './io.js';

import { init } from './ui.js';

// Initialize UI when DOM is ready
document.addEventListener('DOMContentLoaded', init);
