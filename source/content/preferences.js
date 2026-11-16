var TermAIPreferences = {
  init() {
    document.getElementById('term-ai-font-size').value = Zotero.TermAI.commentFontSize();
    this.preview();
  },
  preview() {
    const size = Number(document.getElementById('term-ai-font-size').value);
    if (Number.isInteger(size) && size >= 10 && size <= 32) {
      document.getElementById('term-ai-font-preview').style.fontSize = size + 'px';
    }
  },
  save() {
    try {
      const size = Zotero.TermAI.setCommentFontSize(document.getElementById('term-ai-font-size').value);
      this.preview();
      document.getElementById('term-ai-font-status').textContent = '已应用 ' + size + ' px，已打开的阅读器立即生效。';
    } catch (e) { document.getElementById('term-ai-font-status').textContent = e.message; }
  },
  reset() {
    document.getElementById('term-ai-font-size').value = 16;
    this.save();
  }
};
