/* ==========================================================================
 * usolink-history.js — 历史使用记录
 * 每访问一个工具页,把它的路径与名称(取页面 H1)写入 localStorage;
 * 首页读取并渲染成与其它分类一致的卡片(#usolink-history),
 * 同时填充页脚的“您的足迹”(#visit_history)。全部在浏览器本地,不上传。
 * ====================================================================== */
(function () {
    'use strict';
    var KEY = 'usolink_history';
    var MAX = 12;
    var path = location.pathname;

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
    }
    function save(list) {
        try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    }
    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    // 记录当前工具页(跳过首页与非 .html 页)
    function record() {
        if (path === '/' || path === '/index.html' || !/\.html$/.test(path)) return;
        var h1 = document.querySelector('.tool-head h1') || document.querySelector('h1');
        var name = h1 ? h1.textContent.trim() : (document.title || '').split(/[-–|]/)[0].trim();
        if (!name) return;
        var list = load().filter(function (x) { return x.p !== path; });
        list.unshift({ p: path, n: name });
        if (list.length > MAX) list = list.slice(0, MAX);
        save(list);
    }

    function linkList(list) {
        var h = '';
        for (var i = 0; i < list.length; i++) {
            h += '<li><span></span><a href="' + esc(list[i].p) + '">' + esc(list[i].n) + '</a></li>';
        }
        return h;
    }

    // 首页卡片
    function renderHomeCard() {
        var mount = document.getElementById('usolink-history');
        if (!mount) return;
        var list = load();
        if (!list.length) { mount.style.display = 'none'; return; }
        mount.innerHTML = '<h3><span>历史使用</span></h3>' + linkList(list);
        mount.style.display = '';
    }

    // 页脚“您的足迹”
    function renderFootprint() {
        var span = document.getElementById('visit_history');
        if (!span) return;
        var list = load();
        if (!list.length) { span.innerHTML = '<em style="color:#9a9a9f">还没有记录，开始用几个工具吧</em>'; return; }
        var parts = [];
        for (var i = 0; i < list.length; i++) {
            parts.push('<a href="' + esc(list[i].p) + '" style="margin-right:14px;white-space:nowrap;">' + esc(list[i].n) + '</a>');
        }
        span.innerHTML = parts.join('');
    }

    record();
    renderHomeCard();
    renderFootprint();
})();
