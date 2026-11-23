(function () {
  // 所有写操作依赖 admin-cache.js 对 window.fetch 的补丁来自动附加 X-CSRF-Token。
  const ns = window.AdminSettings = window.AdminSettings || {};
  const currentSettings = ns.currentSettings || ns.defaults?.createDefaultSettings?.() || {};
  const ui = ns.backupUi || {};
  ns.currentSettings = currentSettings;

  function getBackupRefs() {
    return ui.getBackupRefs?.() || {};
  }

  function readFormConfig() {
    const refs = getBackupRefs();
    return {
      webdav_url: refs.urlInput?.value.trim() || '',
      webdav_username: refs.usernameInput?.value.trim() || '',
      webdav_dir: refs.dirInput?.value.trim() || '',
      webdav_password: refs.passwordInput?.value || '',
    };
  }

  function syncPasswordField() {
    ui.syncPasswordField?.(currentSettings);
  }

  /**
   * 只保存 WebDAV 字段。备份与恢复都以当前可见表单为准，每次操作前都落库，
   * 避免多标签页修改配置后，界面显示的目标与后端实际使用的目标不一致。
   */
  async function saveWebdavConfig(formConfig) {
    const payload = {
      webdav_url: formConfig.webdav_url,
      webdav_username: formConfig.webdav_username,
      webdav_dir: formConfig.webdav_dir,
    };
    const resolvedPassword = ns.defaults?.resolveWebdavPasswordForPayload?.(
      formConfig.webdav_password,
      currentSettings.has_webdav_password
    );
    if (resolvedPassword !== undefined) {
      payload.webdav_password = resolvedPassword;
    }

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.code !== 200) {
      throw new Error(data.message || '保存 WebDAV 配置失败');
    }

    Object.assign(currentSettings, payload);
    if (formConfig.webdav_password) {
      currentSettings.has_webdav_password = true;
      syncPasswordField();
    }
  }

  async function clearWebdavPassword() {
    const { clearPasswordBtn } = getBackupRefs();
    if (!clearPasswordBtn || clearPasswordBtn.disabled) return;

    clearPasswordBtn.disabled = true;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webdav_password: null }),
      });
      const data = await res.json();
      if (data.code !== 200) {
        throw new Error(data.message || '清除密码失败');
      }
      currentSettings.has_webdav_password = false;
      syncPasswordField();
      ui.showStatus?.('已清除保存的密码', 'success');
    } catch (e) {
      ui.showStatus?.(e.message || '清除密码失败', 'error');
    } finally {
      clearPasswordBtn.disabled = false;
    }
  }

  async function runBackup() {
    const { backupBtn } = getBackupRefs();
    if (!backupBtn || backupBtn.disabled) return;

    const formConfig = readFormConfig();
    if (!formConfig.webdav_url) {
      ui.showStatus?.('请先填写 WebDAV 服务器地址', 'error');
      return;
    }
    if (!formConfig.webdav_password && !currentSettings.has_webdav_password) {
      ui.showStatus?.('请先填写 WebDAV 密码', 'error');
      return;
    }

    const originalHtml = backupBtn.innerHTML;
    backupBtn.disabled = true;
    backupBtn.innerHTML = '<span>⏳</span> 备份中...';
    ui.showStatus?.('正在备份...', 'info');

    try {
      await saveWebdavConfig(formConfig);

      const res = await fetch('/api/backup/webdav', { method: 'POST' });
      const data = await res.json();
      if (data.code === 200) {
        const info = data.data || {};
        ui.showStatus?.(`备份成功：${info.filename}（${info.siteCount} 个书签，${info.categoryCount} 个分类）`, 'success');
        window.showMessage('备份成功', 'success');
      } else {
        ui.showStatus?.(data.message || '备份失败', 'error');
        window.showMessage(data.message || '备份失败', 'error');
      }
    } catch (e) {
      ui.showStatus?.('备份失败: ' + (e.message || '网络错误'), 'error');
      window.showMessage('备份失败', 'error');
    } finally {
      backupBtn.disabled = false;
      backupBtn.innerHTML = originalHtml;
    }
  }

  // 服务端只读已保存的配置，所以列表与恢复操作前也必须先把可见表单落库。
  async function requireWebdavConfig() {
    const formConfig = readFormConfig();
    if (!formConfig.webdav_url) {
      ui.showRestoreStatus?.('请先在「立即备份」区域填写 WebDAV 服务器地址', 'error');
      return null;
    }
    if (!formConfig.webdav_password && !currentSettings.has_webdav_password) {
      ui.showRestoreStatus?.('请先填写 WebDAV 密码', 'error');
      return null;
    }

    try {
      await saveWebdavConfig(formConfig);
    } catch (e) {
      ui.showRestoreStatus?.('保存 WebDAV 配置失败: ' + (e.message || '网络错误'), 'error');
      return null;
    }
    return formConfig;
  }

  let selectedBackup = '';
  let pendingConfirmAction = null;

  function selectBackupItem(item) {
    const { listWrap, restoreBtn } = getBackupRefs();
    if (!listWrap || !item) return;

    listWrap.querySelectorAll('.webdav-backup-item').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');
    selectedBackup = item.dataset.filename || '';
    if (restoreBtn) restoreBtn.disabled = !selectedBackup;
  }

  function openConfirmModal(options, action) {
    if (typeof action !== 'function' || !ui.openConfirmModal?.(options)) return;
    pendingConfirmAction = action;
  }

  function closeConfirmModal() {
    ui.closeConfirmModal?.();
    pendingConfirmAction = null;
  }

  function requestDeleteBackup(filename, item) {
    const safeFilename = String(filename || '');
    if (!safeFilename || !item) return;

    openConfirmModal({
      title: '确认删除',
      message: '确定要删除该备份吗？',
      description: '此操作无法撤销，请谨慎操作。',
      confirmLabel: '删除',
    }, () => deleteBackup(safeFilename, item));
  }

  function requestClearWebdavPassword() {
    const { clearPasswordBtn } = getBackupRefs();
    if (!clearPasswordBtn || clearPasswordBtn.disabled) return;

    openConfirmModal({
      title: '确认清除',
      message: '确定要清除已保存的 WebDAV 密码吗？',
      description: '清除后需要重新填写密码才能备份。',
      confirmLabel: '清除',
    }, clearWebdavPassword);
  }

  async function deleteBackup(filename, item) {
    const safeFilename = String(filename || '');
    if (!safeFilename || !item) return;

    const deleteBtn = item.querySelector?.('.webdav-backup-delete');
    if (deleteBtn?.disabled) return;
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.setAttribute('aria-busy', 'true');
    }

    try {
      const res = await fetch(`/api/backup/webdav?filename=${encodeURIComponent(safeFilename)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.code !== 200) {
        throw new Error(data.message || '删除备份失败');
      }

      const wasSelected = selectedBackup === safeFilename;
      item.remove();

      const { listWrap } = getBackupRefs();
      const remaining = listWrap?.querySelectorAll('.webdav-backup-item') || [];
      if (remaining.length === 0) {
        selectedBackup = '';
        ui.showEmptyBackupList?.();
      } else if (wasSelected) {
        selectBackupItem(remaining[0]);
      }

      ui.setRestoreError?.('');
      window.showMessage('备份已删除', 'success');
    } catch (e) {
      ui.setRestoreError?.(e.message || '删除备份失败');
    } finally {
      if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.removeAttribute('aria-busy');
      }
    }
  }

  function renderBackupList(backups) {
    const items = ui.renderBackupList?.(backups, {
      onSelect: selectBackupItem,
      onDelete: item => requestDeleteBackup(item.dataset.filename || '', item),
    }) || [];
    if (items.length > 0) selectBackupItem(items[0]);
  }

  async function fetchBackupList() {
    const { listBtn } = getBackupRefs();
    if (!listBtn || listBtn.disabled) return;
    if (!(await requireWebdavConfig())) return;

    selectedBackup = '';
    ui.openRestoreModal?.();

    try {
      const res = await fetch('/api/backup/webdav?limit=10');
      const data = await res.json();
      const { restoreLoading } = getBackupRefs();
      if (restoreLoading) restoreLoading.style.display = 'none';

      if (data.code !== 200) {
        ui.setRestoreError?.(data.message || '获取备份列表失败');
        return;
      }

      const backups = data.data?.backups || [];
      if (backups.length === 0) {
        ui.setRestoreError?.('未找到备份文件，请先执行一次备份');
        return;
      }
      renderBackupList(backups);
    } catch (e) {
      const { restoreLoading } = getBackupRefs();
      if (restoreLoading) restoreLoading.style.display = 'none';
      ui.setRestoreError?.('获取备份列表失败: ' + (e.message || '网络错误'));
    }
  }

  async function restoreBackup() {
    const { restoreBtn } = getBackupRefs();
    if (!restoreBtn || restoreBtn.disabled) return;
    if (!selectedBackup) {
      ui.setRestoreError?.('请先选择一个备份文件');
      return;
    }

    const filename = selectedBackup;
    const originalText = restoreBtn.textContent;
    restoreBtn.disabled = true;
    restoreBtn.textContent = '恢复中...';
    ui.setRestoreError?.('');

    try {
      const res = await fetch(`/api/backup/webdav?filename=${encodeURIComponent(filename)}`);
      const data = await res.json();
      if (data.code !== 200 || !data.data) {
        ui.setRestoreError?.(data.message || '恢复失败');
        return;
      }

      const payload = {
        category: data.data.category || [],
        sites: data.data.sites || [],
      };
      if (payload.sites.length === 0 && payload.category.length === 0) {
        ui.setRestoreError?.('该备份文件没有分类或书签数据');
        return;
      }
      if (typeof window.showImportPreview !== 'function') {
        ui.setRestoreError?.('导入预览组件未加载，请刷新页面重试');
        return;
      }

      ui.closeRestoreModal?.();
      ui.showRestoreStatus?.(`已加载备份（${payload.sites.length} 个书签，${payload.category.length} 个分类），可在预览中确认后导入`, 'success');
      window.showImportPreview(payload);
    } catch (e) {
      ui.setRestoreError?.('恢复失败: ' + (e.message || '网络错误'));
    } finally {
      restoreBtn.disabled = false;
      restoreBtn.textContent = originalText;
    }
  }

  // 同步到浏览器收藏夹：后台页面写不了浏览器收藏夹，只能请扩展代劳。
  // 经 content.js 桥接：页面 postMessage -> 扩展后台拉取 -> 结果 post 回来。
  // 没装扩展时桥接无人回应，10 秒无 ACK 即提示；拉取本身最多等 2 分钟。
  function requestPullToBrowser() {
    const refs = getBackupRefs();
    const btn = refs.syncToBrowserBtn;
    if (btn) btn.disabled = true;
    ui.showPullStatus?.('正在同步到浏览器收藏夹…', '');
    let done = false;
    const finish = (text, type) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(ackTimer);
      clearTimeout(resultTimer);
      if (btn) btn.disabled = false;
      ui.showPullStatus?.(text, type);
    };
    const ackTimer = setTimeout(() => {
      finish('没有收到扩展的回应：请确认已安装并启用 Iori Nav 书签同步扩展（1.1.0 以上版本），然后刷新本页再试。', 'error');
    }, 10000);
    const resultTimer = setTimeout(() => {
      finish('同步超时：扩展超过 2 分钟没有回结果，请去扩展弹窗里看状态，或重新点一次。', 'error');
    }, 120000);
    const onMessage = (event) => {
      if (event.source !== window || !event.data) return;
      if (event.data.type === 'IORI_PULL_ACK') {
        clearTimeout(ackTimer);
        ui.showPullStatus?.('扩展已收到，正在同步到浏览器收藏夹…', '');
        return;
      }
      if (event.data.type !== 'IORI_PULL_RESULT') return;
      const d = event.data.data || {};
      if (event.data.ok) {
        finish(`已同步到浏览器收藏夹：新建 ${d.created || 0} 个，更新 ${d.updated || 0} 个，移动 ${d.moved || 0} 个，共 ${d.total || 0} 个`, 'success');
      } else {
        finish('同步失败：' + (event.data.error || '未知错误'), 'error');
      }
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'IORI_PULL_REQUEST' }, '*');
  }

  function init() {
    const refs = getBackupRefs();
    if (!refs.backupBtn) return false;
    refs.backupBtn.addEventListener('click', runBackup);
    refs.syncToBrowserBtn?.addEventListener('click', requestPullToBrowser);
    refs.clearPasswordBtn?.addEventListener('click', requestClearWebdavPassword);
    refs.listBtn?.addEventListener('click', fetchBackupList);
    refs.restoreBtn?.addEventListener('click', restoreBackup);
    refs.closeRestoreBtn?.addEventListener('click', () => ui.closeRestoreModal?.());
    refs.cancelRestoreBtn?.addEventListener('click', () => ui.closeRestoreModal?.());
    refs.restoreModal?.addEventListener('click', event => {
      if (event.target === refs.restoreModal) ui.closeRestoreModal?.();
    });
    refs.closeDeleteConfirmBtn?.addEventListener('click', closeConfirmModal);
    refs.cancelDeleteBtn?.addEventListener('click', closeConfirmModal);
    refs.confirmDeleteBtn?.addEventListener('click', async () => {
      const action = pendingConfirmAction;
      closeConfirmModal();
      if (action) await action();
    });
    refs.deleteConfirmModal?.addEventListener('click', event => {
      if (event.target === refs.deleteConfirmModal) closeConfirmModal();
    });
    return true;
  }

  ns.backup = {
    init,
    getBackupRefs,
    syncPasswordField,
    clearWebdavPassword,
    requestClearWebdavPassword,
    runBackup,
    fetchBackupList,
    restoreBackup,
    requestPullToBrowser,
    deleteBackup,
    requestDeleteBackup,
  };
})();
