// ==UserScript==
// @name         load.tw / myppt.cc / lurl.cc 自動解鎖+下載
// @namespace    https://load.tw/
// @version      4.2
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
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @updateURL    https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js
// @downloadURL  https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js
// ==/UserScript==

(function($) {
    'use strict';

    const Utils = {
        extractMMDD: (dateText) => {
            const pattern = /(\d{4})-(\d{2})-(\d{2})/;
            const match = dateText.match(pattern);
            return match ? match[2] + match[3] : null;
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
        }
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

    // ==================== 密碼 Helper（lurl/myppt 共用）====================
    function makeDateHelper(siteRegex) {
        return {
            getCookieName: () => {
                const m = location.href.match(siteRegex);
                return m ? `psc_${m[1]}` : null;
            },
            isPasswordCorrect: () => {
                const $s = $('#back_top .container.NEWii_con section:nth-child(6) h2 span');
                const t = $s.text();
                return t.includes('成功') || t.includes('錯誤');
            },
            tryPassword: () => {
                const helper = makeDateHelper(siteRegex);
                if (helper.isPasswordCorrect()) return false;
                const cookieName = helper.getCookieName();
                if (!cookieName) return false;
                if (Utils.cookie.get(cookieName)) return false;
                // 從 .login_span 取日期
                const $dateSpan = $('.login_span').eq(1);
                if ($dateSpan.length) {
                    const date = Utils.extractMMDD($dateSpan.text());
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
        const $v = $('video').first();
        if ($v.attr('src')) return $v.attr('src');
        const $s = $v.find('source').first();
        return $s.attr('src') || null;
    }
    function getImageUrls() {
        const urls = [];
        $('link[rel="preload"][as="image"]').each(function() {
            const href = $(this).attr('href');
            if (href && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(href)) urls.push(href);
        });
        if (!urls.length) {
            $('img').each(function() {
                const src = $(this).attr('src') || '';
                if (src.includes('mplimit') || src.includes('store')) urls.push(src);
            });
        }
        return urls;
    }
    function replaceVideoPlayer() {
        const videoUrl = getVideoUrl();
        if (!videoUrl) return;
        const $c = $('.video-js').first();
        if ($c.length) {
            $c.removeClass().removeAttr('oncontextmenu controlslist style').css({width:'100%',maxWidth:'100%',position:'relative'});
            $c.find('.vjs-control-bar,.vjs-poster,.vjs-loading-spinner,.vjs-big-play-button,.vjs-text-track-display,.vjs-modal-dialog').remove();
            const $v = $c.find('video');
            if ($v.length) {
                $v.attr({src:videoUrl,controls:true,preload:'metadata'}).removeClass()
                  .removeAttr('oncontextmenu controlslist data-setup tabindex role style')
                  .css({width:'100%',maxWidth:'100%',height:'auto',display:'block'});
                $v[0].load();
            }
        }
    }
    function injectDownloadButton() {
        if ($('.media-dl-btn').length) return;
        const videoUrl = getVideoUrl();
        if (videoUrl) {
            const $btn = $('<button>',{text:'⬇ 下載影片',class:'media-dl-btn'});
            $btn.on('click', async function() {
                $btn.addClass('downloading').text('⏳ 下載中...');
                await Utils.downloadFile(videoUrl, 'video.mp4');
                $btn.removeClass('downloading').text('⬇ 下載影片');
            });
            $('body').append($btn);
            return;
        }
        const imgs = getImageUrls();
        if (imgs.length) {
            const label = imgs.length > 1 ? `⬇ 下載全部圖片 (${imgs.length})` : '⬇ 下載圖片';
            const $btn = $('<button>',{text:label,class:'media-dl-btn'});
            $btn.on('click', async function() {
                $btn.addClass('downloading').text('⏳ 下載中...');
                for (let i=0;i<imgs.length;i++) await Utils.downloadFile(imgs[i], `image_${i+1}.jpg`);
                $btn.removeClass('downloading').text(label);
            });
            $('body').append($btn);
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
            history.replaceState(null,'',clean.toString());
            return pws;
        }
        const stored = GM_getValue('tm_pw_' + location.pathname, null);
        return stored ? JSON.parse(stored) : [];
    }

    // ==================== 手動密碼面板 ====================
    function showPasswordPanel() {
        if ($('.tm-pwd-panel').length) return;
        const panel = $(`<div class="tm-pwd-panel">
            <label>🔑 輸入密碼解鎖</label>
            <input type="text" class="tm-pwd-input" placeholder="密碼（如 0523）"/>
            <button class="tm-pwd-submit">解鎖</button>
        </div>`);
        $('body').append(panel);
        panel.find('.tm-pwd-submit').on('click', () => {
            const pwd = panel.find('.tm-pwd-input').val().trim();
            if (!pwd) return;
            if (location.hostname.includes('load.tw')) {
                const inp = document.querySelector('input[name="password"],input[type="password"]');
                if (inp) { inp.value = pwd; inp.closest('form').submit(); }
            } else {
                const m = location.href.match(/(?:myppt|lurl)\.cc\/(\w+)/);
                if (m) { Utils.cookie.set(`psc_${m[1]}`, pwd); location.reload(); }
            }
        });
        panel.find('.tm-pwd-input').on('keydown', e => { if (e.key==='Enter') panel.find('.tm-pwd-submit').click(); });
    }

    // ==================== DcardHandler ====================
    function dcardMain() {
        function extractPasswords() {
            const pws = new Set(); const text = document.body.innerText;
            const patterns = [/(?:pass(?:word)?|pw|密碼|解鎖|解壓)[：:=\s]+([^\s,，、\n]{1,20})/gi];
            patterns.forEach(pat => { let m; while((m=pat.exec(text))!==null) {
                const v = m[1].trim().replace(/[」」】）)]/g,'');
                if (v && v.length>=3 && v.length<=20) pws.add(v);
            }});
            const mmdd = text.match(/密碼[：:=\s]*(\d{4})/gi);
            if (mmdd) mmdd.forEach(m => { const d=m.match(/(\d{4})/); if(d) pws.add(d[1]); });
            const dates = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g);
            if (dates) dates.forEach(d => { const m=d.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/); if(m) pws.add(m[2].padStart(2,'0')+m[3].padStart(2,'0')); });
            return [...pws];
        }
        function interceptLinks() {
            const links = document.querySelectorAll('a[href*="lurl.cc"],a[href*="myppt.cc"],a[href*="load.tw"]');
            if (!links.length) return {linksFound:0,passwords:[]};
            const passwords = extractPasswords();
            const ref = encodeURIComponent(location.href);
            links.forEach(link => {
                if (link.dataset.tmProcessed) return;
                link.dataset.tmProcessed = 'true';
                link.style.borderBottom = '2px dashed #0a84ff';
                link.title = passwords.length ? `🔑 密碼: ${passwords.join(', ')}` : '🔗 lurl/myppt';
                const url = new URL(link.href);
                if (passwords.length) url.searchParams.set('tm_pw', passwords.join(','));
                url.searchParams.set('ref', ref);
                link.href = url.toString();
            });
            return {linksFound:links.length, passwords};
        }
        function showBadge(passwords) {
            if (!passwords.length || document.getElementById('tm-pw-badge')) return;
            const badge = document.createElement('div'); badge.id = 'tm-pw-badge';
            badge.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;background:#1a1a2e;color:#fff;border:1px solid #0a84ff;border-radius:12px;padding:12px 16px;font-size:13px;box-shadow:0 4px 12px rgba(10,132,255,0.3);max-width:280px;';
            badge.innerHTML = `<div style="font-weight:600;margin-bottom:6px;">🔑 偵測到密碼</div><div style="color:#aaa;font-size:12px;">${passwords.map(p=>`<code style="background:#333;padding:2px 6px;border-radius:4px;">${p}</code>`).join(' ')}</div><div style="color:#666;font-size:11px;margin-top:6px;">點擊連結會自動帶入</div>`;
            document.body.appendChild(badge);
            setTimeout(()=>{badge.style.opacity='0.5';},8000);
        }
        const r = interceptLinks();
        if (r.passwords.length) showBadge(r.passwords);
        const obs = new MutationObserver(()=>{ const r2=interceptLinks(); if(r2.passwords.length) showBadge(r2.passwords); });
        obs.observe(document.body,{childList:true,subtree:true});
        setTimeout(()=>obs.disconnect(),60000);
    }

    // ==================== 年齡確認 ====================
    function autoConfirmAge() {
        const btns = document.querySelectorAll('button');
        for (const b of btns) { if (b.textContent.includes('18')||b.textContent.includes('進入')) { b.click(); return; } }
    }

    // ==================== 版本更新檢查 ====================
    const SCRIPT_VERSION = '4.2';
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
                    badge.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;background:#1a1a2e;color:#fff;border:1px solid #f59e0b;border-radius:12px;padding:14px 18px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:280px;';
                    badge.innerHTML = `<div style="font-weight:600;margin-bottom:6px;">🔄 有新版本 v${m[1]}</div><a href="https://github.com/zenyi0910/TM-loadtw-downloader/raw/main/loadtw-downloader.user.js" target="_blank" style="color:#0a84ff;">點此更新</a> <span style="color:#666;margin-left:8px;cursor:pointer;" id="tm-dismiss">✕</span>`;
                    document.body.appendChild(badge);
                    badge.querySelector('#tm-dismiss').onclick = () => badge.remove();
                }
            }
        });
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
        $(document).ready(() => {
            if ($('video').length || getImageUrls().length) {
                replaceVideoPlayer();
                injectDownloadButton();
            } else {
                // 還在密碼頁 → 顯示手動面板
                showPasswordPanel();
            }
        });
    } else if (host.includes('load.tw')) {
        const dcardPws = getDcardPasswords();
        // 密碼頁
        const pwInput = document.querySelector('input[name="password"],input[type="password"]');
        if (pwInput) {
            // 從 URL 取日期
            const m = location.pathname.match(/\/u\/\d{4}\/(\d{2})\/(\d{2})\//);
            if (m) { pwInput.value = m[1]+m[2]; pwInput.closest('form').submit(); }
            else if (dcardPws.length) { pwInput.value = dcardPws[0]; pwInput.closest('form').submit(); }
            else { showPasswordPanel(); }
        } else {
            // 已解鎖
            $(document).ready(() => { replaceVideoPlayer(); injectDownloadButton(); });
        }
    }

})();
