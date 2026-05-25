// ==UserScript==
// @name         load.tw / myppt.cc / lurl.cc 自動解鎖+下載
// @namespace    https://load.tw/
// @version      4.0
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
// @run-at       document-idle
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @updateURL    https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js
// @downloadURL  https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js
// ==/UserScript==

(function($) {
    'use strict';

    // ==================== 工具函數 ====================
    const Utils = {
        extractMMDD: (text) => {
            const match = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
            if (match) return match[2].padStart(2, '0') + match[3].padStart(2, '0');
            return null;
        },
        cookie: {
            get: (name) => {
                const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
                return match ? match[2] : null;
            },
            set: (name, value, days = 7) => {
                const expires = new Date(Date.now() + days * 864e5).toUTCString();
                document.cookie = `${name}=${value}; expires=${expires}; path=/`;
            },
            del: (name) => {
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
            }
        },
        getFilename: (url) => url.split('/').pop().split('?')[0] || 'download'
    };

    // ==================== 樣式 ====================
    GM_addStyle(`
        /* 修復 lurl.cc 影片播放器跑版（含豎向影片） */
        video {
            max-width: 100% !important;
            max-height: 80vh !important;
            width: auto !important;
            height: auto !important;
            display: block !important;
            margin: 0 auto !important;
            object-fit: contain !important;
        }
        /* 防止下方文字重疊到播放器 */
        .video-container, .player-wrap, [class*="player"] {
            position: relative !important;
            overflow: visible !important;
            margin-bottom: 20px !important;
            max-width: 100vw !important;
            display: flex !important;
            justify-content: center !important;
        }
        /* 豎向影片容器限制 */
        .entry-content, .post-content, article, main, .content {
            max-width: 100vw !important;
            overflow-x: hidden !important;
        }
        .media-dl-btn {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 2147483647;
            background: #0a84ff;
            color: #fff;
            border: none;
            border-radius: 12px;
            padding: 12px 20px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(10,132,255,0.4);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .media-dl-btn:hover {
            background: #0070e0;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(10,132,255,0.5);
        }
        .media-dl-btn:active { transform: translateY(0); }
        .media-dl-btn.downloading { background: #555; pointer-events: none; }
        /* 手動密碼輸入面板 */
        .tm-pwd-panel {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 2147483647;
            background: #1a1a2e;
            border: 1px solid #444;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 220px;
        }
        .tm-pwd-panel label {
            color: #eee;
            font-size: 13px;
            font-weight: 600;
        }
        .tm-pwd-panel input {
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid #555;
            background: #2a2a3e;
            color: #fff;
            font-size: 14px;
            outline: none;
        }
        .tm-pwd-panel input:focus { border-color: #0a84ff; }
        .tm-pwd-panel button {
            padding: 8px 16px;
            border-radius: 8px;
            border: none;
            background: #0a84ff;
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
        }
        .tm-pwd-panel button:hover { background: #0070e0; }
        .tm-pwd-panel .tm-pwd-status {
            color: #ff6b6b;
            font-size: 12px;
        }
    `);

    // ==================== 核心函數 ====================
    function findMediaUrl() {
        const source = document.querySelector('video source');
        if (source && source.src) return source.src;
        const video = document.querySelector('video');
        if (video && (video.src || video.currentSrc)) return video.src || video.currentSrc;
        // preload images (myppt/lurl)
        const preloads = document.querySelectorAll('link[rel="preload"][as="image"]');
        for (const link of preloads) {
            const href = link.getAttribute('href');
            if (href && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(href)) return href;
        }
        const img = document.querySelector('main img[src*="store"], .content img[src*="store"]');
        if (img) return img.src;
        return null;
    }

    function fixVideoPlayback() {
        // 停止自動播放 + 修正跑版
        document.querySelectorAll('video').forEach(v => {
            v.pause();
            v.removeAttribute('autoplay');
            v.setAttribute('controls', 'true');
            v.style.maxWidth = '100%';
            v.style.maxHeight = '80vh';
            v.style.width = 'auto';
            v.style.height = 'auto';
        });
    }

    function getSiteHeaders() {
        const host = location.hostname;
        if (host.includes('load.tw')) {
            return { 'Referer': 'https://load.tw/', 'sec-fetch-dest': 'video', 'sec-fetch-mode': 'no-cors', 'sec-fetch-site': 'same-site' };
        }
        if (host.includes('myppt.cc') || host.includes('lurl.cc')) {
            return { 'Referer': `https://${host}/` };
        }
        return {};
    }

    function anchorDownload(url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = Utils.getFilename(url);
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function createDownloadButton() {
        if (document.querySelector('.media-dl-btn')) return;
        const url = findMediaUrl();
        if (!url) return;

        const btn = document.createElement('button');
        btn.className = 'media-dl-btn';
        btn.innerHTML = '⬇ 下載';
        btn.title = Utils.getFilename(url);

        btn.addEventListener('click', function() {
            const mediaUrl = findMediaUrl();
            if (!mediaUrl) { alert('找不到媒體 URL'); return; }
            btn.classList.add('downloading');
            btn.innerHTML = '⏳ 下載中...';

            if (typeof GM_download !== 'undefined') {
                GM_download({
                    url: mediaUrl,
                    name: Utils.getFilename(mediaUrl),
                    headers: getSiteHeaders(),
                    onload: () => {
                        btn.innerHTML = '✅ 完成';
                        setTimeout(() => { btn.classList.remove('downloading'); btn.innerHTML = '⬇ 下載'; }, 3000);
                    },
                    onerror: () => { anchorDownload(mediaUrl); btn.classList.remove('downloading'); btn.innerHTML = '⬇ 下載'; }
                });
            } else {
                anchorDownload(mediaUrl);
                btn.classList.remove('downloading');
                btn.innerHTML = '⬇ 下載';
            }
        });
        document.body.appendChild(btn);
    }

    // ==================== 密碼處理（不刷新頁面）====================
    function getCookieName() {
        const host = location.hostname;
        if (host.includes('myppt.cc')) {
            const m = location.href.match(/myppt\.cc\/(\w+)/);
            return m ? `psc_${m[1]}` : null;
        }
        if (host.includes('lurl.cc')) {
            const m = location.href.match(/lurl\.cc\/(\w+)/);
            return m ? `psc_${m[1]}` : null;
        }
        return null;
    }

    function tryDatePassword() {
        const host = location.hostname;

        // 先嘗試 Dcard 傳來的密碼
        const dcardPws = getDcardPasswords();
        if (dcardPws.length > 0 && !GM_getValue('tm_tried_' + location.pathname, false)) {
            GM_setValue('tm_tried_' + location.pathname, true);
            const pw = dcardPws[0]; // 先試第一組

            if (host.includes('load.tw')) {
                const pwdInput = document.querySelector('input[name="password"], input[type="password"]');
                if (pwdInput) {
                    pwdInput.value = pw;
                    const form = pwdInput.closest('form');
                    if (form) { HTMLFormElement.prototype.submit.call(form); return true; }
                }
            } else {
                const pwdInput = document.querySelector('input[placeholder*="密碼"], input[name*="pas"], input[name*="word"]');
                const form = pwdInput ? pwdInput.closest('form') : document.querySelector('form');
                if (pwdInput && form) {
                    pwdInput.value = pw;
                    try { HTMLFormElement.prototype.submit.call(form); } catch(e) { form.submit(); }
                    return true;
                }
            }
        }

        // load.tw: 從 URL 路徑取日期
        if (host.includes('load.tw')) {
            const match = location.pathname.match(/\/u\/\d{4}\/(\d{2})\/(\d{2})\//);
            if (!match) return false;
            const pwd = match[1] + match[2];
            const pwdInput = document.querySelector('input[name="password"], input[type="password"]');
            if (!pwdInput) return false;
            pwdInput.value = pwd;
            const form = pwdInput.closest('form');
            if (form) { form.submit(); return true; }
            return false;
        }

        // myppt / lurl: 表單提交密碼
        const cookieName = getCookieName();
        if (!cookieName) return false;

        // 多來源提取日期密碼
        let date = null;

        // 來源 1: 頁面上的上傳日期文字（.login_span、time、日期格式文字）
        const $dateSpan = $('.login_span').eq(1);
        if ($dateSpan.length) date = Utils.extractMMDD($dateSpan.text());

        // 來源 2: <time> 標籤
        if (!date) {
            const timeEl = document.querySelector('time[datetime]');
            if (timeEl) date = Utils.extractMMDD(timeEl.getAttribute('datetime'));
        }

        // 來源 3: 頁面 body 文字中的日期（上傳日期/發佈日期）
        if (!date) {
            const bodyText = document.body.innerText;
            const datePatterns = [
                /上傳[日期時間：:\s]*([\d]{4})[/-](\d{1,2})[/-](\d{1,2})/,
                /發[佈布][日期時間：:\s]*([\d]{4})[/-](\d{1,2})[/-](\d{1,2})/,
                /(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s*上傳/,
                /(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+\d{1,2}:\d{2}/,
            ];
            for (const pat of datePatterns) {
                const m = bodyText.match(pat);
                if (m) { date = m[2].padStart(2, '0') + m[3].padStart(2, '0'); break; }
            }
        }

        // 來源 4: URL 路徑中的日期（如 /20260520/xxx.mp4 頁面路徑）
        if (!date) {
            const urlMatch = location.pathname.match(/\/(\d{4})(\d{2})(\d{2})\//);
            if (urlMatch) date = urlMatch[2] + urlMatch[3];
        }

        // 來源 5: 頁面中 video/img URL 路徑的日期
        if (!date) {
            const mediaSrc = document.querySelector('video source, video, img[src*="store"]');
            if (mediaSrc) {
                const src = mediaSrc.src || mediaSrc.getAttribute('src') || '';
                const srcMatch = src.match(/\/(\d{4})(\d{2})(\d{2})\//);
                if (srcMatch) date = srcMatch[2] + srcMatch[3];
            }
        }

        if (!date) return false;

        // 優先用表單提交（myppt/lurl 實際是 POST 表單）
        const allInputs = document.querySelectorAll('input');
        let pwdInput = null;
        for (const inp of allInputs) {
            if (inp.offsetWidth > 0 && inp.offsetHeight > 0 && 
                (inp.placeholder.includes('密碼') || inp.name.includes('pasahaicsword') || inp.name.includes('password'))) {
                pwdInput = inp;
                break;
            }
        }
        if (!pwdInput) pwdInput = document.querySelector('input[placeholder*="密碼"]');
        const form = pwdInput ? pwdInput.closest('form') : document.querySelector('form');
        if (pwdInput && form) {
            pwdInput.value = date;
            // 避免 name="submit" 按鈕覆蓋 form.submit()
            try {
                HTMLFormElement.prototype.submit.call(form);
            } catch (e) {
                form.submit();
            }
            return true;
        }

        // fallback: cookie 機制
        Utils.cookie.set(cookieName, date);
        location.reload();
        return true;
    }

    function showPasswordPanel() {
        // 密碼嘗試失敗或無法自動取得日期 → 顯示手動輸入面板
        if (document.querySelector('.tm-pwd-panel')) return;

        const panel = document.createElement('div');
        panel.className = 'tm-pwd-panel';
        panel.innerHTML = `
            <label>🔑 輸入密碼解鎖</label>
            <input type="text" class="tm-pwd-input" placeholder="密碼（如 0523）" />
            <button class="tm-pwd-submit">解鎖</button>
            <div class="tm-pwd-status"></div>
        `;
        document.body.appendChild(panel);

        const input = panel.querySelector('.tm-pwd-input');
        const btn = panel.querySelector('.tm-pwd-submit');
        const status = panel.querySelector('.tm-pwd-status');

        const doUnlock = () => {
            const pwd = input.value.trim();
            if (!pwd) { status.textContent = '請輸入密碼'; return; }

            const host = location.hostname;
            if (host.includes('load.tw')) {
                // load.tw: 填入密碼表單提交
                const pwdInput = document.querySelector('input[name="password"], input[type="password"]');
                if (pwdInput) {
                    pwdInput.value = pwd;
                    const form = pwdInput.closest('form');
                    if (form) form.submit();
                } else {
                    status.textContent = '找不到密碼欄位';
                }
            } else {
                // myppt / lurl: 優先表單提交，fallback cookie
                const allPageInputs = document.querySelectorAll('input');
                let pagePwdInput = null;
                for (const inp of allPageInputs) {
                    if (inp.offsetWidth > 0 && inp.offsetHeight > 0 && 
                        (inp.placeholder.includes('密碼') || inp.name.includes('pasahaicsword') || inp.name.includes('password'))) {
                        pagePwdInput = inp;
                        break;
                    }
                }
                if (!pagePwdInput) pagePwdInput = document.querySelector('input[placeholder*="密碼"]');
                const pageForm = pagePwdInput ? pagePwdInput.closest('form') : document.querySelector('form');
                if (pagePwdInput && pageForm) {
                    pagePwdInput.value = pwd;
                    try {
                        HTMLFormElement.prototype.submit.call(pageForm);
                    } catch (e) {
                        pageForm.submit();
                    }
                } else {
                    const cookieName = getCookieName();
                    if (cookieName) {
                        Utils.cookie.set(cookieName, pwd);
                        location.reload();
                    } else {
                        status.textContent = '無法辨識頁面';
                    }
                }
            }
        };

        btn.addEventListener('click', doUnlock);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doUnlock(); });
        input.focus();
    }

    function isPasswordPage() {
        const host = location.hostname;
        if (host.includes('load.tw')) {
            return !!document.querySelector('input[name="password"], input[type="password"]');
        }
        // myppt/lurl: 沒有媒體內容 = 還沒解鎖
        if (host.includes('myppt.cc') || host.includes('lurl.cc')) {
            return !findMediaUrl();
        }
        return false;
    }

    function checkPasswordFailed() {
        // 如果設了 cookie 但頁面還是沒有媒體 → 密碼錯誤
        const cookieName = getCookieName();
        if (!cookieName) return false;
        return !!Utils.cookie.get(cookieName) && !findMediaUrl();
    }

    // ==================== 主流程 ====================
    function main() {
        const host = location.hostname;

        // 1. 修復影片播放器
        fixVideoPlayback();

        // 2. 如果已有媒體 → 直接顯示下載按鈕
        if (findMediaUrl()) {
            fixVideoPlayback();
            createDownloadButton();
            return;
        }

        // 3. 密碼頁面處理
        if (isPasswordPage()) {
            // 檢查是否已嘗試過密碼但失敗
            if (checkPasswordFailed()) {
                // 清除錯誤的 cookie，顯示手動輸入
                const cookieName = getCookieName();
                if (cookieName) Utils.cookie.del(cookieName);
                showPasswordPanel();
                return;
            }

            // 首次嘗試自動日期密碼
            const autoTried = GM_getValue('auto_tried_' + location.pathname, false);
            if (!autoTried) {
                GM_setValue('auto_tried_' + location.pathname, true);
                const success = tryDatePassword();
                if (success) return; // 會 reload
            }

            // 日期密碼失敗 → 嘗試 Dcard 傳來的密碼
            const dcardPws = getDcardPasswords();
            if (dcardPws.length > 0) {
                const triedKey = 'tm_dcard_tried_' + location.pathname;
                const triedIdx = GM_getValue(triedKey, 0);
                if (triedIdx < dcardPws.length) {
                    GM_setValue(triedKey, triedIdx + 1);
                    const pw = dcardPws[triedIdx];
                    const allInputs = document.querySelectorAll('input');
                    let pwdField = null;
                    for (const inp of allInputs) {
                        if (inp.offsetWidth > 0 && inp.offsetHeight > 0 &&
                            (inp.placeholder.includes('密碼') || inp.name.includes('pasahaicsword') || inp.name.includes('password'))) {
                            pwdField = inp;
                            break;
                        }
                    }
                    if (!pwdField) pwdField = document.querySelector('input[placeholder*="密碼"]');
                    const pwForm = pwdField ? pwdField.closest('form') : document.querySelector('form');
                    if (pwdField && pwForm) {
                        pwdField.value = pw;
                        pwForm.submit();
                        return;
                    }
                }
            }

            // 自動密碼失敗或已嘗試過 → 顯示手動輸入面板
            showPasswordPanel();
            return;
        }

        // 4. 等待媒體載入（MutationObserver）
        const observer = new MutationObserver(() => {
            if (findMediaUrl()) {
                observer.disconnect();
                fixVideoPlayback();
                createDownloadButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 30000);
    }

    // myppt.cc 年齡確認
    if (location.hostname.includes('myppt.cc') || location.hostname.includes('lurl.cc')) {
        const ageBtn = document.querySelector('button');
        if (ageBtn && (ageBtn.textContent.includes('18') || ageBtn.textContent.includes('進入'))) {
            ageBtn.addEventListener('click', () => setTimeout(main, 1000));
        } else {
            main();
        }
    } else if (location.hostname.includes('dcard.tw')) {
        dcardMain();
    } else {
        main();
    }

    // ==================== Dcard 整合 ====================
    function dcardMain() {
        // 從文章內容和留言區抓取密碼
        function extractPasswords() {
            const passwords = new Set();
            const text = document.body.innerText;

            // 常見密碼格式：4 位數字（MMDD）
            const mmddMatches = text.match(/密碼[：:=\s]*(\d{4})/gi);
            if (mmddMatches) {
                mmddMatches.forEach(m => {
                    const d = m.match(/(\d{4})/);
                    if (d) passwords.add(d[1]);
                });
            }

            // 「pass」「pw」「密碼」後面的文字
            const pwPatterns = [
                /(?:pass(?:word)?|pw|密碼|解鎖|解壓)[：:=\s]+([^\s,，、\n]{1,20})/gi,
            ];
            pwPatterns.forEach(pat => {
                let m;
                while ((m = pat.exec(text)) !== null) {
                    const val = m[1].trim().replace(/[」」】）)]/g, '');
                    if (val && val.length >= 3 && val.length <= 20) passwords.add(val);
                }
            });

            // 從日期格式提取 MMDD
            const dateMatches = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g);
            if (dateMatches) {
                dateMatches.forEach(d => {
                    const m = d.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
                    if (m) passwords.add(m[2].padStart(2, '0') + m[3].padStart(2, '0'));
                });
            }

            return [...passwords];
        }

        // 攔截 lurl/myppt 連結，附帶密碼參數
        function interceptLinks() {
            const links = document.querySelectorAll('a[href*="lurl.cc"], a[href*="myppt.cc"], a[href*="load.tw"]');
            if (links.length === 0) return;

            const passwords = extractPasswords();
            const ref = encodeURIComponent(location.href);

            links.forEach(link => {
                if (link.dataset.tmProcessed) return;
                link.dataset.tmProcessed = 'true';

                // 加上視覺標記
                link.style.borderBottom = '2px dashed #0a84ff';
                link.title = passwords.length > 0
                    ? `🔑 偵測到密碼: ${passwords.join(', ')}`
                    : '🔗 lurl/myppt 連結';

                // 修改連結帶上密碼和來源
                const url = new URL(link.href);
                if (passwords.length > 0) {
                    url.searchParams.set('tm_pw', passwords.join(','));
                }
                url.searchParams.set('ref', ref);
                link.href = url.toString();
            });

            return { linksFound: links.length, passwords };
        }

        // 顯示密碼偵測結果
        function showPasswordBadge(passwords) {
            if (passwords.length === 0) return;
            if (document.getElementById('tm-pw-badge')) return;

            const badge = document.createElement('div');
            badge.id = 'tm-pw-badge';
            badge.style.cssText = `
                position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
                background: #1a1a2e; color: #fff; border: 1px solid #0a84ff;
                border-radius: 12px; padding: 12px 16px; font-size: 13px;
                box-shadow: 0 4px 12px rgba(10,132,255,0.3);
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                max-width: 280px;
            `;
            badge.innerHTML = `
                <div style="font-weight:600;margin-bottom:6px;">🔑 偵測到密碼</div>
                <div style="color:#aaa;font-size:12px;">${passwords.map(p => `<code style="background:#333;padding:2px 6px;border-radius:4px;margin:2px;">${p}</code>`).join(' ')}</div>
                <div style="color:#666;font-size:11px;margin-top:6px;">點擊 lurl/myppt 連結會自動帶入</div>
            `;
            document.body.appendChild(badge);
            setTimeout(() => { badge.style.opacity = '0.5'; }, 8000);
        }

        // 在 lurl/myppt 頁面接收 Dcard 傳來的密碼
        function receiveDcardPassword() {
            const params = new URLSearchParams(location.search);
            const tmPw = params.get('tm_pw');
            if (tmPw) {
                const passwords = tmPw.split(',').filter(Boolean);
                GM_setValue('tm_passwords_' + location.pathname, JSON.stringify(passwords));
                // 清除 URL 參數（美觀）
                const clean = new URL(location.href);
                clean.searchParams.delete('tm_pw');
                clean.searchParams.delete('ref');
                history.replaceState(null, '', clean.toString());
                return passwords;
            }
            // 從 GM storage 讀取
            const stored = GM_getValue('tm_passwords_' + location.pathname, null);
            return stored ? JSON.parse(stored) : [];
        }

        // Dcard 頁面主邏輯
        const result = interceptLinks();
        if (result && result.passwords.length > 0) {
            showPasswordBadge(result.passwords);
        }

        // MutationObserver 監聽留言載入
        const observer = new MutationObserver(() => {
            const r = interceptLinks();
            if (r && r.passwords.length > 0) showPasswordBadge(r.passwords);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 60000);
    }

    // 在 lurl/myppt/load.tw 頁面接收 Dcard 傳來的密碼
    function getDcardPasswords() {
        const params = new URLSearchParams(location.search);
        const tmPw = params.get('tm_pw');
        if (tmPw) {
            const passwords = tmPw.split(',').filter(Boolean);
            GM_setValue('tm_passwords_' + location.pathname, JSON.stringify(passwords));
            const clean = new URL(location.href);
            clean.searchParams.delete('tm_pw');
            clean.searchParams.delete('ref');
            history.replaceState(null, '', clean.toString());
            return passwords;
        }
        const stored = GM_getValue('tm_passwords_' + location.pathname, null);
        return stored ? JSON.parse(stored) : [];
    }

})();
