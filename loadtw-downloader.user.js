// ==UserScript==
// @name         load.tw / myppt.cc / lurl.cc 自動解鎖+下載
// @namespace    https://github.com/zenyi0910/TM-loadtw-downloader
// @version      2.0.0
// @description  自動帶入日期密碼解鎖，一鍵下載影片/圖片（支援 load.tw / myppt.cc / lurl.cc）
// @author       Yi
// @match        https://load.tw/*
// @match        https://myppt.cc/*
// @match        https://lurl.cc/*
// @grant        GM_download
// @grant        GM_addStyle
// @run-at       document-idle
// @license      MIT
// @downloadURL  https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js
// @updateURL    https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js
// ==/UserScript==

(function() {
    'use strict';

    const HOST = location.hostname;

    GM_addStyle(`
        .yi-dl-btn {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 99999;
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
        .yi-dl-btn:hover {
            background: #0070e0;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(10,132,255,0.5);
        }
        .yi-dl-btn:active { transform: translateY(0); }
        .yi-dl-btn.downloading {
            background: #555;
            pointer-events: none;
        }
    `);

    // ==================== 媒體偵測 ====================
    function findMediaUrl() {
        // Video
        const video = document.querySelector('video');
        if (video) {
            const src = video.src || video.currentSrc;
            if (src) return src;
            const source = video.querySelector('source');
            if (source && source.src) return source.src;
        }
        // Image (content area)
        const selectors = [
            'main img[src*="store"]',
            'img[src*="myppt"]',
            'img[src*="lurl"]',
            'img[src*="imgur"]',
            '.content img[src*="store"]'
        ];
        for (const sel of selectors) {
            const img = document.querySelector(sel);
            if (img && img.src) return img.src;
        }
        // Preload links (lurl/myppt images)
        const preload = document.querySelector('link[rel="preload"][as="image"]');
        if (preload && preload.href) return preload.href;
        return null;
    }

    function getFilename(url) {
        return url.split('/').pop().split('?')[0] || 'download.mp4';
    }

    // ==================== 自動密碼 ====================
    function autoFillPassword() {
        if (HOST.includes('load.tw')) return loadTwPassword();
        if (HOST.includes('myppt.cc')) return mypptPassword();
        if (HOST.includes('lurl.cc')) return lurlPassword();
        return false;
    }

    function loadTwPassword() {
        // 從頁面日期文字提取 MMDD
        const dateMatch = document.body.innerText.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
        if (!dateMatch) return false;
        const password = dateMatch[2] + dateMatch[3];

        const pwdInput = document.querySelector('input[type="text"], input[type="password"]');
        if (!pwdInput) return false;

        pwdInput.value = password;
        pwdInput.dispatchEvent(new Event('input', { bubbles: true }));

        // 點解鎖按鈕
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
            if (btn.textContent.includes('解鎖') || btn.textContent.includes('Unlock')) {
                setTimeout(() => btn.click(), 200);
                return true;
            }
        }
        return false;
    }

    function mypptPassword() {
        // myppt 用 cookie 機制：psc_{id} = MMDD
        const idMatch = location.href.match(/myppt\.cc\/(\w+)/);
        if (!idMatch) return false;
        const cookieName = 'psc_' + idMatch[1];

        // 已有 cookie 就跳過
        if (document.cookie.includes(cookieName)) return false;

        // 從頁面日期或 video URL 提取日期
        const dateMatch = document.body.innerText.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        let mmdd = null;
        if (dateMatch) {
            mmdd = dateMatch[2].padStart(2,'0') + dateMatch[3].padStart(2,'0');
        } else {
            // 從 video src URL 提取: /20260520/xxx.mp4
            const vidSrc = document.querySelector('video source');
            if (vidSrc && vidSrc.src) {
                const m = vidSrc.src.match(/\/(\d{4})(\d{2})(\d{2})\//);
                if (m) mmdd = m[2] + m[3];
            }
        }
        if (!mmdd) return false;

        // 設 cookie 並 reload
        document.cookie = `${cookieName}=${mmdd}; path=/; max-age=${7*86400}`;
        location.reload();
        return true;
    }

    function lurlPassword() {
        // lurl 跟 myppt 機制相同
        const idMatch = location.href.match(/lurl\.cc\/(\w+)/);
        if (!idMatch) return false;
        const cookieName = 'psc_' + idMatch[1];

        if (document.cookie.includes(cookieName)) return false;

        const dateMatch = document.body.innerText.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        let mmdd = null;
        if (dateMatch) {
            mmdd = dateMatch[2].padStart(2,'0') + dateMatch[3].padStart(2,'0');
        } else {
            const vidSrc = document.querySelector('video source');
            if (vidSrc && vidSrc.src) {
                const m = vidSrc.src.match(/\/(\d{4})(\d{2})(\d{2})\//);
                if (m) mmdd = m[2] + m[3];
            }
        }
        if (!mmdd) return false;

        document.cookie = `${cookieName}=${mmdd}; path=/; max-age=${7*86400}`;
        location.reload();
        return true;
    }

    // ==================== 下載按鈕 ====================
    function createButton() {
        if (document.querySelector('.yi-dl-btn')) return;
        const url = findMediaUrl();
        if (!url) return;

        const btn = document.createElement('button');
        btn.className = 'yi-dl-btn';
        btn.innerHTML = '⬇ 下載';
        btn.title = getFilename(url);

        btn.addEventListener('click', function() {
            const mediaUrl = findMediaUrl();
            if (!mediaUrl) { alert('找不到媒體 URL'); return; }

            btn.classList.add('downloading');
            btn.innerHTML = '⏳ 下載中...';

            const headers = {
                'Referer': location.origin + '/',
                'sec-fetch-dest': 'video',
                'sec-fetch-mode': 'no-cors',
                'sec-fetch-site': 'same-site'
            };

            if (typeof GM_download !== 'undefined') {
                GM_download({
                    url: mediaUrl,
                    name: getFilename(mediaUrl),
                    headers: headers,
                    onload: () => {
                        btn.innerHTML = '✅ 完成';
                        setTimeout(() => {
                            btn.classList.remove('downloading');
                            btn.innerHTML = '⬇ 下載';
                        }, 3000);
                    },
                    onerror: () => {
                        fallbackDownload(mediaUrl);
                        btn.classList.remove('downloading');
                        btn.innerHTML = '⬇ 下載';
                    }
                });
            } else {
                fallbackDownload(mediaUrl);
                btn.classList.remove('downloading');
                btn.innerHTML = '⬇ 下載';
            }
        });

        document.body.appendChild(btn);
    }

    function fallbackDownload(url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = getFilename(url);
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // ==================== 初始化 ====================
    function init() {
        if (findMediaUrl()) {
            createButton();
            return;
        }
        autoFillPassword();

        const observer = new MutationObserver(() => {
            if (findMediaUrl()) {
                observer.disconnect();
                createButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 30000);
    }

    // 年齡確認：自動點擊
    const ageBtn = document.getElementById('confirmOver18')
        || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('18'));
    if (ageBtn) {
        ageBtn.click();
        setTimeout(init, 1500);
    } else {
        init();
    }
})();
