/* ==========================================================
   Visual Novel Engine - POC (vanilla JS)
   ========================================================== */

/* ---------- Settings (localStorage) ---------- */
class Settings {
  static KEY = 'vn_settings_v1';
  static defaults = { music: true, autoplay: false };

  static load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
    } catch { return { ...this.defaults }; }
  }
  static save(s) { localStorage.setItem(this.KEY, JSON.stringify(s)); }
}

/* ---------- Screen Manager ---------- */
class ScreenManager {
  constructor() {
    this.screens = {
      title:    document.getElementById('screen-title'),
      settings: document.getElementById('screen-settings'),
      credits:  document.getElementById('screen-credits'),
      game:     document.getElementById('screen-game'),
    };
  }
  show(name) {
    Object.entries(this.screens).forEach(([k, el]) => {
      el.classList.toggle('hidden', k !== name);
    });
  }
}

/* ---------- Visual Novel Engine ---------- */
class VNEngine {
  constructor(data, settings) {
    this.data = data;
    this.settings = settings;

    this.bg            = document.getElementById('background');
    this.envOverlay    = document.getElementById('env-overlay');
    this.envLabel      = document.getElementById('env-overlay-label');
    this.spriteLeft    = document.getElementById('sprite-left');
    this.spriteRight   = document.getElementById('sprite-right');
    this.dialogueBox   = document.getElementById('dialogue-box');
    this.dialogueText  = document.getElementById('dialogue-text');
    this.dialogueHint  = document.getElementById('dialogue-hint');
    this.nameTagLeft   = document.getElementById('name-tag-left');
    this.nameTagRight  = document.getElementById('name-tag-right');
    this.choicePanel   = document.getElementById('choice-panel');
    this.choiceQuestion= document.getElementById('choice-question');
    this.choiceOptions = document.getElementById('choice-options');

    this.currentScene  = null;
    this.actionIndex   = 0;
    this.busy          = false;
    this.autoplayTimer = null;
    this.inputHandler  = null;
  }

  /* ---- lifecycle ---- */
  start() {
    this.resetUI();
    this.goToScene(this.data.start_scene);
    this.bindInput();
  }

  stop() {
    this.unbindInput();
    this.clearAutoplay();
    this.resetUI();
  }

  resetUI() {
    this.dialogueBox.classList.add('hidden');
    this.choicePanel.classList.add('hidden');
    this.spriteLeft.classList.add('hidden');
    this.spriteRight.classList.add('hidden');
    this.nameTagLeft.classList.add('hidden');
    this.nameTagRight.classList.add('hidden');
    this.bg.classList.remove('blur-dark');
    this.spriteLeft.classList.remove('blur-dark');
    this.spriteRight.classList.remove('blur-dark');
    this.envOverlay.classList.add('hidden');
  }

  /* ---- input ---- */
  bindInput() {
    this.inputHandler = (e) => {
      if (e.type === 'keydown' && e.code !== 'Space') return;
      if (this.busy) return;
      if (!this.choicePanel.classList.contains('hidden')) return;
      e.preventDefault?.();
      this.advance();
    };
    document.addEventListener('keydown', this.inputHandler);
    this.dialogueBox.addEventListener('click', this.inputHandler);
  }
  unbindInput() {
    document.removeEventListener('keydown', this.inputHandler);
    this.dialogueBox.removeEventListener('click', this.inputHandler);
  }

  /* ---- scene flow ---- */
  goToScene(sceneId) {
    const scene = this.data.scenes[sceneId];
    if (!scene) { console.warn('Scene not found:', sceneId); return; }
    this.currentScene = scene;
    this.actionIndex = 0;
    this.advance();
  }

  advance() {
    this.clearAutoplay();
    if (!this.currentScene) return;
    if (this.actionIndex >= this.currentScene.actions.length) return;

    const action = this.currentScene.actions[this.actionIndex++];
    this.runAction(action);
  }

  async runAction(action) {
    switch (action.type) {
      case 'transition':  await this.actTransition(action);  break;
      case 'dialogue':    this.actDialogue(action);          break;
      case 'choice':      this.actChoice(action);            break;
      case 'goto':        this.goToScene(action.scene);      break;
      case 'end':         this.actEnd();                     break;
      default:
        console.warn('Unknown action type:', action.type);
        this.advance();
    }
  }

  /* ---- action: transition ---- */
  actTransition(action) {
    return new Promise(resolve => {
      this.busy = true;
      this.dialogueBox.classList.add('hidden');
      this.spriteLeft.classList.add('hidden');
      this.spriteRight.classList.add('hidden');

      const env = this.data.environments[action.environment];
      if (!env) { this.busy = false; resolve(); this.advance(); return; }

      this.envLabel.textContent = env.label;
      this.envOverlay.classList.remove('hidden');

      setTimeout(() => {
        this.bg.style.background = env.color || '#333';
        this.envOverlay.classList.add('hidden');
        this.busy = false;
        resolve();
        this.advance();
      }, 2000);
    });
  }

  /* ---- action: dialogue ---- */
  actDialogue(action) {
    const char = this.data.characters[action.character];
    if (!char) { this.advance(); return; }

    const text  = action.text;
    const name  = char.name;
    const align = char.align === 'right' ? 'right' : 'left';

    const speakerSprite = align === 'left' ? this.spriteLeft  : this.spriteRight;
    const otherSprite   = align === 'left' ? this.spriteRight : this.spriteLeft;

    speakerSprite.classList.remove('hidden');
    speakerSprite.style.background = char.color || '#888';
    speakerSprite.classList.add('active');
    speakerSprite.classList.remove('inactive');

    if (!otherSprite.classList.contains('hidden')) {
      otherSprite.classList.add('inactive');
      otherSprite.classList.remove('active');
    }

    this.nameTagLeft.classList.toggle('hidden', align !== 'left');
    this.nameTagRight.classList.toggle('hidden', align !== 'right');
    if (align === 'left')  this.nameTagLeft.textContent  = name;
    else                   this.nameTagRight.textContent = name;

    this.dialogueBox.classList.remove('hidden');
    this.dialogueText.textContent = text;

    if (this.settings.autoplay) {
      const delay = Math.max(1500, text.length * 50);
      this.autoplayTimer = setTimeout(() => this.advance(), delay);
    }
  }

  /* ---- action: choice ---- */
  actChoice(action) {
    this.bg.classList.add('blur-dark');
    this.spriteLeft.classList.add('blur-dark');
    this.spriteRight.classList.add('blur-dark');
    this.dialogueBox.classList.add('hidden');

    this.choiceQuestion.textContent = action.question;
    this.choiceOptions.innerHTML = '';

    action.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'choice choice-btn';
      btn.textContent = opt.text;
      btn.addEventListener('click', () => this.resolveChoice(opt));
      this.choiceOptions.appendChild(btn);
    });

    this.choicePanel.classList.remove('hidden');
  }

  resolveChoice(opt) {
    this.choicePanel.classList.add('hidden');
    this.bg.classList.remove('blur-dark');
    this.spriteLeft.classList.remove('blur-dark');
    this.spriteRight.classList.remove('blur-dark');

    if (opt.goto) this.goToScene(opt.goto);
    else this.advance();
  }

  /* ---- action: end ---- */
  actEnd() {
    this.dialogueText.textContent = '— FIN —';
    this.dialogueBox.classList.remove('hidden');
  }

  clearAutoplay() {
    if (this.autoplayTimer) {
      clearTimeout(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }
}

/* ---------- App Bootstrap ---------- */
class App {
  constructor() {
    this.settings = Settings.load();
    this.screens  = new ScreenManager();
    this.engine   = null;
    this.data     = null;
  }

  async init() {
    try {
      const [environments, dialogues] = await Promise.all([
        fetch('./environments.json').then(r => r.json()),
        fetch('./dialogues.json').then(r => r.json()),
      ]);
      this.data = { ...dialogues, environments };
    } catch (err) {
      console.error('Failed to load data files', err);
      alert('Impossible de charger environments.json ou dialogues.json. Utilisez un serveur HTTP.');
      return;
    }

    this.bindMenu();
    this.bindSettings();
    this.screens.show('title');
  }

  bindMenu() {
    const titleScreen = document.getElementById('screen-title');
    const defaultBg = "url('images/titlescreen.png')";

    document.querySelectorAll('.menu [data-action]').forEach(btn => {
      // Background swap on hover
      btn.addEventListener('mouseenter', () => {
        const action = btn.dataset.action;
        let bg = defaultBg;
        if (action === 'settings') bg = "url('images/titlescreen-settings.png')";
        else if (action === 'credits') bg = "url('images/titlescreen-credits.png')";
        titleScreen.style.setProperty('--title-bg', bg);
      });

      /* No reset on mouseleave to keep the last hovered background visible */
      /* btn.addEventListener('mouseleave', () => {
        titleScreen.style.setProperty('--title-bg', defaultBg);
      }); */

      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if      (a === 'play')       {
          this.confirm(
            "LANCER LA PARTIE", 
            "Vous pouvez quitter à tout moment, mais notez qu'aucune sauvegarde n'est disponible. Toute progression sera perdue à la fermeture. Êtes-vous prêt à commencer l'aventure ?", 
            () => this.startGame()
          );
        }
        else if (a === 'settings')   this.screens.show('settings');
        else if (a === 'credits')    this.screens.show('credits');
        else if (a === 'back-title') this.goToTitle();
      });
    });

    // Handle back buttons (they can also be found elsewhere)
    document.querySelectorAll(':not(.menu) [data-action="back-title"]').forEach(btn => {
      btn.addEventListener('click', () => this.goToTitle());
    });
  }

  bindSettings() {
    const musicBtn = document.getElementById('toggle-music');
    const autoBtn  = document.getElementById('toggle-autoplay');

    const refresh = () => {
      musicBtn.textContent = this.settings.music    ? 'ON' : 'OFF';
      autoBtn.textContent  = this.settings.autoplay ? 'ON' : 'OFF';
    };

    musicBtn.addEventListener('click', () => {
      this.settings.music = !this.settings.music;
      Settings.save(this.settings); refresh();
    });
    autoBtn.addEventListener('click', () => {
      this.settings.autoplay = !this.settings.autoplay;
      Settings.save(this.settings); refresh();
    });

    refresh();
  }

  startGame() {
    this.screens.show('game');
    this.engine = new VNEngine(this.data, this.settings);
    this.engine.start();
  }

  goToTitle() {
    if (this.engine) { this.engine.stop(); this.engine = null; }
    this.screens.show('title');
  }

  /* ---- confirmation popup ---- */
  confirm(title, body, onConfirm) {
    const popup = document.getElementById('screen-popup');
    const titleEl = document.getElementById('popup-title');
    const bodyEl = document.getElementById('popup-body');
    const confirmBtn = document.getElementById('popup-confirm');
    const cancelBtn = document.getElementById('popup-cancel');

    titleEl.textContent = title;
    bodyEl.textContent = body;
    popup.classList.remove('hidden');

    const close = () => {
      popup.classList.add('hidden');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => { close(); onConfirm(); };
    cancelBtn.onclick = () => { close(); };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App().init();
});
