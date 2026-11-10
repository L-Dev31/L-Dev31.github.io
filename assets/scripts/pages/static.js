import '../core/components.js';
import { initPage } from '../core/common.js';
import { thread, restDocks } from '../blocks/showcase.js';

initPage();
thread(restDocks());
