// Inkrementalno čita JSON odgovor modela ({"say","fact","actions":[...]}) dok stiže:
// tekst se prikazuje slovo po slovo, a svaka akcija se izvršava čim se njen objekat zatvori.

function partialString(buf, key) {
  const m = buf.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)(")?`));
  if (!m) return null;
  // odsijeci nedovršenu escape sekvencu na kraju (npr. "\" ili "\u00")
  const raw = m[1].replace(/\\(u[0-9a-fA-F]{0,3})?$/, '');
  try {
    return { text: JSON.parse(`"${raw}"`), done: !!m[2] };
  } catch {
    return null;
  }
}

export class AnswerStream {
  constructor({ onSay, onAction, onProgress }) {
    Object.assign(this, { onSay, onAction, onProgress });
    this.buf = '';
    this.arrStart = -1; // pozicija "[" iza "actions"
    this.pos = 0;
    this.depth = 0;
    this.inStr = false;
    this.esc = false;
    this.objStart = -1;
    this.actions = [];
    this.lastSay = '';
  }

  push(text) {
    this.buf += text;

    const say = partialString(this.buf, 'say');
    if (say && say.text !== this.lastSay) {
      this.lastSay = say.text;
      this.onSay?.(say.text, say.done);
    }

    if (this.arrStart < 0) {
      const m = /"actions"\s*:\s*\[/.exec(this.buf);
      if (!m) return;
      this.arrStart = m.index + m[0].length;
      this.pos = this.arrStart;
    }
    this.scan();
  }

  scan() {
    const b = this.buf;
    for (; this.pos < b.length; this.pos++) {
      const c = b[this.pos];
      if (this.inStr) {
        if (this.esc) this.esc = false;
        else if (c === '\\') this.esc = true;
        else if (c === '"') this.inStr = false;
        continue;
      }
      if (c === '"') this.inStr = true;
      else if (c === '{' || c === '[') {
        if (this.depth === 0 && c === '{') this.objStart = this.pos;
        this.depth++;
      } else if (c === '}' || c === ']') {
        if (this.depth === 0) return; // kraj niza akcija
        this.depth--;
        if (this.depth === 0 && c === '}') {
          try {
            const action = JSON.parse(b.slice(this.objStart, this.pos + 1));
            this.actions.push(action);
            this.onAction?.(action);
          } catch (e) {
            console.warn('Nepotpuna akcija', e);
          }
          this.objStart = -1;
        }
      }
    }
    // napredak dugačke akcije (npr. molekul sa mnogo atoma)
    if (this.objStart >= 0) {
      const partial = b.slice(this.objStart);
      const type = partial.match(/"type"\s*:\s*"(\w+)"/)?.[1];
      this.onProgress?.(type, (partial.match(/"el"/g) || []).length);
    }
  }
}
