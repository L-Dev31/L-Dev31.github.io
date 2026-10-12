export class LessonOverlay {
  constructor() {
    this.el       = document.getElementById('lesson-overlay');
    this.title    = document.getElementById('lesson-title');
    this.body     = document.getElementById('lesson-body');
    this.closeBtn = document.getElementById('lesson-close');
    this._resolve = null;

    this.onShow = null;

    this.closeBtn.addEventListener('click', () => this._close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.classList.contains('hidden')) this._close();
    });
  }

  show(lesson) {
    this.onShow?.(lesson);
    this.title.textContent = (lesson.title || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
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
        h.innerHTML = this._md((block.content || '').normalize('NFD').replace(/[̀-ͯ]/g, ''));
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
        aside.innerHTML = this._md((block.content || '').normalize('NFD').replace(/[̀-ͯ]/g, ''));
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

  _md(str) {
    if (!str) return '';
    const escaped = str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/`(.+?)`/g,       '<code>$1</code>');
  }
}
