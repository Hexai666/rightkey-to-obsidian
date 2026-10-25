const DEFAULTS = {
  obsidianPath: '',
  folder: '',
  mode: 'new',
  appendFile: '网页摘录',
  openNote: true,
  tags: 'web-clip'
};

document.addEventListener('DOMContentLoaded', function() {
  const $ = (id) => document.getElementById(id);
  const statusDiv = $('status');

  // 只有追加模式需要填写笔记名；标签只写入新建的笔记
  function updateModeFields() {
    const append = $('modeAppend').checked;
    $('appendGroup').style.display = append ? 'block' : 'none';
    $('tagsGroup').style.display = append ? 'none' : 'block';
  }

  // 加载已保存的设置
  chrome.storage.sync.get(DEFAULTS, function(s) {
    $('obsidianPath').value = s.obsidianPath;
    $('folder').value = s.folder;
    $('appendFile').value = s.appendFile;
    $('tags').value = s.tags;
    $('openNote').checked = s.openNote;
    $(s.mode === 'append' ? 'modeAppend' : 'modeNew').checked = true;
    updateModeFields();
  });

  $('modeNew').addEventListener('change', updateModeFields);
  $('modeAppend').addEventListener('change', updateModeFields);

  // 保存设置
  $('save').addEventListener('click', function() {
    const vault = $('obsidianPath').value.trim();

    if (!vault) {
      showStatus('请输入 Obsidian Vault 名称', 'error');
      return;
    }

    chrome.storage.sync.set({
      obsidianPath: vault,
      folder: $('folder').value.trim(),
      mode: $('modeAppend').checked ? 'append' : 'new',
      appendFile: $('appendFile').value.trim() || DEFAULTS.appendFile,
      openNote: $('openNote').checked,
      tags: $('tags').value.trim()
    }, function() {
      showStatus('设置已保存', 'success');
    });
  });

  // 测试连接：尝试在 Obsidian 中打开该 vault
  $('test').addEventListener('click', function() {
    const vault = $('obsidianPath').value.trim();
    if (!vault) {
      showStatus('请先输入 Obsidian Vault 名称', 'error');
      return;
    }
    window.location.href = 'obsidian://open?vault=' + encodeURIComponent(vault);
    showStatus('已尝试打开 Obsidian。如果 Obsidian 提示找不到 vault，请检查名称是否正确', 'success');
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    setTimeout(function() {
      statusDiv.style.display = 'none';
    }, 4000);
  }
});
