'use strict';
const $ = id => document.getElementById(id);
let api;
let modelIDs = [], openChoice = null, serviceChoice, modelChoice;
const services = [
  ['openailiked', 'OpenAI 兼容 / 自定义'], ['openai', 'OpenAI'],
  ['deepseek', 'DeepSeek（兼容接口）'], ['siliconflow', 'SiliconFlow（兼容接口）'], ['local', '本地兼容服务']
];
function closeChoices() {
  if (!openChoice) return;
  openChoice.panel.hidden = true;
  openChoice.trigger.setAttribute('aria-expanded', 'false');
  openChoice = null;
}
function dropdown(triggerID, panelID, optionsID, getItems, selected, choose, searchID) {
  const trigger = $(triggerID), panel = $(panelID), options = $(optionsID);
  const search = searchID && $(searchID);
  function render() {
    options.replaceChildren();
    const query = search ? search.value.trim().toLowerCase() : '';
    const items = getItems().filter(([, label]) => label.toLowerCase().includes(query));
    for (const [value, label] of items) {
      const option = document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
      option.type = 'button'; option.className = 'choice-option'; option.textContent = label;
      option.dataset.value = value; option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(selected() === value));
      option.addEventListener('click', () => { choose(value); closeChoices(); trigger.focus(); });
      options.append(option);
    }
    if (!items.length) {
      const message = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      message.className = 'choice-empty';
      message.textContent = query ? '没有匹配的模型，可关闭列表后手动输入。' : '尚无模型列表，请点击“获取模型列表”，或直接输入模型 ID。';
      options.append(message);
    }
  }
  function show() {
    if (trigger.disabled) return;
    closeChoices();
    if (search) search.value = '';
    render(); panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true'); openChoice = { trigger, panel };
    const rect = (triggerID === 'modelButton' ? $('model').parentElement : trigger).getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth - 24);
    panel.style.width = width + 'px';
    panel.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + 'px';
    const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
    const useBelow = below >= 220 || below >= above;
    panel.style.maxHeight = Math.max(70, Math.min(280, useBelow ? below : above)) + 'px';
    panel.style.top = useBelow ? (rect.bottom + 4) + 'px' : 'auto';
    panel.style.bottom = useBelow ? 'auto' : (window.innerHeight - rect.top + 4) + 'px';
    (search || options.querySelector('[aria-selected="true"]') || options.querySelector('button'))?.focus();
  }
  trigger.addEventListener('click', () => openChoice?.trigger === trigger ? closeChoices() : show());
  trigger.addEventListener('keydown', e => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); show(); }
  });
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeChoices(); trigger.focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const buttons = [...options.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      const next = index < 0 ? (e.key === 'ArrowDown' ? 0 : buttons.length - 1)
        : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  });
  search?.addEventListener('input', render);
  return { show, render };
}
function clearModels() {
  modelIDs = []; closeChoices();
  $('modelHint').textContent = '获取列表后点击右侧箭头选择模型；也可直接输入。';
}
function base() {
  return api.baseURL($('base').value);
}
function status(s) { $('status').textContent = s; }
function busy(value) {
  if (value) closeChoices();
  for (const element of document.querySelectorAll('input, select, textarea, button')) {
    if (element.id !== 'close') element.disabled = value;
  }
}
async function keyStatus() {
  try {
    const b = base();
    const key = await api.getKey(b);
    if (b === base()) $('keyStatus').textContent = key ? '此地址已保存密钥；留空可继续使用。' : '此地址尚未保存密钥；本地免密服务可留空。';
  } catch (_) { $('keyStatus').textContent = '填写有效地址后可查看密钥保存状态。'; }
}
async function currentKey(b) {
  return $('removeKey').checked ? '' : ($('key').value.trim() || await api.getKey(b));
}
window.addEventListener('DOMContentLoaded', () => {
  api = (window.arguments[0].wrappedJSObject || window.arguments[0]).api;
  if (api?.version !== '0.2.9' || typeof api.baseURL !== 'function') {
    busy(true);
    $('close').addEventListener('click', () => window.close());
    status('配置窗口与插件核心版本不一致。请关闭此窗口，完全退出 Zotero 后重新打开 API 配置。');
    return;
  }
  try {
    const c = JSON.parse(api.pref('config') || '{}');
    $('base').value = c.baseURL || api.pref('endpoint').replace(/\/chat\/completions\/?$/, '');
    $('model').value = c.model || api.pref('model'); $('service').value = c.service || 'openailiked';
    $('extra').value = c.extra || '{}'; $('title').checked = !!c.sendTitle; $('consent').checked = !!c.consent;
  } catch (_) { status('原配置无法读取，请重新填写。'); }
  $('commentFont').value = api.commentFontSize();
  const previewFont = () => {
    const size = Number($('commentFont').value);
    if (Number.isInteger(size) && size >= 10 && size <= 32) $('fontPreview').style.fontSize = size + 'px';
  };
  const applyFont = () => {
    try {
      const size = api.setCommentFontSize($('commentFont').value);
      previewFont(); $('fontStatus').textContent = '已应用 ' + size + ' px，阅读器立即生效。';
    } catch (e) { $('fontStatus').textContent = e.message; }
  };
  previewFont();
  $('commentFont').addEventListener('input', previewFont);
  $('fontApply').addEventListener('click', applyFont);
  $('fontReset').addEventListener('click', () => { $('commentFont').value = 16; applyFont(); });
  if (!services.some(([id]) => id === $('service').value)) $('service').value = 'openailiked';
  $('serviceText').textContent = services.find(([id]) => id === $('service').value)[1];
  serviceChoice = dropdown('serviceButton', 'serviceMenu', 'serviceOptions', () => services,
    () => $('service').value, value => {
      if (value === $('service').value) return;
      $('service').value = value;
      $('serviceText').textContent = services.find(([id]) => id === value)[1];
      $('service').dispatchEvent(new Event('change'));
    });
  modelChoice = dropdown('modelButton', 'modelMenu', 'modelOptions',
    () => [...new Set([...modelIDs, $('model').value.trim()].filter(Boolean))].map(id => [id, id]),
    () => $('model').value, value => { $('model').value = value; }, 'modelSearch');
  document.addEventListener('pointerdown', e => {
    if (openChoice && !openChoice.panel.contains(e.target) && !openChoice.trigger.contains(e.target)) closeChoices();
  });
  document.addEventListener('focusin', e => {
    if (openChoice && !openChoice.panel.contains(e.target) && e.target !== openChoice.trigger) closeChoices();
  });
  document.querySelector('main').addEventListener('scroll', closeChoices);
  window.addEventListener('resize', closeChoices);
  keyStatus();
  $('base').addEventListener('input', () => { $('key').value = ''; $('consent').checked = false; $('removeKey').checked = false; clearModels(); keyStatus(); });
  $('service').addEventListener('change', () => {
    $('key').value = ''; $('consent').checked = false; $('removeKey').checked = false;
    const urls = {openai:'https://api.openai.com/v1',deepseek:'https://api.deepseek.com/v1',siliconflow:'https://api.siliconflow.cn/v1',local:'http://localhost:1234/v1',openailiked:''};
    $('base').value = urls[$('service').value];
    clearModels();
    $('model').value = '';
    keyStatus();
  });
  $('close').addEventListener('click', () => window.close());
  $('save').addEventListener('click', async () => {
    busy(true);
    try {
      const b = base(); const model = $('model').value.trim();
      if (!model) throw new Error('请填写模型名称。');
      api.extra($('extra').value);
      if (!$('consent').checked) throw new Error('请确认数据发送与直接写入评论授权。');
      if ($('removeKey').checked && $('key').value.trim()) throw new Error('删除密钥与输入新密钥不能同时选择。');
      if ($('removeKey').checked) await api.storeKey(b, '');
      else if ($('key').value.trim()) await api.storeKey(b, $('key').value.trim());
      api.pref('config', JSON.stringify({service:$('service').value,baseURL:b,model,extra:$('extra').value,sendTitle:$('title').checked,consent:true}));
      $('key').value = ''; $('removeKey').checked = false; $('base').value = b;
      await keyStatus();
      status('配置已保存。关闭此窗口，再选中文字点击 AI 解释即可直接写入评论。');
    } catch (e) { status('保存失败：' + e.message); }
    finally { busy(false); }
  });
  $('testButton').addEventListener('click', async () => {
    busy(true);
    try {
      const b = base(), model = $('model').value.trim();
      if (!model) throw new Error('请先填写模型名称。');
      const extra = api.extra($('extra').value);
      if (!window.confirm('将向 ' + b + '/chat/completions 发送密钥和固定测试消息，不发送论文内容。可能产生少量费用，是否继续？')) return;
      status('正在测试连接，请稍候（最多 60 秒）…');
      const data = await api.request(b + '/chat/completions', await currentKey(b), {
        ...extra, model, stream: false, messages: [{role:'user',content:'请只回复 OK。这是一条 API 连接测试消息。'}]
      });
      if (typeof data?.choices?.[0]?.message?.content !== 'string' || !data.choices[0].message.content.trim()) {
        throw new Error('接口未返回有效文本，请检查模型是否支持 Chat Completions。');
      }
      status('连接成功：模型已返回有效文本。测试不会保存配置，请点击“保存配置”。');
    } catch (e) { status('连接测试失败：' + e.message); }
    finally { busy(false); }
  });
  $('modelsButton').addEventListener('click', async () => {
    busy(true);
    let loaded = false;
    try {
      const b = base();
      if (!window.confirm('将向 ' + b + '/models 发送密钥以获取模型列表，不发送论文内容。是否继续？')) return;
      const key = await currentKey(b);
      const data = await api.request(b + '/models', key);
      if (!Array.isArray(data?.data)) throw new Error('服务未返回兼容的模型列表；可手动填写模型。');
      modelIDs = [...new Set(data.data.map(x=>x?.id).filter(x=>typeof x==='string' && x.trim()))].sort().slice(0,1000);
      loaded = modelIDs.length > 0;
      $('modelHint').textContent = loaded ? '已加载 ' + modelIDs.length + ' 个模型，点击箭头可搜索并选择。' : '服务返回空模型列表，可直接输入模型 ID。';
      status(loaded ? '模型列表已加载，请在下拉列表中选择；选好后保存配置。' : '服务返回空模型列表，请手动填写模型名称。');
    } catch (e) { status(e.message); }
    finally { busy(false); if (loaded) modelChoice.show(); }
  });
});
