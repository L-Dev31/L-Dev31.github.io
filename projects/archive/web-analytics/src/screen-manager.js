export class ScreenManager {
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
