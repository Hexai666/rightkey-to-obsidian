// 默认设置（obsidianPath 实际存的是 vault 名称，沿用旧键名，老用户升级后无需重新设置）
const DEFAULTS = {
  obsidianPath: '',
  folder: '',            // 保存到 vault 内的文件夹，留空为根目录
  mode: 'new',           // new：每次新建一篇笔记；append：追加到同一篇笔记
  appendFile: '网页摘录', // 追加模式下的笔记名
  openNote: true,        // 保存后是否切换到 Obsidian 显示该笔记
  tags: 'web-clip'
};

// 编码后内容超过这个长度时改用剪贴板传递，避免链接过长导致保存失败（Windows 上尤其明显）
const URI_LIMIT = 8000;

// 创建右键菜单
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'sendSelection',
      title: '发送到 Obsidian',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'sendPage',
      title: '保存本页链接到 Obsidian',
      contexts: ['page']
    });
  });

  // 首次安装时打开设置页面
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// 处理右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sendSelection') {
    clip(tab, { frameId: info.frameId, fallbackText: info.selectionText, pageUrl: info.pageUrl });
  } else if (info.menuItemId === 'sendPage') {
    clip(tab, { pageOnly: true, pageUrl: info.pageUrl });
  }
});

// 处理快捷键：有选中文本时发送文本，没有时保存页面链接
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'send-selection') return;
  if (!tab) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (tab) clip(tab, {});
});

async function clip(tab, { frameId, fallbackText, pageOnly, pageUrl }) {
  try {
    const settings = await chrome.storage.sync.get(DEFAULTS);
    if (!settings.obsidianPath) {
      chrome.runtime.openOptionsPage();
      return;
    }

    let text = '';
    if (!pageOnly) {
      // 优先从页面读取选中内容，可以保留换行；读取失败时（如 Chrome 内置页面）使用右键菜单提供的文本
      text = (await readSelection(tab, frameId)) || (fallbackText || '').trim();
    }

    const page = { url: tab.url || pageUrl || '', title: tab.title || '' };
    const note = buildNote(text, page, settings);
    let useClipboard = false;
    if (encodeURIComponent(note.content).length > URI_LIMIT) {
      useClipboard = await copyViaPage(tab, note.content);
    }

    await openUri(tab, buildUri(settings, note, useClipboard));
    notify(tab, true, useClipboard ? '已发送到 Obsidian（长文本经剪贴板传递）' : '已发送到 Obsidian');
  } catch (e) {
    console.error(e);
    notify(tab, false, '发送失败：' + e.message);
  }
}

async function readSelection(tab, frameId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [frameId || 0] },
      func: () => window.getSelection().toString()
    });
    return ((res && res.result) || '').trim();
  } catch (e) {
    return '';
  }
}

function buildNote(text, page, settings) {
  const now = new Date();
  const title = page.title || page.url || '未命名网页';
  const source = page.url ? `[${title.replace(/([\[\]])/g, '\\$1')}](<${page.url}>)` : title;
  const folder = cleanPath(settings.folder);
  const withFolder = (name) => (folder ? `${folder}/${name}` : name);

  if (settings.mode === 'append') {
    // 追加模式：每条摘录是一个以时间为标题的小节
    const body = text ? `${text}\n\n来源：${source}` : `来源：${source}`;
    return {
      file: withFolder(cleanName(settings.appendFile) || '网页摘录'),
      content: `\n\n## ${formatTime(now, ' ')}\n\n${body}\n`,
      append: true
    };
  }

  const tags = settings.tags.split(/[,，\s]+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `source: ${JSON.stringify(page.url)}`,
    `created: ${formatTime(now, 'T')}`
  ];
  if (tags.length) frontmatter.push(`tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`);
  frontmatter.push('---');

  const body = text ? `${text}\n\n来源：${source}` : `来源：${source}`;
  return {
    file: withFolder(makeFileName(text || title, now)),
    content: `${frontmatter.join('\n')}\n\n${body}\n`,
    append: false
  };
}

// 文件名：选中文本前 20 个字 + 日期时间，避免重名
function makeFileName(text, now) {
  const head = cleanName(Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, 20).join('')) || '网页摘录';
  return `${head} ${formatStamp(now)}`;
}

// 去掉 Obsidian 文件名中不允许或会引起问题的字符
function cleanName(name) {
  return (name || '').replace(/[\\/:*?"<>|#^\[\]]/g, '').replace(/^\.+/, '').trim();
}

function cleanPath(path) {
  return (path || '')
    .split(/[\\/]+/)
    .map(cleanName)
    .filter(Boolean)
    .join('/');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// 2026-10-25T14:30（Obsidian 属性可识别的日期时间格式）
function formatTime(d, sep) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${sep}${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 20261025-143005
function formatStamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function buildUri(settings, note, useClipboard) {
  // 手动拼接参数：URLSearchParams 会把空格编码成 "+"，Obsidian 不会还原
  const params = [`vault=${encodeURIComponent(settings.obsidianPath)}`, `file=${encodeURIComponent(note.file)}`];
  if (note.append) params.push('append=true');
  if (!settings.openNote) params.push('silent=true');
  params.push(useClipboard ? 'clipboard=true' : `content=${encodeURIComponent(note.content)}`);
  return 'obsidian://new?' + params.join('&');
}

async function copyViaPage(tab, text) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (t) => {
        try {
          await navigator.clipboard.writeText(t);
          return true;
        } catch (e) {
          const area = document.createElement('textarea');
          area.value = t;
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.documentElement.appendChild(area);
          area.select();
          const ok = document.execCommand('copy');
          area.remove();
          return ok;
        }
      },
      args: [text]
    });
    return !!(res && res.result);
  } catch (e) {
    return false;
  }
}

// 在当前标签页打开 Obsidian 链接（外部协议不会让页面跳转）；失败时用后台标签页打开后关闭
async function openUri(tab, uri) {
  try {
    if (!tab || tab.id < 0) throw new Error('no tab');
    await chrome.tabs.update(tab.id, { url: uri });
  } catch (e) {
    const t = await chrome.tabs.create({ url: uri, active: false });
    setTimeout(() => chrome.tabs.remove(t.id).catch(() => {}), 3000);
  }
}

// 保存结果反馈：扩展图标角标 + 页面右上角提示
async function notify(tab, ok, message) {
  if (!tab || tab.id < 0) return;
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: ok ? '#16A34A' : '#DC2626' });
  chrome.action.setBadgeText({ tabId: tab.id, text: ok ? '✓' : '!' });
  setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(() => {}), 3000);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (msg, success) => {
        const el = document.createElement('div');
        el.textContent = msg;
        Object.assign(el.style, {
          position: 'fixed', top: '16px', right: '16px', zIndex: '2147483647',
          padding: '10px 16px', borderRadius: '6px', fontSize: '14px',
          fontFamily: 'system-ui, sans-serif', color: '#fff',
          background: success ? '#7C3AED' : '#DC2626',
          boxShadow: '0 4px 12px rgba(0,0,0,.2)'
        });
        document.documentElement.appendChild(el);
        setTimeout(() => el.remove(), 2500);
      },
      args: [message, ok]
    });
  } catch (e) {
    // Chrome 内置页面等无法注入脚本，只显示角标
  }
}
