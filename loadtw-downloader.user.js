// ==UserScript==
// @name         load.tw 自動解鎖+下載
// @namespace    https://github.com/zenyi0910/TM-loadtw-downloader
// @version      1.0.0
// @description  load.tw 自動帶入日期密碼解鎖，一鍵下載影片/圖片
// @author       Yi
// @match        https://load.tw/*
// @grant        GM_download
// @grant        GM_addStyle
// @run-at       document-idle
// @license      MIT
// @downloadURL  https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js
// @updateURL    https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        .loadtw-dl-btn {
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
        .loadtw-dl-btn:hover {
            background: #0070e0;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(10,132,255,0.5);
        }
        .loadtw-dl-btn:active { transform: translateY(0); }
        .loadtw-dl-btn.downloading {
            background: #555;
            pointer-events: none;
        }
    `);

    function findMediaUrl() {
        const video = document.querySelector('video');
        if (video && (video.src || video.currentSrc)) return video.src || video.currentSrc;
        const source = document.querySelector('video source');
        if (source && source.src) return source.src;
        const img = document.querySelector('main img[src*="store"]');
        if (img) return img.src;
        return null;
    }

    function getFilename(url) {
        return url.split('/').pop().split('?')[0] || 'download.mp4';
    }

    function autoFillPassword() {
        // 從頁面顯示的日期提取 MMDD（如「2026/05/19」→ 0519）
        const dateEl = document.body.innerText.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
        if (!dateEl) return false;

        const password = dateEl[2] + dateEl[3]; // MMDD

        // 找密碼輸入框
        const pwdInput = document.querySelector('input[type="text"], input[type="password"]');
        if (!pwdInput) return false;

        // 填入密碼
        pwdInput.value = password;
        pwdInput.dispatchEvent(new Event('input', { bubbles: true }));

        // 點擊解鎖按鈕
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
            if (btn.textContent.includes('解鎖') || btn.textContent.includes('Unlock')) {
                setTimeout(() => btn.click(), 200);
                return true;
            }
        }
        return false;
    }

    function createButton() {
        if (document.querySelector('.loadtw-dl-btn')) return;
        const url = findMediaUrl();
        if (!url) return;

        const btn = document.createElement('button');
        btn.className = 'loadtw-dl-btn';
        btn.innerHTML = '⬇ 下載';
        btn.title = getFilename(url);

        btn.addEventListener('click', function() {
            const mediaUrl = findMediaUrl();
            if (!mediaUrl) { alert('找不到媒體 URL'); return; }

            btn.classList.add('downloading');
            btn.innerHTML = '⏳ 下載中...';

            if (typeof GM_download !== 'undefined') {
                GM_download({
                    url: mediaUrl,
                    name: getFilename(mediaUrl),
                    headers: {
                        'Referer': 'https://load.tw/',
                        'sec-fetch-dest': 'video',
                        'sec-fetch-mode': 'no-cors',
                        'sec-fetch-site': 'same-site'
                    },
                    onload: function() {
                        btn.innerHTML = '✅ 完成';
                        setTimeout(() => {
                            btn.classList.remove('downloading');
                            btn.innerHTML = '⬇ 下載';
                        }, 3000);
                    },
                    onerror: function() {
                        // Fallback: anchor download
                        const a = document.createElement('a');
                        a.href = mediaUrl;
                        a.download = getFilename(mediaUrl);
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        btn.classList.remove('downloading');
                        btn.innerHTML = '⬇ 下載';
                    }
                });
            } else {
                const a = document.createElement('a');
                a.href = mediaUrl;
                a.download = getFilename(mediaUrl);
                document.body.appendChild(a);
                a.click();
                a.remove();
                btn.classList.remove('downloading');
                btn.innerHTML = '⬇ 下載';
            }
        });

        document.body.appendChild(btn);
    }

    function init() {
        // 如果已有媒體，直接建按鈕
        if (findMediaUrl()) {
            createButton();
            return;
        }

        // 嘗試自動填密碼
        autoFillPassword();

        // 監聽 DOM 變化（密碼解鎖後會載入媒體）
        const observer = new MutationObserver(() => {
            if (findMediaUrl()) {
                observer.disconnect();
                createButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 30000);
    }

    // 年齡確認頁面：自動點擊後再初始化
    const ageBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('18'));
    if (ageBtn) {
        ageBtn.click();
        setTimeout(init, 1500);
    } else {
        init();
    }
})();
