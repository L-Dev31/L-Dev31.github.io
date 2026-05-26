/* ==========================================================
   BLUE S.E.A. — Visual Novel Engine
   Architecture : game.json (global) + data/dialogue/{loc}.json (lazy)
   ========================================================== */

/* ---------- Settings (localStorage) ---------- */
class Settings {
  static KEY = 'blueSea_settings_v1';
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

/* ---------- Lesson Overlay ---------- */
class LessonOverlay {
  constructor() {
    this.el       = document.getElementById('lesson-overlay');
    this.title    = document.getElementById('lesson-title');
    this.body     = document.getElementById('lesson-body');
    this.closeBtn = document.getElementById('lesson-close');
    this._resolve = null;

    this.closeBtn.addEventListener('click', () => this._close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.classList.contains('hidden')) this._close();
    });
  }

  /* Returns a Promise that resolves when the overlay is closed */
  show(lesson) {
    this.title.textContent = lesson.title || '';
    this.body.innerHTML = '';

    (lesson.blocks || []).forEach(block => {
      const el = this._renderBlock(block);
      if (el) this.body.appendChild(el);
    });

    this.el.classList.remove('hidden');
    this.closeBtn.classList.remove('hidden');
    this.el.scrollTop = 0;

    return new Promise(resolve => { this._resolve = resolve; });
  }

  _close() {
    this.el.classList.add('hidden');
    this.closeBtn.classList.add('hidden');
    if (this._resolve) { this._resolve(); this._resolve = null; }
  }

  _renderBlock(block) {
    switch (block.type) {

      case 'text': {
        const p = document.createElement('p');
        p.className = 'lesson-text';
        p.innerHTML = this._md(block.content);
        return p;
      }

      case 'heading': {
        const h = document.createElement('h3');
        h.className = 'lesson-heading';
        h.innerHTML = this._md(block.content);
        return h;
      }

      case 'list': {
        const ul = document.createElement('ul');
        ul.className = 'lesson-list';
        (block.items || []).forEach(item => {
          const li = document.createElement('li');
          li.innerHTML = this._md(item);
          ul.appendChild(li);
        });
        return ul;
      }

      case 'table': {
        const wrapper = document.createElement('div');
        wrapper.className = 'lesson-table-wrapper';
        const table = document.createElement('table');
        table.className = 'lesson-table';
        if (block.headers?.length) {
          const thead = table.createTHead();
          const tr = thead.insertRow();
          block.headers.forEach(h => {
            const th = document.createElement('th');
            th.innerHTML = this._md(h);
            tr.appendChild(th);
          });
        }
        const tbody = table.createTBody();
        (block.rows || []).forEach(row => {
          const tr = tbody.insertRow();
          row.forEach(cell => {
            const td = tr.insertCell();
            td.innerHTML = this._md(String(cell));
          });
        });
        wrapper.appendChild(table);
        return wrapper;
      }

      case 'code': {
        const pre = document.createElement('pre');
        pre.className = 'lesson-code';
        const code = document.createElement('code');
        code.textContent = block.content;
        pre.appendChild(code);
        return pre;
      }

      case 'note': {
        const aside = document.createElement('aside');
        aside.className = 'lesson-note';
        aside.innerHTML = this._md(block.content);
        return aside;
      }

      case 'separator': {
        const hr = document.createElement('hr');
        hr.className = 'lesson-separator';
        return hr;
      }

      case 'image': {
        const figure = document.createElement('figure');
        figure.className = 'lesson-figure';
        const img = document.createElement('img');
        img.src = block.src;
        img.alt = block.alt || '';
        img.className = 'lesson-img';
        figure.appendChild(img);
        if (block.caption) {
          const cap = document.createElement('figcaption');
          cap.className = 'lesson-caption';
          cap.textContent = block.caption;
          figure.appendChild(cap);
        }
        return figure;
      }

      default:
        return null;
    }
  }

  /* Mini-markdown for lesson blocks */
  _md(str) {
    if (!str) return '';
    return str
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/`(.+?)`/g,       '<code>$1</code>');
  }
}

/* ---- Dialogue text markup ----
   ~~text~~   → italic, muted (narration / aside)
   **text**   → bold
   ##text##   → emphasis (caps)          + shake léger
   ###text### → shout (large caps)       + shake fort
*/

/* Tokenise le texte brut en segments {tag, chars[]}
   Chaque char est un caractère à afficher dans le contexte du tag courant.
   Retourne un tableau plat de {char, openTag, closeTag, shakeLevel}
   openTag / closeTag sont émis UNE FOIS au début / fin du segment. */
function tokeniseMarkup(str) {
  if (!str) return [];

  /* Ordered by specificity: ### before ## before # */
  const TOKENS = [
    { re: /~~~(.+?)~~~/g,   open: '<em>',                   close: '</em>',     shake: 0 },
    { re: /~~(.+?)~~/g,     open: '<em>',                   close: '</em>',     shake: 0 },
    { re: /\*\*(.+?)\*\*/g, open: '<strong>',               close: '</strong>', shake: 0 },
    { re: /###(.+?)###/g,   open: '<span class="dm-shout">', close: '</span>',  shake: 2 },
    { re: /##(.+?)##/g,     open: '<span class="dm-emph">',  close: '</span>',  shake: 1 },
  ];

  /* Build a list of {start, end, open, close, inner, shake} segments */
  const segments = [];
  for (const tok of TOKENS) {
    tok.re.lastIndex = 0;
    let m;
    while ((m = tok.re.exec(str)) !== null) {
      segments.push({
        start: m.index,
        end:   m.index + m[0].length,
        open:  tok.open,
        close: tok.close,
        inner: tok.shake >= 1 ? m[1].toUpperCase() : m[1],
        shake: tok.shake
      });
    }
  }
  /* Sort by start position */
  segments.sort((a, b) => a.start - b.start);

  /* Flatten into a list of typed chars */
  const result = [];
  let cursor = 0;

  const pushPlain = (text) => {
    for (let i = 0; i < text.length; i++) {
      result.push({ char: text[i], open: i === 0 ? '' : null, close: null, shake: 0 });
    }
  };

  for (const seg of segments) {
    if (seg.start < cursor) continue; // overlapping — skip
    /* plain text before this segment */
    if (seg.start > cursor) pushPlain(str.slice(cursor, seg.start));
    /* segment chars */
    for (let i = 0; i < seg.inner.length; i++) {
      result.push({
        char:  seg.inner[i],
        open:  i === 0 ? seg.open  : null,
        close: i === seg.inner.length - 1 ? seg.close : null,
        shake: i === 0 ? seg.shake : 0,
      });
    }
    cursor = seg.end;
  }
  /* trailing plain text */
  if (cursor < str.length) pushPlain(str.slice(cursor));

  return result;
}

/* Build rendered HTML for tokens[0..count].
   If the last token has an open tag but its close hasn't been reached yet,
   we must keep the tag open so styles apply to all chars inside.
   Strategy: emit open on first char of segment, close only on last char.
   Since tokens already store open/close per-char, we just need to ensure
   any dangling open tag is closed at the end of the partial render. */
function renderFromTokens(tokens, count) {
  const end = count !== undefined ? count : tokens.length;
  let html = '';
  let openTag = null; // track if we're inside an unclosed tag
  for (let i = 0; i < end; i++) {
    const t = tokens[i];
    if (t.open !== null && t.open !== '') { openTag = t.close; html += t.open; }
    html += escHtml(t.char);
    if (t.close !== null) { html += t.close; openTag = null; }
  }
  /* Close any dangling tag so the browser doesn't bleed styles */
  if (openTag) html += openTag;
  return html;
}

function escHtml(c) {
  return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c;
}

/* Legacy full-render (used outside typewriter e.g. lesson intro lines) */
function renderDialogueMarkup(str) {
  if (!str) return renderFromTokens(tokeniseMarkup(str));
  return renderFromTokens(tokeniseMarkup(str));
}

/* ---------- Visual Novel Engine ---------- */
class VNEngine {
  constructor(game, settings, lessonOverlay) {
    this.game         = game;        // game.json content
    this.settings     = settings;
    this.lesson       = lessonOverlay;

    /* DOM refs */
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

    /* State */
    this.flags            = { ...game.flags };     // deep copy of initial flags
    this.dialogueCache    = {};                     // loc id → loaded JSON
    this.visitedLocations = new Set();
    this.seenChoices      = new Set();              // textes de choix déjà affichés au moins une fois
    this.currentLocation  = null;
    this._nextAction      = null;
    this.busy             = false;
    this.autoplayTimer    = null;
    this.typewriterTimer  = null;
    this.typing           = false;
    this._currentText     = '';
    this._lastAlign       = 'left';
    this._lastSpeakerImg  = null;
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

    /* Écran noir */
    this.envLabel.textContent = '';
    this.envOverlay.classList.remove('hidden');

    /* Typewriter du nom de lieu sur l'overlay + chargement en parallèle */
    const label = env.label || id;
    const [locData] = await Promise.all([
      this.loadLocation(id),
      this._typewriteOverlayLabel(label, 80)
    ]);

    /* Pause 600ms après que le nom est apparu */
    await new Promise(r => setTimeout(r, 600));

    this.bg.style.background = env.color || '#111';
    this.envOverlay.classList.add('hidden');
    this.busy = false;

    if (!locData) { console.warn('No dialogue data for:', id); return; }

    const isNew = !this.visitedLocations.has(id);
    this.visitedLocations.add(id);

    /* Scene intro dans la dialogue box (remplace narrateur intro)
       Permet des variantes contextuelles via env.scene_intro_alt = [{requires_flag/...., text}]
       Première variante satisfaite l'emporte ; sinon fallback env.scene_intro. */
    const sceneIntro = this._pickSceneIntro(env);
    /* Une variante peut être marquée { always: true } pour rejouer même en revisite */
    const playIntro = isNew || (sceneIntro && sceneIntro._always);

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

  /* Choisit la scene_intro contextuelle :
     - env.scene_intro_alt (array) → première entrée dont les conditions de flags matchent
     - sinon env.scene_intro (fallback)
     Retourne { text, _always } ou null. */
  _pickSceneIntro(env) {
    const alts = env.scene_intro_alt || [];
    for (const alt of alts) {
      if (alt.requires_flag && !this.flags[alt.requires_flag]) continue;
      if (alt.requires_flags && !alt.requires_flags.every(f => this.flags[f])) continue;
      if (alt.requires_any_flag && !alt.requires_any_flag.some(f => this.flags[f])) continue;
      if (alt.forbids_flag && this.flags[alt.forbids_flag]) continue;
      return { text: alt.text, _always: !!alt.always };
    }
    if (env.scene_intro) return { text: env.scene_intro, _always: false };
    return null;
  }

  /* Joue d'éventuels on_visit conditionnels (rejouables à chaque visite si flags matchent + once_flag pas encore set) */
  _runConditionalVisit(locData) {
    const visits = locData.on_visit || [];
    const triggered = visits.find(v => {
      if (v.once_flag && this.flags[v.once_flag]) return false;
      if (v.requires_flag && !this.flags[v.requires_flag]) return false;
      if (v.requires_flags && !v.requires_flags.every(f => this.flags[f])) return false;
      if (v.requires_any_flag && !v.requires_any_flag.some(f => this.flags[f])) return false;
      if (v.forbids_flag && this.flags[v.forbids_flag]) return false;
      return true;
    });
    if (triggered) {
      if (triggered.once_flag) this.flags[triggered.once_flag] = true;
      this.runSequence(triggered.sequence || [], () => this.showLocationMenu(locData));
    } else {
      this.showLocationMenu(locData);
    }
  }

  /* Typewriter lettre par lettre sur le label de l'overlay */
  _typewriteOverlayLabel(text, speed) {
    return new Promise(resolve => {
      this.envLabel.textContent = '';
      let i = 0;
      const timer = setInterval(() => {
        this.envLabel.textContent = text.slice(0, ++i);
        if (i >= text.length) { clearInterval(timer); resolve(); }
      }, speed);
    });
  }

  /* Affiche la scène intro via playLine avec le char narrateur */
  _playSceneIntro(text, onComplete) {
    this.playLine({ char: 'narrateur', text }, onComplete);
  }

  /* ---- Location menu — toujours 2 choix max : Parler / Se déplacer ---- */
  showLocationMenu(locData) {
    if (!locData.menu && !locData.sequence) {
      console.warn('Location has no menu or sequence:', this.currentLocation);
      return;
    }

    /* Séquence linéaire (intro) */
    if (locData.sequence) {
      this.runSequence(locData.sequence, () => {});
      return;
    }

    const menuLine = locData.menu?.line || this.game.game_settings?.menu_prompt || { char: 'will', text: '...', sprite: 'doubting' };

    /* Construit les 2 choix principaux */
    const buildTopOptions = () => {
      const opts = [];

      /* ① Parler à [personnage présent] — uniquement s'il y en a un (et que ses conditions de flag passent) */
      const chars = (locData.characters_present || []).filter(c => {
        if (c.requires_flag && !this.flags[c.requires_flag]) return false;
        if (c.requires_flags && !c.requires_flags.every(f => this.flags[f])) return false;
        if (c.requires_any_flag && !c.requires_any_flag.some(f => this.flags[f])) return false;
        if (c.forbids_flag && this.flags[c.forbids_flag]) return false;
        return true;
      });
      if (chars.length > 0) {
        const char = chars[0]; // un seul perso par lieu
        opts.push({
          text: `Parler à ${char.label}`,
          action: () => {
            this._hideChoices();
            this.bg.classList.remove('blur-dark');
            this.showCharacterMenu(locData);
          }
        });
      }

      /* ② Se déplacer — toujours disponible via global_connections */
      opts.push({
        text: 'Se déplacer',
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

  /* ---- Menu "Parler à" — options de dialogue du perso ---- */
  showCharacterMenu(locData) {
    const menuOpts = locData.menu?.options || [];

    const buildCharOptions = () => {
      const opts = [];
      menuOpts.forEach(opt => {
        if (opt.requires_flag  && !this.flags[opt.requires_flag])                return;
        if (opt.requires_flags && !opt.requires_flags.every(f => this.flags[f])) return;
        if (opt.requires_any_flag && !opt.requires_any_flag.some(f => this.flags[f])) return;
        if (opt.forbids_flag && this.flags[opt.forbids_flag])                    return;
        if (opt.once_flag && this.flags[opt.once_flag])                          return;

        opts.push({
          id: opt.id,
          text: opt.text,
          action: () => {
            this._hideChoices();
            this.bg.classList.remove('blur-dark');

            const proceed = () => {
              if (opt.goto) { this.goToLocation(opt.goto); return; }
              if (opt.sequence) this.runSequence(opt.sequence, () => this.showLocationMenu(locData));
            };
            this._sayChoice(opt.text, proceed);
          }
        });
      });

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

  /* ---- Menu "Se déplacer" — lit global_connections, filtre la pièce actuelle ---- */
  showTravelMenu(locData) {
    const connections = (this.game.global_connections || []).filter(c => {
      if (c.goto === this.currentLocation)                                       return false;
      if (c.requires_flag  && !this.flags[c.requires_flag])                     return false;
      if (c.requires_flags && !c.requires_flags.every(f => this.flags[f]))      return false;
      if (c.requires_any_flag && !c.requires_any_flag.some(f => this.flags[f])) return false;
      if (c.forbids_flag && this.flags[c.forbids_flag])                         return false;
      return true;
    });

    const opts = connections.map(c => ({
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
          /* Conditional inline option — shown only if flag conditions match */
          if (step.requires_flag && !this.flags[step.requires_flag]) { next(); break; }
          if (step.requires_flags && !step.requires_flags.every(f => this.flags[f])) { next(); break; }
          if (step.requires_any_flag && !step.requires_any_flag.some(f => this.flags[f])) { next(); break; }
          if (step.forbids_flag && this.flags[step.forbids_flag]) { next(); break; }
          this.showInlineChoices(
            { options: [step.option, { text: 'Pas maintenant', then_next: true }] },
            onComplete, i, steps, next
          );
          break;

        case 'goto':
          this.goToLocation(step.location || step.goto);
          break;

        case 'event':
          this.handleEvent(step.id, onComplete);
          break;

        default:
          next();
      }
    };
    run(0);
  }

  /* ---- Rejoue le texte du choix comme ligne de Will avant d'exécuter onDone ---- */
  _sayChoice(text, onDone) {
    this.playLine({ char: 'will', text, sprite: 'normal' }, onDone);
  }

  /* ---- Inline choice (inside a sequence) ---- */
  showInlineChoices(step, onComplete, _i, _steps, fallbackNext) {
    const options = (step.options || []).map(opt => ({
      text: opt.text,
      action: () => {
        this._hideChoices();
        this.bg.classList.remove('blur-dark');

        const proceed = () => {
          if (opt.then_next) { fallbackNext(); return; }
          if (opt.then)      { this.goToLocation(opt.then); return; }

          const seq = opt.sequence || [];
          const afterSeq = () => {
            if (opt.then) this.goToLocation(opt.then);
            else fallbackNext();
          };
          if (seq.length) this.runSequence(seq, afterSeq);
          else afterSeq();
        };

        this._sayChoice(opt.text, proceed);
      }
    }));
    this.showChoices(options);
  }

  /* ---- Event handler ---- */
  handleEvent(eventId, onComplete) {
    switch (eventId) {
      case 'fin_vraie':
        this.showEndScreen('VÉRITÉ COMPLÈTE', 'Affaire résolue. Toutes les preuves réunies.', '#1a3a1a');
        break;
      case 'fin_partielle':
        this.showEndScreen('FIN PARTIELLE', 'Il manque une pièce. Retournez enquêter.', '#1a2a3a', () => this.goToLocation('jia'));
        break;
      case 'fin_echec':
        this.showEndScreen('ÉCHEC', 'Sans preuve, il n\'y a pas de conclusion. Retournez enquêter.', '#2a1a1a', () => this.goToLocation('jia'));
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
    if (onBack) opts.push({ text: 'Continuer l\'enquête', action: () => { this._hideChoices(); onBack(); } });
    opts.push({ text: 'Retour au menu', action: () => { this._hideChoices(); this.stop(); window._app?.goToTitle(); } });

    this.playLine({ char: 'narrateur', text: `${title} — ${body}` }, () => this.showChoices(opts));
  }

  /* ---- Line playback ---- */
  playLine(line, onComplete) {
    if (!line) { onComplete(); return; }

    const charDef = this.game.characters[line.char || line.character];

    /* Narrateur — boîte visible, pas de name tag, style italique */
    const isNarrator = !charDef || !!charDef.italic;
    if (isNarrator) {
      this.nameTagLeft.classList.add('hidden');
      this.nameTagRight.classList.add('hidden');
      this.spriteLeft.classList.add('hidden');
      this.spriteRight.classList.add('hidden');
      this.dialogueBox.classList.remove('hidden');
      this.dialogueBox.classList.remove('italic-line');
      this.dialogueText.style.textAlign = 'left';
      this.dialogueText.classList.add('narrator');
      this._nextAction = onComplete;
      this.typewritePlain(line.text || '', () => this._afterType());
      return;
    }

    this.dialogueBox.classList.remove('italic-line');

    const align        = charDef.align === 'right' ? 'right' : 'left';
    const speakerSprite= align === 'left' ? this.spriteLeft  : this.spriteRight;
    const otherSprite  = align === 'left' ? this.spriteRight : this.spriteLeft;

    /* Sprite */
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
      this._lastSpeakerImg = img.src;
    } else if (img) {
      img.style.display = 'none';
    }
    speakerSprite.classList.add('active');
    speakerSprite.classList.remove('inactive');

    if (!otherSprite.classList.contains('hidden')) {
      otherSprite.classList.add('inactive');
      otherSprite.classList.remove('active');
    }

    /* Name tag */
    this.nameTagLeft.classList.toggle('hidden',  align !== 'left');
    this.nameTagRight.classList.toggle('hidden', align !== 'right');
    const nameTag = align === 'left' ? this.nameTagLeft : this.nameTagRight;
    nameTag.textContent = charDef.name;
    nameTag.style.background = charDef.color || '';
    nameTag.style.borderColor = charDef.color ? `color-mix(in srgb, ${charDef.color} 60%, #fff 40%)` : '';
    nameTag.style.color = '#f4f1e8';

    /* Gradient dialogue box : couleur personnage en haut → bleu foncé en bas */
    const dialogBg = charDef.color
      ? `linear-gradient(180deg, color-mix(in srgb, ${charDef.color} 18%, #111c2e) 0%, #070e1c 100%)`
      : 'linear-gradient(180deg, #111c2e 0%, #070e1c 100%)';
    this.dialogueBox.style.background = dialogBg;

    this.dialogueBox.classList.remove('italic-line');
    this.dialogueText.classList.remove('narrator');
    this.dialogueText.style.textAlign = '';
    this._lastAlign = align;

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

    /* Avatar — toujours Will à gauche */
    this.choiceAvatar.innerHTML = '';
    const willDef = this.game.characters['will'];
    if (willDef?.sprite) {
      const img = document.createElement('img');
      img.src = `${willDef.sprite}/doubting.png`;
      this.choiceAvatar.appendChild(img);
    }
    this.choicePanel.classList.remove('choice-right');
    this.choicePanel.classList.add('choice-left');

    this.choiceOptions.innerHTML = '';
    const btns = [];
    /* "Nouveau" = option pédagogique (a un opt.id stable) jamais cliquée.
       Les options sans id (navigation, système, voyage, inline) ne sont jamais marquées. */
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'choice choice-btn';
      btn.textContent = opt.text;
      const id = opt.id;
      if (id && !this.seenChoices.has(id)) {
        btn.classList.add('choice-new');
      }
      btn.addEventListener('click', () => {
        if (id) this.seenChoices.add(id);
        opt.action();
      });
      this.choiceOptions.appendChild(btn);
      btns.push(btn);
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
      const tok = tokens[i];
      i++;
      /* Shake fires on first char of a marked segment */
      if (tok.shake) this._shake(tok.shake);
      /* Rebuild full HTML up to current position — avoids innerHTML+= breaking open tags */
      this.dialogueText.innerHTML = renderFromTokens(tokens, i);
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
      i++;
      this.dialogueText.textContent = text.slice(0, i);
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
    /* level 1 = ## (léger), level 2 = ### (fort) */
    const el = document.getElementById('screen-game');
    const cls = level >= 2 ? 'shake-strong' : 'shake-light';
    el.classList.remove('shake-light', 'shake-strong');
    /* force reflow so re-trigger works */
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

/* ---------- App Bootstrap ---------- */
class App {
  constructor() {
    this.settings = Settings.load();
    this.screens  = new ScreenManager();
    this.lesson   = new LessonOverlay();
    this.engine   = null;
    this.game     = null;
    window._app   = this;
  }

  async init() {
    try {
      this.game = await fetch('./data/game.json').then(r => r.json());
    } catch (err) {
      console.error('Failed to load data/game.json', err);
      alert('Impossible de charger data/game.json. Utilisez un serveur HTTP local.');
      return;
    }

    this.bindMenu();
    this.bindSettings();
    this.screens.show('title');
  }

  bindMenu() {
    const titleScreen = document.getElementById('screen-title');
    const defaultBg   = "url('images/titlescreen.png')";

    document.querySelectorAll('.menu [data-action]').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        const a = btn.dataset.action;
        let bg = defaultBg;
        if (a === 'settings') bg = "url('images/titlescreen-settings.png')";
        else if (a === 'credits') bg = "url('images/titlescreen-credits.png')";
        titleScreen.style.setProperty('--title-bg', bg);
      });

      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if (a === 'play') {
          this.confirm(
            'LANCER LA PARTIE',
            'Aucune sauvegarde disponible. Toute progression sera perdue à la fermeture. Prêt à commencer ?',
            () => this.startGame()
          );
        } else if (a === 'settings') {
          this.screens.show('settings');
        } else if (a === 'credits') {
          this.screens.show('credits');
        } else if (a === 'back-title') {
          this.goToTitle();
        }
      });
    });

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
    this.engine = new VNEngine(this.game, this.settings, this.lesson);
    this.engine.start();
  }

  goToTitle() {
    if (this.engine) { this.engine.stop(); this.engine = null; }
    this.screens.show('title');
  }

  confirm(title, body, onConfirm) {
    const popup      = document.getElementById('screen-popup');
    const titleEl    = document.getElementById('popup-title');
    const bodyEl     = document.getElementById('popup-body');
    const confirmBtn = document.getElementById('popup-confirm');
    const cancelBtn  = document.getElementById('popup-cancel');

    titleEl.textContent = title;
    bodyEl.textContent  = body;
    popup.classList.remove('hidden');

    const close = () => {
      popup.classList.add('hidden');
      confirmBtn.onclick = null;
      cancelBtn.onclick  = null;
    };

    confirmBtn.onclick = () => { close(); onConfirm(); };
    cancelBtn.onclick  = () => { close(); };
  }
}

window.addEventListener('DOMContentLoaded', () => { new App().init(); });
