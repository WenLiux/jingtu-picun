// ==UserScript==
// @name         京图批存
// @namespace    https://github.com/WenLiu6677/jingtu-picun
// @version      1.4.2
// @description  一键下载京东商品详情页的全部详情图，批量下载只需选择一次保存文件夹
// @author       Wenl
// @homepageURL  https://github.com/WenLiu6677/jingtu-picun
// @supportURL   https://github.com/WenLiu6677/jingtu-picun/issues
// @match        https://item.jd.com/*.html
// @match        https://item.jd.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        unsafeWindow
// @connect      in.m.jd.com
// @connect      *.360buyimg.com
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ====================
  // 提取 SKU ID
  // ====================
  function getSkuId() {
    const match = location.pathname.match(/(\d+)\.html/);
    return match ? match[1] : null;
  }

  const SKU_ID = getSkuId();
  if (!SKU_ID) return;

  const DOWNLOAD_CONCURRENCY = 3;
  const DOWNLOAD_RETRIES = 2;
  const DOWNLOAD_TIMEOUT = 45000;

  // ====================
  // DOM 工具
  // ====================
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  function createEl(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'style' && typeof v === 'object') {
        Object.entries(v).forEach(([pk, pv]) => { el.style[pk] = pv; });
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'html') {
        el.innerHTML = v;
      } else {
        el.setAttribute(k, v);
      }
    });
    children.forEach(c => {
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else if (c) el.appendChild(c);
    });
    return el;
  }

  // ====================
  // 样式注入
  // ====================
  const CSS = `
.jd-dl-btn {
  position: fixed;
  bottom: 80px;
  right: 20px;
  z-index: 99999;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e4393c, #c1272d);
  color: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(228, 57, 60, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
  outline: none;
}
.jd-dl-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 24px rgba(228, 57, 60, 0.6);
}
.jd-dl-btn:active { transform: scale(0.95); }
.jd-dl-btn svg { width: 24px; height: 24px; fill: none; stroke: #fff; stroke-width: 2; }
.jd-dl-btn.loading { pointer-events: none; animation: jd-dl-spin 0.8s linear infinite; }
@keyframes jd-dl-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.jd-dl-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: jd-dl-fadein 0.2s ease;
}
@keyframes jd-dl-fadein {
  from { opacity: 0; }
  to { opacity: 1; }
}

.jd-dl-panel {
  background: #1e1e2e;
  border-radius: 16px;
  width: 90vw;
  max-width: 820px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  overflow: hidden;
  animation: jd-dl-slideup 0.25s ease;
}
@keyframes jd-dl-slideup {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.jd-dl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.jd-dl-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #f0f0f0;
  letter-spacing: 0.3px;
}
.jd-dl-header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.jd-dl-btn-zip {
  padding: 8px 18px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: linear-gradient(135deg, #e4393c, #c1272d);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 6px;
}
.jd-dl-btn-zip:hover { opacity: 0.9; transform: translateY(-1px); }
.jd-dl-btn-zip:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.jd-dl-btn-zip svg { width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 2; }

.jd-dl-btn-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(255,255,255,0.08);
  color: #999;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  line-height: 1;
}
.jd-dl-btn-close:hover { background: rgba(255,255,255,0.15); color: #fff; }

.jd-dl-body {
  overflow-y: auto;
  padding: 16px 24px;
  flex: 1;
}
.jd-dl-body::-webkit-scrollbar { width: 6px; }
.jd-dl-body::-webkit-scrollbar-track { background: transparent; }
.jd-dl-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }

.jd-dl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.jd-dl-card {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  cursor: pointer;
  transition: all 0.2s;
}
.jd-dl-card:hover {
  border-color: rgba(228, 57, 60, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.3);
}
.jd-dl-card-img {
  width: 100%;
  aspect-ratio: 790 / 600;
  object-fit: cover;
  display: block;
  background: rgba(255,255,255,0.03);
}
.jd-dl-card-label {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(0,0,0,0.7);
  color: #ccc;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
}
.jd-dl-card-dl {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(228,57,60,0.85);
  border: none;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}
.jd-dl-card:hover .jd-dl-card-dl { opacity: 1; }

.jd-dl-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #aaa;
  gap: 16px;
}
.jd-dl-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #e4393c;
  border-radius: 50%;
  animation: jd-dl-spin 0.7s linear infinite;
}
.jd-dl-error {
  text-align: center;
  padding: 40px 20px;
  color: #f87171;
}
.jd-dl-error button {
  margin-top: 12px;
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid #f87171;
  background: transparent;
  color: #f87171;
  cursor: pointer;
  font-size: 13px;
}
.jd-dl-footer {
  padding: 10px 24px 14px;
  color: #666;
  font-size: 12px;
  text-align: center;
  border-top: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.jd-dl-toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999999;
  background: #2d2d3f;
  color: #e0e0e0;
  padding: 10px 24px;
  border-radius: 10px;
  font-size: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  animation: jd-dl-toastin 0.3s ease, jd-dl-toastout 0.3s ease 1.7s forwards;
}
.jd-dl-toast.success { border-left: 3px solid #34d399; }
.jd-dl-toast.error { border-left: 3px solid #f87171; }
@keyframes jd-dl-toastin {
  from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes jd-dl-toastout {
  from { opacity: 1; }
  to { opacity: 0; }
}

`;

  const styleEl = createEl('style', { html: CSS });
  document.head.appendChild(styleEl);

  // ====================
  // Toast 提示
  // ====================
  function toast(msg, type = 'success') {
    const el = createEl('div', { class: `jd-dl-toast ${type}` }, [msg]);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  // ====================
  // 核心：获取详情图 URL 列表
  // ====================
  function fetchImageUrls() {
    const graphextUrl = `https://in.m.jd.com/product/graphext/${SKU_ID}.html`;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: graphextUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Referer': 'https://item.jd.com/',
        },
        onload(resp) {
          if (resp.status !== 200) {
            reject(new Error(`HTTP ${resp.status}`));
            return;
          }
          const html = resp.responseText
            .replace(/\\\//g, '/')
            .replace(/&amp;/gi, '&');
          // 同时兼容完整地址、协议相对地址、查询参数及非 DPG 图片。
          const matches = html.match(/(?:https?:)?\/\/[^"'\s<>]*\.360buyimg\.com\/(?:img|imgzone)\/jfs\/[^"'\s<>?]*\.(?:jpe?g|png|webp)(?:\.dpg)?(?:\?[^"'\s<>]*)?/gi);
          if (!matches || matches.length === 0) {
            reject(new Error('未找到详情图，该商品可能没有图片描述'));
            return;
          }
          // 去重并保留页面顺序。SKU 前缀可防止不同商品的图片重名。
          const seen = new Set();
          const urls = matches
            .map(u => u.startsWith('//') ? `https:${u}` : u)
            .filter(u => {
              const key = u.replace(/\?.*$/, '');
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .map((u, i) => {
              const extensionMatch = u.replace(/\?.*$/, '').match(/\.(jpe?g|png|webp)(?:\.dpg)?$/i);
              const extension = extensionMatch && extensionMatch[1].toLowerCase() === 'jpeg'
                ? 'jpg'
                : (extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg');
              return {
                url: u,
                name: `${SKU_ID}_detail_${String(i + 1).padStart(2, '0')}.${extension}`,
              };
            });
          resolve(urls);
        },
        onerror(err) {
          reject(new Error('网络请求失败，请检查网络连接'));
        },
        ontimeout() {
          reject(new Error('请求超时'));
        },
        timeout: 15000,
      });
    });
  }

  // ====================
  // 预览面板
  // ====================
  function showPanel(imageUrls) {
    // 如果已存在，先移除
    const existing = $('.jd-dl-overlay');
    if (existing) existing.remove();

    const overlay = createEl('div', { class: 'jd-dl-overlay' });

    const panel = createEl('div', { class: 'jd-dl-panel' });

    // Header
    const header = createEl('div', { class: 'jd-dl-header' }, [
      createEl('h2', {}, [`京图批存 · 详情图 ${imageUrls.length} 张 · 商品 ID: ${SKU_ID}`]),
      createEl('div', { class: 'jd-dl-header-actions' }, [
        createEl('button', {
          class: 'jd-dl-btn-zip',
          id: 'jd-dl-zip-btn',
          html: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 选择文件夹并下载`,
        }),
        createEl('button', { class: 'jd-dl-btn-close', html: '×' }),
      ]),
    ]);

    // Body — 图片网格
    const body = createEl('div', { class: 'jd-dl-body' });
    const grid = createEl('div', { class: 'jd-dl-grid' });

    imageUrls.forEach((img, i) => {
      const card = createEl('div', { class: 'jd-dl-card' }, [
        createEl('img', {
          class: 'jd-dl-card-img',
          src: img.url,
          loading: 'lazy',
          alt: img.name,
        }),
        createEl('span', { class: 'jd-dl-card-label' }, [img.name]),
        createEl('button', {
          class: 'jd-dl-card-dl',
          title: '下载此图',
          html: '↓',
          onClick(e) {
            e.stopPropagation();
            downloadSingle(img);
          },
        }),
      ]);
      // 点击卡片预览大图
      card.addEventListener('click', () => {
        window.open(img.url, '_blank');
      });
      grid.appendChild(card);
    });

    body.appendChild(grid);
    panel.appendChild(header);
    panel.appendChild(body);

    const footer = createEl('div', { class: 'jd-dl-footer' }, [
      '点击图片查看原图 · 批量下载只需选择一次文件夹 · By Wenl',
    ]);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // 关闭
    const closeBtn = $('.jd-dl-btn-close', panel);
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    });

    // 批量下载按钮
    const zipBtn = $('#jd-dl-zip-btn', panel);
    zipBtn.addEventListener('click', () => downloadAll(imageUrls, zipBtn));
  }

  // ====================
  // 将 GM_download 包装为可超时、可重试的 Promise。
  // ====================
  function runDownload(imgInfo) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let task;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => {
        if (task && typeof task.abort === 'function') task.abort();
        finish(new Error('下载超时'));
      }, DOWNLOAD_TIMEOUT);

      try {
        task = GM_download({
          url: imgInfo.url,
          name: imgInfo.name,
          headers: { Referer: 'https://item.jd.com/' },
          saveAs: false,
          onload: () => finish(),
          onerror: (err) => finish(new Error(err && (err.error || err.details) || '下载失败')),
          ontimeout: () => finish(new Error('下载超时')),
        });
      } catch (err) {
        finish(err);
      }
    });
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function downloadWithRetry(imgInfo, retries = DOWNLOAD_RETRIES) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await runDownload(imgInfo);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < retries) await wait(600 * (attempt + 1));
      }
    }
    throw lastError;
  }

  // ====================
  // 单张下载
  // ====================
  async function downloadSingle(imgInfo) {
    try {
      await downloadWithRetry(imgInfo);
      toast(`${imgInfo.name} 下载完成`, 'success');
    } catch (err) {
      toast(`下载失败: ${imgInfo.name}`, 'error');
      console.error('[JD DL] GM_download error:', err);
    }
  }

  // ====================
  // 批量保存 — 选择一次目录后，通过 File System Access API 直接写入文件。
  // ====================
  async function pickDownloadDirectory() {
    const options = {
      id: 'jd-detail-images',
      mode: 'readwrite',
      startIn: 'downloads',
    };

    if (typeof window.showDirectoryPicker === 'function') {
      return window.showDirectoryPicker(options);
    }
    if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.showDirectoryPicker === 'function') {
      return unsafeWindow.showDirectoryPicker(options);
    }
    throw new Error('当前浏览器不支持文件夹批量保存，请使用最新版 Chrome 或 Edge');
  }

  function fetchImageBlob(imgInfo) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: imgInfo.url,
        headers: { Referer: 'https://item.jd.com/' },
        responseType: 'blob',
        timeout: DOWNLOAD_TIMEOUT,
        onload(resp) {
          if (resp.status >= 200 && resp.status < 300 && resp.response) {
            resolve(resp.response);
          } else {
            reject(new Error(`图片请求失败: HTTP ${resp.status}`));
          }
        },
        onerror: () => reject(new Error('图片请求失败')),
        ontimeout: () => reject(new Error('图片请求超时')),
      });
    });
  }

  async function saveImageToDirectory(imgInfo, directoryHandle) {
    const blob = await fetchImageBlob(imgInfo);
    const fileHandle = await directoryHandle.getFileHandle(imgInfo.name, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
  }

  async function saveToDirectoryWithRetry(imgInfo, directoryHandle, retries = DOWNLOAD_RETRIES) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await saveImageToDirectory(imgInfo, directoryHandle);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < retries) await wait(600 * (attempt + 1));
      }
    }
    throw lastError;
  }

  async function downloadAll(imageUrls, btnEl) {
    const total = imageUrls.length;
    if (total === 0) return;

    btnEl.disabled = true;
    const originalHtml = btnEl.innerHTML;
    btnEl.textContent = '请选择保存文件夹...';

    let directoryHandle;
    try {
      directoryHandle = await pickDownloadDirectory();
    } catch (err) {
      btnEl.disabled = false;
      btnEl.innerHTML = originalHtml;
      if (err && err.name === 'AbortError') {
        toast('已取消批量下载', 'error');
      } else {
        toast(err.message || '无法选择保存文件夹', 'error');
        console.error('[JD DL] 选择文件夹失败:', err);
      }
      return;
    }

    toast(`正在保存 ${total} 张图片到“${directoryHandle.name}”...`, 'success');
    let nextIndex = 0;
    let completed = 0;
    let succeeded = 0;
    const failures = [];

    const worker = async () => {
      while (nextIndex < total) {
        const img = imageUrls[nextIndex++];
        try {
          await saveToDirectoryWithRetry(img, directoryHandle);
          succeeded++;
        } catch (err) {
          failures.push({ img, error: err });
          console.error(`[JD DL] ${img.name} 下载失败:`, err);
        } finally {
          completed++;
          btnEl.textContent = `下载中 ${completed}/${total}`;
        }
      }
    };

    try {
      const workerCount = Math.min(DOWNLOAD_CONCURRENCY, total);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      if (failures.length === 0) {
        toast(`全部 ${succeeded} 张图片已保存到“${directoryHandle.name}”`, 'success');
      } else {
        toast(`下载完成：成功 ${succeeded} 张，失败 ${failures.length} 张`, 'error');
      }
    } finally {
      btnEl.disabled = false;
      btnEl.innerHTML = originalHtml;
    }
  }

  // ====================
  // 加载状态弹窗
  // ====================
  function showLoading() {
    const existing = $('.jd-dl-overlay');
    if (existing) existing.remove();

    const overlay = createEl('div', { class: 'jd-dl-overlay' });
    const panel = createEl('div', { class: 'jd-dl-panel', style: { maxWidth: '400px' } }, [
      createEl('div', { class: 'jd-dl-loading' }, [
        createEl('div', { class: 'jd-dl-spinner' }),
        createEl('span', {}, ['正在获取详情图列表...']),
        createEl('span', { style: { fontSize: '12px', color: '#666' } }, [`商品 ID: ${SKU_ID}`]),
      ]),
    ]);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    return overlay;
  }

  function showError(message, retryFn) {
    const existing = $('.jd-dl-overlay');
    if (existing) existing.remove();

    const overlay = createEl('div', { class: 'jd-dl-overlay' });
    const panel = createEl('div', { class: 'jd-dl-panel', style: { maxWidth: '400px' } }, [
      createEl('div', { class: 'jd-dl-error' }, [
        createEl('p', {}, [`获取失败: ${message}`]),
        createEl('button', {
          onClick() {
            overlay.remove();
            if (retryFn) retryFn();
          },
        }, ['重试']),
      ]),
      createEl('div', { style: { textAlign: 'center', padding: '0 20px 20px' } }, [
        createEl('button', {
          style: { padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: '13px' },
          onClick() { overlay.remove(); },
        }, ['关闭']),
      ]),
    ]);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ====================
  // 主流程：获取并展示
  // ====================
  async function fetchAndShow() {
    const loadingOverlay = showLoading();
    try {
      const imageUrls = await fetchImageUrls();
      loadingOverlay.remove();
      if (imageUrls.length === 0) {
        showError('未找到任何详情图片', fetchAndShow);
      } else {
        showPanel(imageUrls);
      }
    } catch (err) {
      loadingOverlay.remove();
      showError(err.message, fetchAndShow);
    }
  }

  // ====================
  // 注入浮动按钮
  // ====================
  function injectButton() {
    // 防重复注入
    if ($('.jd-dl-btn')) return;

    const btn = createEl('button', {
      class: 'jd-dl-btn',
      title: '下载商品详情图',
      html: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="15" y="2" width="7" height="7" rx="1"/></svg>`,
      onClick: fetchAndShow,
    });

    document.body.appendChild(btn);
  }

  // ====================
  // 启动
  // ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }

  console.log(`[京图批存 · Wenl] 已就绪 | 商品 ID: ${SKU_ID} | 点击右下角红色按钮下载详情图`);
})();
