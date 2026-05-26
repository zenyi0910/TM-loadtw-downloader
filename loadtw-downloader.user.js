// ==UserScript==
// @name         load.tw / myppt.cc / lurl.cc 自動解鎖+下載
// @namespace    https://load.tw/
// @version      4.3
// @description  自動帶入日期密碼解鎖，一鍵下載圖片影片（支援 load.tw / myppt.cc / lurl.cc / Dcard 密碼抓取）
// @author       Yi
// @match        https://load.tw/*
// @match        https://myppt.cc/*
// @match        https://lurl.cc/*
// @match        https://www.dcard.tw/f/sex/*
// @match        https://www.dcard.tw/f/sex
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.lurl.cc
// @connect      *.myppt.cc
// @connect      lurl.cc
// @connect      myppt.cc
// @run-at       document-idle
// @updateURL    https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js
// @downloadURL  https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = '4.3';

    // ==================== Utils ====================
    const Utils = {
        extractMMDD: (dateText) => {
            const match = dateText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            return match ? match[2].padStart(2,'0') + match[3].padStart(2,'0') : null;
        },
        getQueryParam: (name) => new URLSearchParams(window.location.search).get(name),
        cookie: {
            get: (name) => {
                const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
                return match ? match[2] : null;
            },
            set: (name, value) => { document.cookie = `${name}=${value}; path=/`; }
        },
        getFilename: (url) => url.split('/').pop().split('?')[0] || 'download',
        downloadFile: async (url, filename) => {
            try {
                const r = await fetch(url); const blob = await r.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = blobUrl; a.download = filename;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            } catch (e) {
                const a = document.createElement('a'); a.href = url; a.download = filename;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
            }
        },
        qs: (sel, ctx) => (ctx || document).querySelector(sel),
        qsa: (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel))
    };

    GM_addStyle(`
        video { max-width:100%!important; max-height:80vh!important; width:auto!important; height:auto!important; display:block!important; margin:0 auto!important; object-fit:contain!important; }
        .video-js,.video-container,.player-wrap,[class*="player"] { position:relative!important; overflow:visible!important; margin-bottom:20px!important; max-width:100vw!important; }
        .entry-content,.post-content,article,main,.content { max-width:100vw!important; overflow-x:hidden!important; }
        .media-dl-btn { position:fixed; bottom:24px; right:24px; z-index:2147483647; background:#0a84ff; color:#fff; border:none; border-radius:12px; padding:12px 20px; font-size:16px; font-weight:600; cursor:pointer; box-shadow:0 4px 12px rgba(10,132,255,0.4); transition:all .2s; display:flex; align-items:center; gap:8px; }
        .media-dl-btn:hover { background:#0070e0; transform:translateY(-2px); }
        .media-dl-btn.downloading { background:#555; pointer-events:none; }
        .tm-pwd-panel { position:fixed; bottom:24px; right:24px; z-index:2147483647; background:#1a1a2e; border:1px solid #444; border-radius:12px; padding:16px; box-shadow:0 8px 24px rgba(0,0,0,0.5); display:flex; flex-direction:column; gap:10px; min-width:220px; }
        .tm-pwd-panel label { color:#eee; font-size:13px; font-weight:600; }
        .tm-pwd-panel input { padding:8px 12px; border-radius:8px; border:1px solid #555; background:#2a2a3e; color:#fff; font-size:14px; outline:none; }
        .tm-pwd-panel input:focus { border-color:#0a84ff; }
        .tm-pwd-panel button { padding:8px 16px; border-radius:8px; border:none; background:#0a84ff; color:#fff; font-size:14px; font-weight:600; cursor:pointer; }
    `);

    // ==================== 密碼 Helper ====================
    function makeDateHelper(siteRegex) {
        return {
            getCookieName: () => {
                const m = location.href.match(siteRegex);
                return m ? `psc_${m[1]}` : null;
            },
            isPasswordCorrect: () => {
                const el = Utils.qs('#back_top .container.NEWii_con section:nth-child(6) h2 span');
                if (!el) return false;
                const t = el.textContent;
                return t.includes('成功') || t.includes('錯誤');
            },
            tryPassword: () => {
                const helper = makeDateHelper(siteRegex);
                if (helper.isPasswordCorrect()) return false;
                const cookieName = helper.getCookieName();
                if (!cookieName) return false;
                if (Utils.cookie.get(cookieName)) return false;

                // 從 .login_span 取日期（第二個）
                const spans = Utils.qsa('.login_span');
                if (spans.length > 1) {
                    const date = Utils.extractMMDD(spans[1].textContent);
                    if (date) { Utils.cookie.set(cookieName, date); return true; }
                }
                // fallback: body 文字
                const bodyText = document.body.innerText;
                const m = bodyText.match(/上傳[日期時間：:\s]*(\d{4})-(\d{1,2})-(\d{1,2})/);
                if (m) {
                    const date = m[2].padStart(2,'0') + m[3].padStart(2,'0');
                    Utils.cookie.set(cookieName, date);
                    return true;
                }
                return false;
            }
        };
    }

    // ==================== 影片/圖片下載 ====================
    function getVideoUrl() {
        const v = Utils.qs('video');
        if (!v) return null;
        if (v.src) return v.src;
        const s = Utils.qs('source', v);
        return s ? s.src : null;
    }

    function getImageUrls() {
        const urls = [];
        Utils.qsa('link[rel="preload"][as="image"]').forEach(el => {
            const href = el.getAttribute('href');
            if (href && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(href)) urls.push(href);
        });
        if (!urls.length) {
            Utils.qsa('img').forEach(el => {
                const src = el.src || '';
                if (src.includes('mplimit') || src.includes('store')) urls.push(src);
            });
        }
        return urls;
    }

    function replaceVideoPlayer() {
        const videoUrl = getVideoUrl();
        if (!videoUrl) return;
        const container = Utils.qs('.video-js');
        if (container) {
            container.className = '';
            container.removeAttribute('oncontextmenu');
            container.removeAttribute('controlslist');
            container.style.cssText = 'width:100%;max-width:100%;position:relative';
            Utils.qsa('.vjs-control-bar,.vjs-poster,.vjs-loading-spinner,.vjs-big-play-button,.vjs-text-track-display,.vjs-modal-dialog', container).forEach(el => el.remove());
            const v = Utils.qs('video', container);
            if (v) {
                v.src = videoUrl;
                v.controls = true;
                v.preload = 'metadata';
                v.className = '';
                v.removeAttribute('oncontextmenu');
                v.removeAttribute('controlslist');
                v.removeAttribute('data-setup');
                v.style.cssText = 'width:100%;max-width:100%;height:auto;display:block';
                v.load();
            }
        }
    }

    function injectDownloadButton() {
        if (Utils.qs('.media-dl-btn')) return;
        const videoUrl = getVideoUrl();
        if (videoUrl) {
            const btn = document.createElement('button');
            btn.textContent = '⬇ 下載影片';
            btn.className = 'media-dl-btn';
            btn.onclick = async () => {
                btn.classList.add('downloading'); btn.textContent = '⏳ 下載中...';
                await Utils.downloadFile(videoUrl, 'video.mp4');
                btn.classList.remove('downloading'); btn.textContent = '⬇ 下載影片';
            };
            document.body.appendChild(btn);
            return;
        }
        const imgs = getImageUrls();
        if (imgs.length) {
            const label = imgs.length > 1 ? `⬇ 下載全部圖片 (${imgs.length})` : '⬇ 下載圖片';
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.className = 'media-dl-btn';
            btn.onclick = async () => {
                btn.classList.add('downloading'); btn.textContent = '⏳ 下載中...';
                for (let i = 0; i < imgs.length; i++) await Utils.downloadFile(imgs[i], `image_${i+1}.jpg`);
                btn.classList.remove('downloading'); btn.textContent = label;
            };
            document.body.appendChild(btn);
        }
    }

    // ==================== Dcard 密碼接收 ====================
    function getDcardPasswords() {
        const params = new URLSearchParams(location.search);
        const tmPw = params.get('tm_pw');
        if (tmPw) {
            const pws = tmPw.split(',').filter(Boolean);
            GM_setValue('tm_pw_' + location.pathname, JSON.stringify(pws));
            const clean = new URL(location.href);
            clean.searchParams.delete('tm_pw'); clean.searchParams.delete('ref');
            history.replaceState(null, '', clean.toString());
            return pws;
        }
        const stored = GM_getValue('tm_pw_' + location.pathname, null);
        return stored ? JSON.parse(stored) : [];
    }

    // ==================== 手動密碼面板 ====================
    function showPasswordPanel() {
        if (Utils.qs('.tm-pwd-panel')) return;
        const panel = document.createElement('div');
        panel.className = 'tm-pwd-panel';
        panel.innerHTML = `
            <label>🔑 輸入密碼解鎖</label>
            <input type="text" class="tm-pwd-input" placeholder="密碼（如 0523）"/>
            <button class="tm-pwd-submit">解鎖</button>
        `;
        document.body.appendChild(panel);
        const input = panel.querySelector('.tm-pwd-input');
        const submit = panel.querySelector('.tm-pwd-submit');
        submit.onclick = () => {
            const pwd = input.value.trim();
            if (!pwd) return;
            if (location.hostname.includes('load.tw')) {
                const inp = document.querySelector('input[name="password"],input[type="password"]');
                if (inp) { inp.value = pwd; inp.closest('form').submit(); }
            } else {
                const m = location.href.match(/(?:myppt|lurl)\.cc\/(\w+)/);
                if (m) { Utils.cookie.set(`psc_${m[1]}`, pwd); location.reload(); }
            }
        };
        input.onkeydown = (e) => { if (e.key === 'Enter') submit.click(); };
    }

    // ==================== Dcard Handler ====================
    function dcardMain() {
        function extractPasswords() {
            const pws = new Set();
            const text = document.body.innerText;
            const patterns = [/(?:pass(?:word)?|pw|密碼|解鎖|解壓)[：:=\s]+([^\s,，、\n]{1,20})/gi];
            patterns.forEach(pat => {
                let m;
                while ((m = pat.exec(text)) !== null) {
                    const v = m[1].trim().replace(/[」」】）)]/g, '');
                    if (v && v.length >= 3 && v.length <= 20) pws.add(v);
                }
            });
            // 4 位數字
            const dateMatch = text.match(/密碼[：:=\s]*(\d{4})/);
            if (dateMatch) pws.add(dateMatch[1]);
            // 頁面日期 fallback
            const pageDate = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (pageDate) pws.add(pageDate[2].padStart(2,'0') + pageDate[3].padStart(2,'0'));
            return [...pws];
        }

        function interceptLinks() {
            const pws = extractPasswords();
            if (!pws.length) return;
            const pwParam = pws.join(',');
            const ref = encodeURIComponent(location.href);
            Utils.qsa('a[href]').forEach(a => {
                const href = a.href;
                if (/(?:lurl\.cc|myppt\.cc)\/\w+/.test(href) && !href.includes('tm_pw')) {
                    const sep = href.includes('?') ? '&' : '?';
                    a.href = `${href}${sep}tm_pw=${pwParam}&ref=${ref}`;
                    a.style.cssText += ';border-bottom:2px solid #0a84ff;';
                }
            });
        }

        // 初始執行 + MutationObserver 監聽動態載入
        interceptLinks();
        const obs = new MutationObserver(() => interceptLinks());
        obs.observe(document.body, { childList: true, subtree: true });
    }

    // ==================== 年齡確認 ====================
    function autoConfirmAge() {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
            if (b.textContent.includes('18') || b.textContent.includes('進入')) {
                b.click();
                return;
            }
        }
    }

    // ==================== 版本更新檢查 ====================
    function checkUpdate() {
        const lastCheck = GM_getValue('tm_update_check', 0);
        if (Date.now() - lastCheck < 24 * 60 * 60 * 1000) return;
        GM_setValue('tm_update_check', Date.now());
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://raw.githubusercontent.com/zenyi0910/TM-loadtw-downloader/main/loadtw-downloader.user.js',
            onload: (r) => {
                const m = r.responseText.match(/@version\s+([\d.]+)/);
                if (m && m[1] !== SCRIPT_VERSION) {
                    const badge = document.createElement('div');
                    badge.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#1a1a2e;border:1px solid #444;border-radius:12px;padding:12px 16px;box-shadow:0 4px 12px rgba(0,0,0,0.4);color:#fff;font-size:13px;';
                    badge.innerHTML = `<div style="font-weight:600;margin-bottom:6px;">🔄 有新版本 v${m[1]}</div><a href="https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js" target="_blank" style="color:#0a84ff;">點此更新</a> <span style="color:#666;margin-left:8px;cursor:pointer;" id="tm-dismiss">✕</span>`;
                    document.body.appendChild(badge);
                    badge.querySelector('#tm-dismiss').onclick = () => badge.remove();
                }
            }
        });
    }

    // ==================== load.tw Handler ====================
    function loadTwMain() {
        // load.tw 用 POST 表單提交密碼
        const pwInput = document.querySelector('input[name="password"],input[type="password"]');
        if (pwInput) {
            // 從 URL 路徑取日期 /u/2026/05/25/
            const pathMatch = location.pathname.match(/\/u\/(\d{4})\/(\d{2})\/(\d{2})\//);
            if (pathMatch) {
                const pwd = pathMatch[2] + pathMatch[3];
                pwInput.value = pwd;
                pwInput.closest('form').submit();
                return;
            }
        }
        // 已解鎖
        if (Utils.qs('video') || getImageUrls().length) {
            replaceVideoPlayer();
            injectDownloadButton();
        }
    }

    // ==================== Router ====================
    const host = location.hostname;

    if (host.includes('dcard.tw')) {
        checkUpdate();
        dcardMain();
    } else if (host.includes('myppt.cc') || host.includes('lurl.cc')) {
        checkUpdate();
        autoConfirmAge();
        const dcardPws = getDcardPasswords();
        const regex = host.includes('myppt') ? /myppt\.cc\/(\w+)/ : /lurl\.cc\/(\w+)/;
        const helper = makeDateHelper(regex);
        // 嘗試日期密碼
        if (helper.tryPassword()) { location.reload(); return; }
        // 日期失敗，嘗試 Dcard 密碼
        if (dcardPws.length > 0) {
            const cookieName = helper.getCookieName();
            if (cookieName && !Utils.cookie.get(cookieName)) {
                Utils.cookie.set(cookieName, dcardPws[0]);
                location.reload();
                return;
            }
        }
        // 已解鎖 → 注入下載按鈕
        if (Utils.qs('video') || getImageUrls().length) {
            replaceVideoPlayer();
            injectDownloadButton();
        } else {
            // 還在密碼頁 → 顯示手動面板
            showPasswordPanel();
        }
    } else if (host.includes('load.tw')) {
        checkUpdate();
        autoConfirmAge();
        loadTwMain();
    }

})();
