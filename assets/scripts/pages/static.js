import './components.js';
import { initPage } from './common.js';
import { thread, restDocks } from './showcase.js';

initPage();
thread(restDocks());
