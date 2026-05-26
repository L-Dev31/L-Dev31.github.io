export class Settings {
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
