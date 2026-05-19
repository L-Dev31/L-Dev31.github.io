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

/* ---------- Visual Novel Engine — location-based ---------- */
class VNEngine {
  constructor(data, settings) {
    this.data     = data;
    this.settings = settings;

    this.bg           = document.getElementById('background');
    this.envOverlay   = document.getElementById('env-overlay');
    this.envLabel     = document.getElementById('env-overlay-label');
    this.spriteLeft   = document.getElementById('sprite-left');
    this.spriteRight  = document.getElementById('sprite-right');
    this.dialogueBox  = document.getElementById('dialogue-box');
    this.dialogueText = document.getElementById('dialogue-text');
    this.dialogueHint = document.getElementById('dialogue-hint');
    this.nameTagLeft  = document.getElementById('name-tag-left');
    this.nameTagRight = document.getElementById('name-tag-right');
    this.choicePanel  = document.getElementById('choice-panel');
    this.choiceOptions= document.getElementById('choice-options');

    this.currentLocation  = null;
    this.visitedLocations = new Set();
    this._nextAction      = null;
    this.busy             = false;
    this.autoplayTimer    = null;
    this.typewriterTimer  = null;
    this.typing           = false;
    this._currentText     = '';
    this.inputHandler     = null;
    this.flags            = {};
  }

  /* ---- lifecycle ---- */
  start() {
    this.resetUI();
    this.bindInput();
    this.goToLocation(this.data.game_settings?.start_location || this.data.start_location);
  }

  stop() {
    this.unbindInput();
    this.clearAutoplay();
    this.clearTypewriter();
    this.resetUI();
  }

  resetUI() {
    this.dialogueBox.classList.add('hidden');
    this.dialogueHint.classList.add('hidden');
    this.choicePanel.classList.add('hidden');
    this.spriteLeft.classList.add('hidden');
    this.spriteRight.classList.add('hidden');
    this.nameTagLeft.classList.add('hidden');
    this.nameTagRight.classList.add('hidden');
    this.bg.classList.remove('blur-dark');
    this.envOverlay.classList.add('hidden');
  }

  /* ---- input ---- */
  bindInput() {
    this.inputHandler = (e) => {
      if (e.type === 'keydown' && e.code !== 'Space') return;
      if (this.busy) return;
      if (!this.choicePanel.classList.contains('hidden')) return;
      e.preventDefault?.();
      if (this.typing) this.skipTypewriter();
      else this.advance();
    };
    document.addEventListener('keydown', this.inputHandler);
    this.dialogueBox.addEventListener('click', this.inputHandler);
  }

  unbindInput() {
    document.removeEventListener('keydown', this.inputHandler);
    this.dialogueBox.removeEventListener('click', this.inputHandler);
  }

  /* ---- advance (callback-based) ---- */
  advance() {
    this.clearAutoplay();
    this.clearTypewriter();
    this.dialogueHint.classList.add('hidden');
    const next = this._nextAction;
    this._nextAction = null;
    if (next) next();
  }

  /* ---- location flow ---- */
  goToLocation(id) {
    const loc = this.data.locations[id];
    if (!loc) { console.warn('Location not found:', id); return; }

    this.currentLocation = id;
    const env = this.data.environments[loc.environment];

    this.busy = true;
    this._nextAction = null;
    this.choicePanel.classList.add('hidden');
    this.dialogueBox.classList.add('hidden');
    this.dialogueHint.classList.add('hidden');
    this.spriteLeft.classList.add('hidden');
    this.spriteRight.classList.add('hidden');
    this.bg.classList.remove('blur-dark');

    this.envLabel.textContent = env ? env.label : id;
    this.envOverlay.classList.remove('hidden');

    setTimeout(() => {
      this.bg.style.background = env ? env.color || '#333' : '#333';
      this.envOverlay.classList.add('hidden');
      this.busy = false;

      const isNew = !this.visitedLocations.has(id);
      this.visitedLocations.add(id);

      if (isNew && loc.intro && loc.intro.length > 0) {
        this.playSequence(loc.intro, () => this.showActionMenu());
      } else {
        this.showActionMenu();
      }
    }, 2000);
  }

  showActionMenu() {
    const loc = this.data.locations[this.currentLocation];
    const options = [];

    (loc.characters_present || loc.characters || []).forEach(charId => {
      const char = this.data.characters[charId];
      if (char) options.push({
        text: `Parler à ${char.name}`,
        action: () => this.talkToCharacter(charId)
      });
    });

    if ((loc.connections || []).length > 0) {
      options.push({ text: 'Se déplacer', action: () => this.showTravelMenu() });
    }

    this.playLine(
      { character: 'detective', sprite: 'doubting', text: 'Que devrais-je faire ?' },
      () => this.showChoices(options)
    );
  }

  talkToCharacter(charId) {
    this.choicePanel.classList.add('hidden');
    this.bg.classList.remove('blur-dark');
    const charData = this.data.character_dialogues[charId];
    if (!charData) { this.showActionMenu(); return; }
    let lines = charData.default_dialogue || [];
    for (const cond of charData.conditional_dialogues || []) {
      if (cond.requires_flag && this.flags[cond.requires_flag]) {
        lines = cond.dialogue;
        break;
      }
    }
    this.playSequence(lines, () => {
      this.playLine(
        { character: 'detective', sprite: 'doubting', text: 'Hmmm... ça ne m\'avance pas beaucoup.' },
        () => this.showActionMenu()
      );
    });
  }

  showTravelMenu() {
    this.choicePanel.classList.add('hidden');
    this.bg.classList.remove('blur-dark');
    const loc = this.data.locations[this.currentLocation];
    const options = (loc.connections || []).map(destId => {
      const dest = this.data.locations[destId];
      const env  = dest ? this.data.environments[dest.environment] : null;
      return {
        text: env ? env.label : destId,
        action: () => this.goToLocation(destId)
      };
    });
    this.playLine(
      { character: 'detective', sprite: 'normal', text: 'Où devrais-je me rendre ?' },
      () => this.showChoices(options)
    );
  }

  /* ---- dialogue playback ---- */
  playSequence(lines, onComplete) {
    const step = (i) => {
      if (i >= lines.length) { onComplete(); return; }
      const line = lines[i];
      this.playLine(line, () => {
        if (line.set_flag)       this.flags[line.set_flag] = true;
        if (line.trigger_event)  this.handleEvent(line.trigger_event);
        step(i + 1);
      });
    };
    step(0);
  }

  handleEvent(eventId) {
    // placeholder — future: show flashback image overlay
    console.log('[Event triggered]', eventId);
  }

  playLine(line, onComplete) {
    const char = this.data.characters[line.character];
    if (!char) { onComplete(); return; }

    const align         = char.align === 'right' ? 'right' : 'left';
    const speakerSprite = align === 'left' ? this.spriteLeft  : this.spriteRight;
    const otherSprite   = align === 'left' ? this.spriteRight : this.spriteLeft;

    speakerSprite.classList.remove('hidden');
    speakerSprite.style.backgroundImage = '';
    let img = speakerSprite.querySelector('img');
    if (char.sprite && line.sprite) {
      if (!img) {
        img = document.createElement('img');
        img.style.cssText = 'height:100%;width:auto;display:block;';
        speakerSprite.appendChild(img);
      }
      img.src = `${char.sprite}/${line.sprite}.png`;
      img.style.display = 'block';
    } else if (img) {
      img.style.display = 'none';
    }
    speakerSprite.classList.add('active');
    speakerSprite.classList.remove('inactive');

    if (!otherSprite.classList.contains('hidden')) {
      otherSprite.classList.add('inactive');
      otherSprite.classList.remove('active');
    }

    this.nameTagLeft.classList.toggle('hidden',  align !== 'left');
    this.nameTagRight.classList.toggle('hidden', align !== 'right');
    if (align === 'left') this.nameTagLeft.textContent  = char.name;
    else                  this.nameTagRight.textContent = char.name;

    this.dialogueBox.classList.remove('hidden');
    this._nextAction = onComplete;

    this.typewrite(line.text, () => {
      if (this.settings.autoplay) {
        const delay = Math.max(800, line.text.length * 30);
        this.autoplayTimer = setTimeout(() => this.advance(), delay);
      } else {
        this.dialogueHint.classList.remove('hidden');
      }
    });
  }

  /* ---- choices ---- */
  showChoices(options) {
    this.bg.classList.add('blur-dark');
    this.dialogueHint.classList.add('hidden');
    this.choiceOptions.innerHTML = '';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'choice choice-btn';
      btn.textContent = opt.text;
      btn.addEventListener('click', () => opt.action());
      this.choiceOptions.appendChild(btn);
    });
    this.choicePanel.classList.remove('hidden');
  }

  /* ---- typewriter ---- */
  typewrite(text, onComplete) {
    this._currentText = text;
    this.typing = true;
    this.dialogueText.textContent = '';
    let i = 0;
    const speed = Math.max(25, Math.min(60, 3000 / text.length));
    this.typewriterTimer = setInterval(() => {
      this.dialogueText.textContent = text.slice(0, ++i);
      if (i >= text.length) {
        clearInterval(this.typewriterTimer);
        this.typewriterTimer = null;
        this.typing = false;
        onComplete();
      }
    }, speed);
  }

  skipTypewriter() {
    clearInterval(this.typewriterTimer);
    this.typewriterTimer = null;
    this.typing = false;
    this.dialogueText.textContent = this._currentText;
    this.dialogueHint.classList.remove('hidden');
  }

  clearTypewriter() {
    if (this.typewriterTimer) {
      clearInterval(this.typewriterTimer);
      this.typewriterTimer = null;
    }
    this.typing = false;
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
