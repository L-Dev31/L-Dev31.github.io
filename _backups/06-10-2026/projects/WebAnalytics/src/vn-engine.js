import { tokeniseMarkup, renderFromTokens } from './markup.js';

export class VNEngine {
  constructor(game, settings, lessonOverlay, onExit, presentEvidence) {
    this.game     = game;
    this.settings = settings;
    this.lesson   = lessonOverlay;
    this.onExit   = onExit;
    this.presentEvidence = presentEvidence;

    this.gameUI       = document.getElementById('game-ui');
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
    this.choiceAvatar = document.getElementById('choice-avatar');

    this.flags            = { ...game.flags };
    this.dialogueCache    = {};
    this.visitedLocations = new Set();
    this.seenChoices      = new Set();
    this.currentLocation  = null;
    this._nextAction      = null;
    this.busy             = false;
    this.autoplayTimer    = null;
    this.typewriterTimer  = null;
    this.typing           = false;
    this._currentText     = '';
    this._currentRendered = '';
    this.inputHandler     = null;
  }

  /* ---- Lifecycle ---- */
  start() {
    this.resetUI();
    this.bindInput();
    const startLoc = this.game.game_settings?.start_location || 'intro';
    this.goToLocation(startLoc);
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
    this._hideChoices();
    this.spriteLeft.classList.add('hidden');
    this.spriteRight.classList.add('hidden');
    this.nameTagLeft.classList.add('hidden');
    this.nameTagRight.classList.add('hidden');
    this.bg.classList.remove('blur-dark');
    this.envOverlay.classList.add('hidden');
  }

  /* ---- Input ---- */
  bindInput() {
    this.inputHandler = (e) => {
      if (e.type === 'keydown' && e.code !== 'Space') return;
      if (this.busy) return;
      if (!this.choicePanel.classList.contains('hidden')) return;
      if (!this.lesson.el.classList.contains('hidden')) return;
      if (!document.getElementById('screen-lessons')?.classList.contains('hidden')) return;
      e.preventDefault?.();
      if (this.typing) this.skipTypewriter();
      else this.advance();
    };
    document.addEventListener('keydown', this.inputHandler);
    this.dialogueBox.addEventListener('click', this.inputHandler);
  }

  unbindInput() {
    if (!this.inputHandler) return;
    document.removeEventListener('keydown', this.inputHandler);
    this.dialogueBox.removeEventListener('click', this.inputHandler);
  }

  advance() {
    this.clearAutoplay();
    this.clearTypewriter();
    this.dialogueHint.classList.add('hidden');
    const next = this._nextAction;
    this._nextAction = null;
    if (next) next();
  }

  /* ---- Location loader (lazy) ---- */
  async loadLocation(id) {
    if (this.dialogueCache[id]) return this.dialogueCache[id];
    const locDef = this.game.locations[id];
    if (!locDef) { console.warn('No location def for:', id); return null; }
    try {
      const data = await fetch(locDef.dialogue_file).then(r => r.json());
      this.dialogueCache[id] = data;
      return data;
    } catch (err) {
      console.error('Failed to load dialogue:', locDef.dialogue_file, err);
      return null;
    }
  }

  /* ---- Navigate ---- */
  async goToLocation(id) {
    const locDef = this.game.locations[id];
    if (!locDef) { console.warn('Location not found:', id); return; }

    this.currentLocation = id;
    const env = this.game.environments[locDef.environment] || {};

    this.busy = true;
    this._nextAction = null;
    this._hideChoices();
    this.dialogueBox.classList.add('hidden');
    this.dialogueHint.classList.add('hidden');
    this.nameTagLeft.classList.add('hidden');
    this.nameTagRight.classList.add('hidden');
    this.spriteLeft.classList.add('hidden');
    this.spriteRight.classList.add('hidden');
    this.bg.classList.remove('blur-dark');

    this.envLabel.textContent = '';
    this.envOverlay.classList.remove('hidden');

    const label = env.label || id;
    const [locData] = await Promise.all([
      this.loadLocation(id),
      this._typewriteOverlayLabel(label, 160)
    ]);

    await new Promise(r => setTimeout(r, 800));

    this.bg.style.background = env.background || '#111';
    this.envOverlay.classList.add('fading-out');
    await new Promise(r => setTimeout(r, 620));
    this.envOverlay.classList.add('hidden');
    this.envOverlay.classList.remove('fading-out');
    this.busy = false;

    if (!locData) { console.warn('No dialogue data for:', id); return; }

    const isNew = !this.visitedLocations.has(id);
    this.visitedLocations.add(id);

    const sceneIntro = this._pickSceneIntro(env);
    const playIntro  = isNew || (sceneIntro && sceneIntro._always);

    const runMain = () => {
      const onFirstVisit = locData.on_first_visit || [];
      if (isNew && onFirstVisit.length > 0) {
        this.runSequence(onFirstVisit, () => this._runConditionalVisit(locData));
      } else {
        this._runConditionalVisit(locData);
      }
    };

    if (sceneIntro && playIntro) {
      this._playSceneIntro(sceneIntro.text || sceneIntro, runMain);
    } else {
      runMain();
    }
  }

  _meetsRequirements(cond) {
    if (cond.requires_flag     && !this.flags[cond.requires_flag])                     return false;
    if (cond.requires_flags    && !cond.requires_flags.every(f => this.flags[f]))      return false;
    if (cond.requires_any_flag && !cond.requires_any_flag.some(f => this.flags[f]))    return false;
    if (cond.forbids_flag      && this.flags[cond.forbids_flag])                       return false;
    if (cond.once_flag         && this.flags[cond.once_flag])                          return false;
    return true;
  }

  _pickSceneIntro(env) {
    const alt = (env.scene_intro_alt || []).find(a => this._meetsRequirements(a));
    if (alt) return { text: alt.text, _always: !!alt.always };
    if (env.scene_intro) return { text: env.scene_intro, _always: false };
    return null;
  }

  _runConditionalVisit(locData) {
    const triggered = (locData.on_visit || []).find(v => this._meetsRequirements(v));
    if (triggered) {
      if (triggered.once_flag) this.flags[triggered.once_flag] = true;
      this.runSequence(triggered.sequence || [], () => this.showLocationMenu(locData));
    } else {
      this.showLocationMenu(locData);
    }
  }

  _typewriteOverlayLabel(text, speed) {
    return new Promise(resolve => {
      this.envLabel.textContent = '';
      let i = 0;
      const timer = setInterval(() => {
        this.envLabel.textContent = text.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, ++i);
        if (i >= text.length) { clearInterval(timer); resolve(); }
      }, speed);
    });
  }

  _playSceneIntro(text, onComplete) {
    this.playLine({ char: 'narrateur', text }, onComplete);
  }

  /* ---- Location menu ---- */
  showLocationMenu(locData) {
    if (!locData.menu && !locData.sequence) {
      console.warn('Location has no menu or sequence:', this.currentLocation);
      return;
    }

    if (locData.sequence) {
      this.runSequence(locData.sequence, () => {});
      return;
    }

    const menuLine = locData.menu?.line || this.game.game_settings?.menu_prompt || { char: 'will', text: '...', sprite: 'doubting' };

    const buildTopOptions = () => {
      const opts = [];

      const chars = (locData.characters_present || []).filter(c => this._meetsRequirements(c));
      if (chars.length > 0) {
        const char = chars[0];
        opts.push({
          text: `Parler a ${char.label}`,
          action: () => {
            this._hideChoices();
            this.bg.classList.remove('blur-dark');
            this.showCharacterMenu(locData);
          }
        });
      }

      opts.push({
        text: 'Se deplacer',
        action: () => {
          this._hideChoices();
          this.bg.classList.remove('blur-dark');
          this.showTravelMenu(locData);
        }
      });

      return opts;
    };

    this.playLine(menuLine, () => this.showChoices(buildTopOptions()));
  }

  /* ---- Menu "Parler a" ---- */
  showCharacterMenu(locData) {
    const menuOpts = locData.menu?.options || [];

    const buildCharOptions = () => {
      const opts = menuOpts
        .filter(opt => this._meetsRequirements(opt))
        .map(opt => ({
          id: opt.id,
          text: opt.text,
          action: () => {
            this._hideChoices();
            this.bg.classList.remove('blur-dark');
            this.playLine({ char: 'will', text: opt.text, sprite: 'normal' }, () => {
              if (opt.goto) { this.goToLocation(opt.goto); return; }
              if (opt.sequence) this.runSequence(opt.sequence, () => this.showLocationMenu(locData));
            });
          }
        }));

      opts.push({
        text: 'Laisser tomber',
        action: () => {
          this._hideChoices();
          this.bg.classList.remove('blur-dark');
          this.showLocationMenu(locData);
        }
      });

      return opts;
    };

    this.playLine(
      this.game.game_settings?.menu_prompt_talk || { char: 'will', text: '...', sprite: 'doubting' },
      () => this.showChoices(buildCharOptions())
    );
  }

  /* ---- Menu "Se deplacer" ---- */
  showTravelMenu(locData) {
    const connections = (this.game.global_connections || []).filter(c =>
      c.goto !== this.currentLocation && this._meetsRequirements(c)
    );

    const opts = connections.map(c => ({
      id: `travel_${c.goto}`,
      text: c.label,
      action: () => {
        this._hideChoices();
        this.bg.classList.remove('blur-dark');
        this.goToLocation(c.goto);
      }
    }));

    opts.push({
      text: 'Laisser tomber',
      action: () => {
        this._hideChoices();
        this.bg.classList.remove('blur-dark');
        this.showLocationMenu(locData);
      }
    });

    this.playLine(
      this.game.game_settings?.menu_prompt_travel || { char: 'will', text: '...', sprite: 'doubting' },
      () => this.showChoices(opts)
    );
  }

  /* ---- Sequence runner ---- */
  runSequence(steps, onComplete) {
    const run = async (i) => {
      if (i >= steps.length) { onComplete(); return; }
      const step = steps[i];
      const next = () => run(i + 1);

      switch (step.type) {

        case 'line':
          this.playLine(step, next);
          break;

        case 'set_flag':
          this.flags[step.flag] = true;
          next();
          break;

        case 'lesson': {
          const showLesson = async () => { await this.lesson.show(step); next(); };
          if (step.intro) {
            this.playLine({ char: step.intro.char || 'will', text: step.intro.text, sprite: step.intro.sprite || 'normal' }, showLesson);
          } else {
            await showLesson();
          }
          break;
        }

        case 'choice':
          this.showInlineChoices(step, onComplete, i, steps, next);
          break;

        case 'branch':
          if (!this._meetsRequirements(step)) { next(); break; }
          this.showInlineChoices(
            { options: [step.option, { text: 'Pas maintenant', then_next: true }] },
            onComplete, i, steps, next
          );
          break;

        case 'goto':
          this.goToLocation(step.goto);
          break;

        case 'present_evidence': {
          if (!this.presentEvidence) { next(); break; }
          const runOutcome = (outcome, applyFlags, afterDone) => {
            if (applyFlags && Array.isArray(outcome.set_flags)) {
              outcome.set_flags.forEach(f => { this.flags[f] = true; });
            }
            const seq = outcome.sequence || [];
            if (seq.length) this.runSequence(seq, afterDone);
            else afterDone();
          };
          const openInventory = async () => {
            const { result } = await this.presentEvidence(step.expected_lesson);
            if (result === 'correct' && step.on_correct) { runOutcome(step.on_correct, true, next);  return; }
            if (result === 'wrong'   && step.on_wrong)   {
              const allowRetry = step.on_wrong.retry !== false;
              runOutcome(step.on_wrong, false, () => { if (allowRetry) openInventory(); else next(); });
              return;
            }
            if (result === 'cancel'  && step.on_cancel)  {
              const allowRetry = step.on_cancel.retry === true;
              runOutcome(step.on_cancel, false, () => { if (allowRetry) openInventory(); else next(); });
              return;
            }
            next();
          };
          const promptLine = step.prompt || {
            char: 'will',
            text: '~~Il y a quelque chose dans ce que j\'ai appris qui s\'applique ici. Lequel ?~~',
            sprite: 'doubting'
          };
          this.playLine({ char: promptLine.char || 'will', text: promptLine.text, sprite: promptLine.sprite || 'doubting' }, openInventory);
          break;
        }

        case 'event':
          this.handleEvent(step.id, onComplete);
          break;

        default:
          next();
      }
    };
    run(0);
  }

  /* ---- Inline choice (inside a sequence) ---- */
  showInlineChoices(step, onComplete, _i, _steps, fallbackNext) {
    const options = (step.options || []).map(opt => ({
      text: opt.text,
      action: () => {
        this._hideChoices();
        this.bg.classList.remove('blur-dark');
        this.playLine({ char: 'will', text: opt.text, sprite: 'normal' }, () => {
          if (opt.then_next) { fallbackNext(); return; }
          const seq = opt.sequence || [];
          const afterSeq = () => opt.goto ? this.goToLocation(opt.goto) : fallbackNext();
          if (seq.length) this.runSequence(seq, afterSeq);
          else afterSeq();
        });
      }
    }));
    this.showChoices(options);
  }

  /* ---- Event handler ---- */
  handleEvent(eventId, onComplete) {
    switch (eventId) {
      case 'fin_vraie':
        this.showEndScreen('VERITE COMPLETE', 'Affaire resolue. Toutes les preuves reunies.', '#1a3a1a');
        break;
      case 'fin_partielle':
        this.showEndScreen('FIN PARTIELLE', 'Il manque une piece. Retournez enqueter.', '#1a2a3a', () => this.goToLocation('jia'));
        break;
      case 'fin_echec':
        this.showEndScreen('ECHEC', 'Sans preuve, il n\'y a pas de conclusion. Retournez enqueter.', '#2a1a1a', () => this.goToLocation('jia'));
        break;
      default:
        console.warn('[Event]', eventId);
        if (onComplete) onComplete();
    }
  }

  showEndScreen(title, body, color, onBack) {
    this.bg.style.background = color || '#000';
    this.dialogueBox.classList.add('hidden');
    this._hideChoices();
    this.spriteLeft.classList.add('hidden');
    this.spriteRight.classList.add('hidden');

    const opts = [];
    if (onBack) opts.push({ text: 'Continuer l\'enquete', action: () => { this._hideChoices(); onBack(); } });
    opts.push({ text: 'Retour au menu', action: () => { this._hideChoices(); this.stop(); this.onExit?.(); } });

    this.playLine({ char: 'narrateur', text: `${title} — ${body}` }, () => this.showChoices(opts));
  }

  /* ---- Line playback ---- */
  playLine(line, onComplete) {
    if (!line) { onComplete(); return; }

    const charDef = this.game.characters[line.char || line.character];
    const isNarrator = !charDef || !!charDef.italic;

    if (isNarrator) {
      this.nameTagLeft.classList.add('hidden');
      this.nameTagRight.classList.add('hidden');
      this.spriteLeft.classList.add('hidden');
      this.spriteRight.classList.add('hidden');
      this.dialogueBox.classList.remove('hidden');
      this.dialogueText.style.textAlign = 'left';
      this.dialogueText.classList.add('narrator');
      this._nextAction = onComplete;
      this.typewritePlain(line.text || '', () => this._afterType());
      return;
    }

    const align        = charDef.align === 'right' ? 'right' : 'left';
    const speakerSprite= align === 'left' ? this.spriteLeft  : this.spriteRight;
    const otherSprite  = align === 'left' ? this.spriteRight : this.spriteLeft;

    speakerSprite.classList.remove('hidden');
    let img = speakerSprite.querySelector('img');
    if (charDef.sprite && line.sprite) {
      if (!img) {
        img = document.createElement('img');
        img.style.cssText = 'height:100%;width:auto;display:block;';
        speakerSprite.appendChild(img);
      }
      img.src = `${charDef.sprite}/${line.sprite}.png`;
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
    const nameTag = align === 'left' ? this.nameTagLeft : this.nameTagRight;
    nameTag.textContent = charDef.name;
    nameTag.style.background = charDef.color || '';
    nameTag.style.borderColor = charDef.color ? `color-mix(in srgb, ${charDef.color} 60%, #fff 40%)` : '';
    nameTag.style.color = '#f4f1e8';

    const dialogBg = charDef.color
      ? `linear-gradient(180deg, color-mix(in srgb, ${charDef.color} 18%, #111c2e) 0%, #070e1c 100%)`
      : 'linear-gradient(180deg, #111c2e 0%, #070e1c 100%)';
    this.dialogueBox.style.background = dialogBg;
    this.dialogueBox.style.setProperty('--char-color', charDef.color || 'transparent');

    this.dialogueText.classList.remove('narrator');
    this.dialogueText.style.textAlign = '';

    this.dialogueBox.classList.remove('hidden');
    this._nextAction = onComplete;

    this.typewrite(line.text || '', () => this._afterType());
  }

  _afterType() {
    if (this.settings.autoplay) {
      const delay = Math.max(800, (this._currentText.length || 40) * 28);
      this.autoplayTimer = setTimeout(() => this.advance(), delay);
    } else {
      this.dialogueHint.classList.remove('hidden');
    }
  }

  _hideChoices() {
    this.choicePanel.classList.add('hidden');
    this.gameUI.classList.remove('choices-active');
  }

  /* ---- Choices ---- */
  showChoices(options) {
    this.bg.classList.add('blur-dark');
    this.dialogueHint.classList.add('hidden');
    this.spriteLeft.classList.add('hidden');
    this.spriteRight.classList.add('hidden');
    this.dialogueBox.classList.remove('hidden');
    this.gameUI.classList.add('choices-active');

    this.choiceAvatar.innerHTML = '';
    const willDef = this.game.characters['will'];
    if (willDef?.sprite) {
      const img = document.createElement('img');
      img.src = `${willDef.sprite}/doubting.png`;
      this.choiceAvatar.appendChild(img);
    }
    this.choiceOptions.innerHTML = '';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'choice choice-btn';
      btn.textContent = opt.text.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const id = opt.id;
      if (id && !this.seenChoices.has(id)) btn.classList.add('choice-new');
      btn.addEventListener('click', () => {
        if (id) this.seenChoices.add(id);
        opt.action();
      });
      this.choiceOptions.appendChild(btn);
    });
    this.choicePanel.classList.remove('hidden');
  }

  /* ---- Typewriter ---- */
  typewrite(text, onComplete) {
    this._currentText     = text;
    const tokens          = tokeniseMarkup(text);
    this._currentRendered = renderFromTokens(tokens);
    this.typing = true;
    this.dialogueText.innerHTML = '';
    let i = 0;
    const speed = Math.max(22, Math.min(55, 2800 / Math.max(tokens.length, 1)));
    this.typewriterTimer = setInterval(() => {
      if (tokens[i].shake) this._shake(tokens[i].shake);
      this.dialogueText.innerHTML = renderFromTokens(tokens, ++i);
      if (i >= tokens.length) {
        clearInterval(this.typewriterTimer);
        this.typewriterTimer = null;
        this.typing = false;
        onComplete();
      }
    }, speed);
  }

  typewritePlain(text, onComplete) {
    this._currentText     = text;
    this._currentRendered = text;
    this.typing = true;
    this.dialogueText.textContent = '';
    let i = 0;
    const speed = Math.max(22, Math.min(55, 2800 / Math.max(text.length, 1)));
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

  /* ---- Screen shake ---- */
  _shake(level) {
    const el = document.getElementById('screen-game');
    const cls = level >= 2 ? 'shake-strong' : 'shake-light';
    el.classList.remove('shake-light', 'shake-strong');
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  skipTypewriter() {
    clearInterval(this.typewriterTimer);
    this.typewriterTimer = null;
    this.typing = false;
    if (this.dialogueText.classList.contains('narrator')) {
      this.dialogueText.textContent = this._currentRendered;
    } else {
      this.dialogueText.innerHTML = this._currentRendered;
    }
    this.dialogueHint.classList.remove('hidden');
  }

  clearTypewriter() {
    if (this.typewriterTimer) { clearInterval(this.typewriterTimer); this.typewriterTimer = null; }
    this.typing = false;
  }

  clearAutoplay() {
    if (this.autoplayTimer) { clearTimeout(this.autoplayTimer); this.autoplayTimer = null; }
  }
}
