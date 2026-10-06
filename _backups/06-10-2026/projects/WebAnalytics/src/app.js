import { Settings } from './settings.js';
import { ScreenManager } from './screen-manager.js';
import { LessonOverlay } from './lesson-overlay.js';
import { VNEngine } from './vn-engine.js';

class App {
  constructor() {
    this.settings      = Settings.load();
    this.screens       = new ScreenManager();
    this.lesson        = new LessonOverlay();
    this.engine        = null;
    this.game          = null;
    this.seenLessons   = [];
    this.seenLessonIds = new Set();

    this.lesson.onShow = (lesson) => this.recordLesson(lesson);
  }

  recordLesson(lesson) {
    const id = lesson.id || lesson.title || JSON.stringify(lesson.blocks || []).slice(0, 80);
    if (this.seenLessonIds.has(id)) return;
    this.seenLessonIds.add(id);
    this.seenLessons.push({ id, title: lesson.title || 'Sans titre', blocks: lesson.blocks || [], isNew: true });
    document.getElementById('lessons-new-badge')?.classList.remove('hidden');
  }

  openLessonsInventory() {
    const popup  = document.getElementById('screen-lessons');
    const listEl = document.getElementById('lessons-list');
    document.getElementById('lessons-new-badge')?.classList.add('hidden');
    listEl.innerHTML = '';

    if (this.seenLessons.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lessons-empty';
      empty.textContent = 'AUCUN COURS DECOUVERT POUR LE MOMENT';
      listEl.appendChild(empty);
    } else {
      [...this.seenLessons].reverse().forEach((les) => {
        const btn = document.createElement('button');
        btn.className = 'choice lesson-item';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = (les.title || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
        btn.appendChild(titleSpan);

        if (les.isNew) {
          const newTag = document.createElement('span');
          newTag.className = 'lesson-item-new';
          newTag.textContent = 'NEW';
          btn.appendChild(newTag);
        }

        btn.addEventListener('click', () => {
          les.isNew = false;
          btn.querySelector('.lesson-item-new')?.remove();
          popup.classList.add('hidden');
          this.lesson.show(les).then(() => popup.classList.remove('hidden'));
        });
        listEl.appendChild(btn);
      });
    }

    popup.classList.remove('hidden');
  }

  /**
   * Ouvre le carnet en mode "presentation de preuve".
   * Renvoie une Promise qui resout { result: 'correct'|'wrong'|'cancel', lessonId }.
   * Si aucune lecon n'a encore ete debloquee, resout immediatement en 'cancel' :
   * le moteur peut alors sauter le step.
   */
  presentEvidence(expectedLessonId) {
    return new Promise(resolve => {
      if (this.seenLessons.length === 0) { resolve({ result: 'cancel', lessonId: null }); return; }

      const popup  = document.getElementById('screen-lessons');
      const listEl = document.getElementById('lessons-list');
      const closeBtn = document.getElementById('lessons-close');
      const titleEl = popup.querySelector('.popup-title');

      const originalTitle = titleEl.textContent;
      const originalCloseLabel = closeBtn.textContent;
      titleEl.textContent = 'SORTIR UN ARGUMENT';
      closeBtn.textContent = 'LAISSER TOMBER';

      document.getElementById('lessons-new-badge')?.classList.add('hidden');
      listEl.innerHTML = '';
      popup.classList.add('lessons-select-mode');

      let selectedId = null;
      let presentBtn = popup.querySelector('#lessons-present');
      if (!presentBtn) {
        presentBtn = document.createElement('button');
        presentBtn.id = 'lessons-present';
        presentBtn.className = 'choice popup-btn';
        presentBtn.textContent = 'AVANCER';
        closeBtn.parentElement.insertBefore(presentBtn, closeBtn);
      }
      presentBtn.classList.remove('hidden');
      presentBtn.disabled = true;

      [...this.seenLessons].reverse().forEach((les) => {
        const btn = document.createElement('button');
        btn.className = 'choice lesson-item';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = (les.title || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
        btn.appendChild(titleSpan);

        btn.addEventListener('click', () => {
          selectedId = les.id;
          listEl.querySelectorAll('.lesson-item').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          presentBtn.disabled = false;
        });
        listEl.appendChild(btn);
      });

      const cleanup = () => {
        popup.classList.add('hidden');
        popup.classList.remove('lessons-select-mode');
        titleEl.textContent = originalTitle;
        closeBtn.textContent = originalCloseLabel;
        presentBtn.classList.add('hidden');
        closeBtn.onclick = null;
        presentBtn.onclick = null;
      };

      closeBtn.onclick = () => {
        cleanup();
        resolve({ result: 'cancel', lessonId: null });
      };

      presentBtn.onclick = () => {
        if (!selectedId) return;
        const result = selectedId === expectedLessonId ? 'correct' : 'wrong';
        cleanup();
        resolve({ result, lessonId: selectedId });
      };

      popup.classList.remove('hidden');
    });
  }

  _resetLessonState() {
    this.seenLessons = [];
    this.seenLessonIds = new Set();
    document.getElementById('lessons-new-badge')?.classList.add('hidden');
  }

  async init() {
    try {
      const files = [
        'data/settings.json',
        'data/flags.json',
        'data/characters.json',
        'data/environments.json',
        'data/locations.json',
        'data/connections.json',
      ];
      const [game_settings, flags, characters, environments, locations, global_connections] =
        await Promise.all(files.map(f => fetch(f).then(r => r.json())));
      this.game = { game_settings, flags, characters, environments, locations, global_connections };
    } catch (err) {
      console.error('Failed to load game data', err);
      alert('Impossible de charger les donnees du jeu. Utilisez un serveur HTTP local.');
      return;
    }
    this.bindMenu();
    this.bindSettings();
    this.screens.show('title');
  }

  bindMenu() {
    const titleScreen = document.getElementById('screen-title');
    const defaultBg   = "url('images/Environments/outside.png')";

    document.querySelectorAll('.menu [data-action]').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        const a = btn.dataset.action;
        let bg = defaultBg;
        if (a === 'settings') bg = "url('images/Environments/data.png')";
        else if (a === 'credits') bg = "url('images/Environments/seo.png')";
        titleScreen.style.setProperty('--title-bg', bg);
      });

      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if (a === 'play') {
          this.confirm(
            'LANCER LA PARTIE',
            'Aucune sauvegarde disponible. Toute progression sera perdue a la fermeture. Pret a commencer ?',
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

    const gameMenuPopup  = document.getElementById('screen-game-menu');
    const closeGameMenu  = () => gameMenuPopup.classList.add('hidden');

    document.getElementById('back-to-title').addEventListener('click', () => gameMenuPopup.classList.remove('hidden'));
    document.getElementById('game-menu-quit').addEventListener('click', () => { closeGameMenu(); this.goToTitle(); });
    document.getElementById('game-menu-cancel').addEventListener('click', closeGameMenu);

    const lessonsPopup = document.getElementById('screen-lessons');
    document.getElementById('open-lessons').addEventListener('click', () => this.openLessonsInventory());
    document.getElementById('lessons-close').addEventListener('click', () => lessonsPopup.classList.add('hidden'));
  }

  bindSettings() {
    const musicBtn = document.getElementById('toggle-music');
    const autoBtn  = document.getElementById('toggle-autoplay');

    const refresh = () => {
      musicBtn.textContent = this.settings.music    ? 'ON' : 'OFF';
      autoBtn.textContent  = this.settings.autoplay ? 'ON' : 'OFF';
    };

    musicBtn.addEventListener('click', () => { this.settings.music    = !this.settings.music;    Settings.save(this.settings); refresh(); });
    autoBtn.addEventListener('click',  () => { this.settings.autoplay = !this.settings.autoplay; Settings.save(this.settings); refresh(); });

    refresh();
  }

  startGame() {
    this._resetLessonState();
    this.screens.show('game');
    this.engine = new VNEngine(this.game, this.settings, this.lesson, () => this.goToTitle(), (id) => this.presentEvidence(id));
    this.engine.start();
  }

  goToTitle() {
    if (this.engine) { this.engine.stop(); this.engine = null; }
    this._resetLessonState();
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
    cancelBtn.onclick  = () => close();
  }
}

window.addEventListener('DOMContentLoaded', () => { new App().init(); });
