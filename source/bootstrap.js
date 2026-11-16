/* Zotero 10 bootstrap. Credentials stored through the login manager. */
var chromeHandle;
var TermAI;
function install() {}
function uninstall() {}
async function startup({ id, rootURI }) {
  await Zotero.initializationPromise;
  // Older releases lost track of dialogs during about:blank navigation. Those
  // windows can retain an API object from before a hot upgrade.
  for (const win of Services.wm.getEnumerator(null)) {
    if (win.location?.href.startsWith('chrome://term-ai/content/dialog.xhtml')) win.close();
  }
  const am = Components.classes['@mozilla.org/addons/addon-manager-startup;1'].getService(Components.interfaces.amIAddonManagerStartup);
  chromeHandle = am.registerChrome(Services.io.newURI(rootURI + 'manifest.json'), [
    ['content', 'term-ai', rootURI + 'content/']
  ]);
  const scope = { Zotero, Services, ChromeUtils, Components, XMLHttpRequest };
  Services.scriptloader.loadSubScriptWithOptions(rootURI + 'content/core.js', {
    target: scope, ignoreCache: true
  });
  TermAI = scope.TermAI;
  if (TermAI?.version !== '0.2.9' || typeof TermAI.baseURL !== 'function') {
    throw new Error('术语 AI 核心脚本版本不一致，请完全退出 Zotero 后重新打开。');
  }
  TermAI.start(id);
  Zotero.TermAI = TermAI;
  await Zotero.PreferencePanes.register({
    pluginID: id, id: 'term-ai-preferences', label: '术语 AI',
    src: rootURI + 'content/preferences.xhtml',
    scripts: [rootURI + 'content/preferences.js']
  });
  for (const window of Zotero.getMainWindows()) TermAI.addMainWindow(window);
}
function shutdown() {
  if (TermAI) TermAI.stop();
  delete Zotero.TermAI;
  if (chromeHandle) chromeHandle.destruct();
  TermAI = null;
}
function onMainWindowLoad({ window }) { if (TermAI) TermAI.addMainWindow(window); }
function onMainWindowUnload({ window }) { if (TermAI) TermAI.removeMainWindow(window); }
