document.addEventListener('DOMContentLoaded', function() {
  // 检查是否已配置 vault 名称
  chrome.storage.sync.get(['obsidianPath'], function(result) {
    if (result.obsidianPath) {
      showStatus('当前 Vault：' + result.obsidianPath, 'success');
    } else {
      showStatus('尚未设置 Vault 名称，请先打开设置', 'error');
    }
  });

  // 显示当前快捷键
  chrome.commands.getAll(function(commands) {
    const cmd = commands.find(function(c) { return c.name === 'send-selection'; });
    if (cmd && cmd.shortcut) {
      document.getElementById('shortcut').textContent = cmd.shortcut;
    }
  });

  document.getElementById('editShortcut').addEventListener('click', function(e) {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  document.getElementById('openOptions').addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });
});

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  statusDiv.style.display = 'block';
}
