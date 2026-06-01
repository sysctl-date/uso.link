/* ==========================================================================
 * usolink-brush.js — 优速网涂鸦画板笔触引擎
 *
 * 取代旧的 oCanvas 直线段画法。核心技术(均有公开论文/实现支撑):
 *   · 1€ Filter —— Casiez, Roussel, Vogel, "1€ Filter: A Simple Speed-based
 *     Low-pass Filter for Noisy Input in Interactive Systems", CHI 2012。
 *     对指针坐标做自适应低通滤波:慢速时强平滑去抖,快速时低延迟跟手。
 *   · 速度/压感动态笔宽 —— 慢→粗、快→细,近似 signature_pad / perfect-freehand
 *     的做法;有手写笔时直接用 PointerEvent.pressure。
 *   · 沿平滑路径密集戳印 + 起收笔 taper —— 形成平滑、有粗细变化的笔锋。
 *   · Pointer Events + getCoalescedEvents() 高频采样;devicePixelRatio 高清渲染。
 *
 * 暴露全局:clearAll() / re_draw()(撤销) / saveImageInfo()(存 PNG),
 * 供页面按钮 onclick 与 hotkeys 调用。读取页面 .tool 里的颜色/笔粗/笔触选择。
 * ====================================================================== */
(function () {
    'use strict';
    var canvas = document.getElementById('canvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');

    // ---------- 状态 ----------
    var color = '#000';
    var size = 3;
    var brush = 'pen';            // pen | ink | marker | pencil
    var strokes = [];            // 已完成笔画,用于撤销/重绘
    var current = null;          // 当前正在画的笔画
    var drawing = false;
    var DPR = Math.max(1, window.devicePixelRatio || 1);
    var LOGICAL_H = 500;         // 逻辑高度(CSS 像素)
    var lastW = size, lastPt = null;
    var fx = oneEuro(), fy = oneEuro();

    // ---------- 1€ Filter (CHI 2012) ----------
    function lowpass() {
        var s = null;
        return {
            filter: function (x, a) { s = (s === null) ? x : a * x + (1 - a) * s; return s; },
            has: function () { return s !== null; }
        };
    }
    function oneEuro(minCutoff, beta, dCutoff) {
        minCutoff = minCutoff || 1.6; beta = beta || 0.015; dCutoff = dCutoff || 1.0;
        var xf = lowpass(), dxf = lowpass(), lastT = null, lastX = null;
        function alpha(cut, dt) { var r = 2 * Math.PI * cut * dt; return r / (r + 1); }
        return {
            reset: function () { xf = lowpass(); dxf = lowpass(); lastT = null; lastX = null; },
            filter: function (x, t) {
                if (lastT === null) { lastT = t; lastX = x; return x; }
                var dt = (t - lastT) / 1000; if (dt <= 0) dt = 1 / 120; lastT = t;
                var dx = (x - lastX) / dt; lastX = x;
                var edx = dxf.filter(dx, alpha(dCutoff, dt));
                var cutoff = minCutoff + beta * Math.abs(edx);
                return xf.filter(x, alpha(cutoff, dt));
            }
        };
    }

    // ---------- 画布尺寸 / 高清 ----------
    function setupSize() {
        var cssW = canvas.clientWidth || canvas.parentNode.clientWidth || 1000;
        var cssH = LOGICAL_H;
        DPR = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.round(cssW * DPR);
        canvas.height = Math.round(cssH * DPR);
        canvas.style.height = cssH + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        renderAll();
    }

    function paintBackground() {
        ctx.save();
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width / DPR, canvas.height / DPR);
        ctx.restore();
    }

    // ---------- 笔宽:压感优先,否则按速度 ----------
    function widthFor(pt, pressure, isPen) {
        var base = size;
        var w;
        if (isPen && pressure > 0) {
            w = base * (0.35 + 1.3 * pressure);
        } else {
            var v = 0;
            if (lastPt) {
                var dt = Math.max(1, pt.t - lastPt.t);
                v = Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) / dt; // px/ms
            }
            var vmax = 2.3;
            var k = Math.min(v / vmax, 1);
            // 慢 → 粗(1.55x),快 → 细(0.55x)
            var target = base * (1.55 - 1.0 * k);
            w = lastW * 0.45 + target * 0.55;     // 速度滤波,避免突变
        }
        // 各笔触微调
        if (brush === 'ink') {            // 毛笔:粗细更夸张
            w = base * 0.5 + (w - base * 0.5) * 1.6;
        } else if (brush === 'marker') {  // 马克笔:恒定宽
            w = base * 1.15;
        } else if (brush === 'pencil') {  // 铅笔:略细
            w = Math.max(base * 0.7, w * 0.75);
        }
        return clamp(w, 0.6, base * 3.2);
    }

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // ---------- 戳印:不同笔触的落点画法 ----------
    function stamp(x, y, w, t) {
        var r = w / 2;
        if (brush === 'marker') {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.rect(x - r, y - r * 0.82, w, w * 0.82); // 略扁,马克笔感
            ctx.fill();
        } else if (brush === 'pencil') {
            // 颗粒质感:在落点周围抖动若干小点,低透明叠加成石墨纹理
            ctx.fillStyle = color;
            var n = 5 + Math.round(r);
            for (var i = 0; i < n; i++) {
                var ang = Math.random() * Math.PI * 2;
                var rad = Math.random() * r;
                ctx.globalAlpha = 0.10 + Math.random() * 0.16;
                ctx.beginPath();
                ctx.arc(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad,
                        0.5 + Math.random() * 0.7, 0, Math.PI * 2);
                ctx.fill();
            }
        } else { // pen / ink
            ctx.globalAlpha = (brush === 'ink') ? 0.96 : 1;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // 在两点间沿直线密集戳印,半径线性插值(配合已平滑的点 → 平滑变宽笔锋)
    function paintSeg(x0, y0, w0, x1, y1, w1) {
        var d = Math.hypot(x1 - x0, y1 - y0);
        var step = Math.max(0.8, (w0 + w1) / 8);
        var steps = Math.max(1, Math.ceil(d / step));
        for (var i = 1; i <= steps; i++) {
            var t = i / steps;
            stamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w0 + (w1 - w0) * t, t);
        }
        ctx.globalAlpha = 1;
    }

    // ---------- 重绘(撤销/缩放后回放所有笔画) ----------
    function drawStroke(s) {
        var savedColor = color, savedBrush = brush;
        color = s.color; brush = s.brush;
        var p = s.points;
        if (p.length === 1) { var r0 = p[0].w / 2; stamp(p[0].x, p[0].y, p[0].w, 1); }
        for (var i = 1; i < p.length; i++) {
            paintSeg(p[i - 1].x, p[i - 1].y, p[i - 1].w, p[i].x, p[i].y, p[i].w);
        }
        color = savedColor; brush = savedBrush;
        ctx.globalAlpha = 1;
    }
    function renderAll() {
        paintBackground();
        for (var i = 0; i < strokes.length; i++) drawStroke(strokes[i]);
    }

    // ---------- 指针事件 ----------
    function posOf(e) {
        var r = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvas.width / r.width) / DPR,
            y: (e.clientY - r.top) * (canvas.height / r.height) / DPR,
            t: (e.timeStamp || (window.performance && performance.now()) || Date.now())
        };
    }

    function begin(e) {
        drawing = true;
        fx.reset(); fy.reset();
        lastPt = null; lastW = size;
        var raw = posOf(e);
        var isPen = e.pointerType === 'pen';
        var p = { x: raw.x, y: raw.y, t: raw.t };
        p.w = widthFor(p, e.pressure, isPen);
        // 起笔略收(taper-in)
        p.w = p.w * 0.55;
        current = { color: color, brush: brush, points: [p] };
        lastPt = p; lastW = p.w;
        stamp(p.x, p.y, p.w, 0);
        ctx.globalAlpha = 1;
    }

    function extendWith(raw, pressure, isPen) {
        var sx = fx.filter(raw.x, raw.t);
        var sy = fy.filter(raw.y, raw.t);
        var p = { x: sx, y: sy, t: raw.t };
        // 距离太近忽略,降噪
        if (lastPt && Math.hypot(p.x - lastPt.x, p.y - lastPt.y) < 0.6) return;
        p.w = widthFor(p, pressure, isPen);
        paintSeg(lastPt.x, lastPt.y, lastW, p.x, p.y, p.w);
        current.points.push(p);
        lastPt = p; lastW = p.w;
    }

    function move(e) {
        if (!drawing || !current) return;
        var isPen = e.pointerType === 'pen';
        var evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
        for (var i = 0; i < evs.length; i++) {
            var raw = posOf(evs[i]);
            extendWith(raw, evs[i].pressure, isPen);
        }
    }

    function end() {
        if (!drawing) return;
        drawing = false;
        if (current && current.points.length) {
            // 收笔 taper-out:把最后一点半径压细
            var pts = current.points;
            pts[pts.length - 1].w *= 0.5;
            strokes.push(current);
            if (strokes.length > 200) strokes.shift();
        }
        current = null;
    }

    // 优先 Pointer Events,回退到鼠标/触摸
    if (window.PointerEvent) {
        canvas.addEventListener('pointerdown', function (e) {
            if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
            canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
            begin(e); e.preventDefault();
        });
        canvas.addEventListener('pointermove', function (e) { move(e); if (drawing) e.preventDefault(); });
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
    } else {
        canvas.addEventListener('mousedown', function (e) { begin(e); e.preventDefault(); });
        canvas.addEventListener('mousemove', function (e) { if (drawing) { move(e); e.preventDefault(); } });
        window.addEventListener('mouseup', end);
        canvas.addEventListener('touchstart', function (e) { begin(e.touches[0]); e.preventDefault(); }, { passive: false });
        canvas.addEventListener('touchmove', function (e) { move(e.touches[0]); e.preventDefault(); }, { passive: false });
        canvas.addEventListener('touchend', end);
    }
    canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

    // ---------- 工具栏:颜色 / 笔粗 / 笔触 ----------
    function bind(sel, handler) {
        var nodes = document.querySelectorAll(sel);
        for (var i = 0; i < nodes.length; i++) {
            (function (node) {
                node.addEventListener('click', function () {
                    var sibs = node.parentNode.children;
                    for (var j = 0; j < sibs.length; j++) sibs[j].classList.remove('active');
                    node.classList.add('active');
                    handler(node);
                });
            })(nodes[i]);
        }
    }
    bind('.tool .color div', function (n) { color = n.getAttribute('data-color'); });
    bind('.tool .size div', function (n) { size = parseInt(n.getAttribute('data-size'), 10) || 3; });
    bind('.tool .brush div', function (n) { brush = n.getAttribute('data-brush') || 'pen'; });

    // 自定义颜色(原生取色器)
    var customColor = document.getElementById('customColor');
    if (customColor) {
        customColor.addEventListener('input', function () {
            color = customColor.value;
            var kids = document.querySelectorAll('.tool .color > *');
            for (var i = 0; i < kids.length; i++) kids[i].classList.remove('active');
            if (customColor.parentNode) customColor.parentNode.classList.add('active');
        });
    }

    // ---------- 对外函数 ----------
    window.clearAll = function () { strokes = []; current = null; renderAll(); };
    window.re_draw = function () { strokes.pop(); renderAll(); };
    window.saveImageInfo = function () {
        try {
            var url = canvas.toDataURL('image/png');
            var a = document.createElement('a');
            a.href = url; a.download = 'usolink-涂鸦.png';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch (err) { window.location.href = canvas.toDataURL('image/png'); }
    };

    // ---------- 初始化 ----------
    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(setupSize, 150);
    });
    setupSize();
})();
