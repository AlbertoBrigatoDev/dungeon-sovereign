// Dungeon Sovereign - Layer FX PixiJS.
//
// Namespace: window.DS.fx (parallelo a DS.sounds e DS.music).
//
// Sessione 1 (Fondamenta): monta il canvas WebGL full-viewport trasparente,
// gestisce resize, visibilitychange, feature flag.
//
// Sessione 2 (Aure status): aggiunge DS.fx.statusAura per attaccare aure
// particellari persistenti a unita' con status attivi (Veleno, Sanguinamento,
// Gelo, Lentezza, Sonno, Maledizione, Ispirazione, Debolezza). Le aure
// inseguono il DOM target via getBoundingClientRect() ad ogni frame.
//
// Convenzione di sicurezza: identica ad animations.js / sounds.js. Se PIXI
// non e' caricato (CDN bloccato, file mancante in cache offline) il modulo
// degrada a no-op silenzioso e l'app continua a funzionare con le sole
// animazioni Anime.js / CSS.

window.DS = window.DS || {};

DS.fx = (function () {

    // ------------------------------------------------------------------
    // Stato interno
    // ------------------------------------------------------------------

    let _app = null;             // PIXI.Application | null
    let _canvas = null;          // HTMLCanvasElement | null
    let _enabled = true;         // feature flag globale
    let _initPromise = null;     // garantisce idempotenza di init()
    let _resizeHandler = null;
    let _visibilityHandler = null;

    // ------------------------------------------------------------------
    // Rilevamento dipendenze (log informativi, no throw)
    // ------------------------------------------------------------------

    function detectVendors() {
        if (typeof PIXI === 'undefined') {
            console.warn('DS.fx: PixiJS non trovato. Il layer FX sara no-op.');
            return false;
        }
        console.log('DS.fx: PixiJS v' + (PIXI.VERSION || '?') + ' rilevato.');

        // particle-emitter v5 si aggancia a PIXI.particles
        if (PIXI.particles && PIXI.particles.Emitter) {
            console.log('DS.fx: @pixi/particle-emitter rilevato.');
        } else {
            console.warn('DS.fx: @pixi/particle-emitter non rilevato (atteso in PIXI.particles).');
        }

        // pixi-filters v5 espone __filters globale; v7 lo mappa anche in PIXI.filters.
        const filtersGlobal = (typeof __filters !== 'undefined') ? __filters : null;
        const filtersOnPixi = (PIXI.filters && PIXI.filters.GlowFilter) ? PIXI.filters : null;
        if (filtersGlobal || filtersOnPixi) {
            console.log('DS.fx: pixi-filters rilevato.');
        } else {
            console.warn('DS.fx: pixi-filters non rilevato (atteso in __filters o PIXI.filters).');
        }

        return true;
    }

    // ------------------------------------------------------------------
    // Mobile detection
    // ------------------------------------------------------------------

    function isCoarsePointer() {
        try {
            return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        } catch (e) {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Canvas styling
    // ------------------------------------------------------------------

    function styleCanvas(canvas) {
        canvas.id = 'ds-fx-canvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '30';
        canvas.setAttribute('aria-hidden', 'true');
    }

    // ------------------------------------------------------------------
    // init(): idempotente, no-throw
    // ------------------------------------------------------------------

    function init() {
        if (_initPromise) return _initPromise;
        _initPromise = (async () => {
            try {
                if (!detectVendors()) return;

                const resolution = Math.min(window.devicePixelRatio || 1, 2);
                const isMobile = isCoarsePointer();

                _app = new PIXI.Application({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    backgroundAlpha: 0,
                    antialias: !isMobile,
                    resolution: resolution,
                    autoDensity: true,
                    powerPreference: isMobile ? 'low-power' : 'high-performance'
                });

                _canvas = _app.view;
                styleCanvas(_canvas);
                document.body.appendChild(_canvas);

                _app.ticker.maxFPS = isMobile ? 30 : 60;

                _resizeHandler = () => {
                    if (!_app || !_app.renderer) return;
                    _app.renderer.resize(window.innerWidth, window.innerHeight);
                };
                window.addEventListener('resize', _resizeHandler, { passive: true });

                _visibilityHandler = () => {
                    if (!_app || !_app.ticker) return;
                    if (document.visibilityState === 'hidden') {
                        _app.ticker.stop();
                    } else if (_enabled) {
                        _app.ticker.start();
                    }
                };
                document.addEventListener('visibilitychange', _visibilityHandler);

                if (!_enabled) {
                    _app.ticker.stop();
                }

                console.log('DS.fx: canvas inizializzato (' +
                    window.innerWidth + 'x' + window.innerHeight +
                    ', resolution=' + resolution +
                    ', maxFPS=' + _app.ticker.maxFPS + ').');
            } catch (e) {
                console.error('DS.fx: init fallita.', e);
                _app = null;
                _canvas = null;
            }
        })();
        return _initPromise;
    }

    function setEnabled(value) {
        _enabled = !!value;
        if (!_app || !_app.ticker) return;
        if (_enabled) {
            if (document.visibilityState !== 'hidden') {
                _app.ticker.start();
            }
        } else {
            _app.ticker.stop();
            // Stacca tutte le aure di status prima di svuotare lo stage.
            // Necessario per liberare emitter e map interna del sotto-modulo.
            if (DS.fx.statusAura && typeof DS.fx.statusAura.detachAll === 'function') {
                DS.fx.statusAura.detachAll();
            }
            if (_app.stage) {
                _app.stage.removeChildren();
            }
        }
    }

    function dispose() {
        try {
            if (DS.fx.statusAura && typeof DS.fx.statusAura.detachAll === 'function') {
                DS.fx.statusAura.detachAll();
            }
            if (DS.fx.statusAura && typeof DS.fx.statusAura._disposeTextures === 'function') {
                DS.fx.statusAura._disposeTextures();
            }
            if (DS.fx._burstFx && typeof DS.fx._burstFx._disposeTextures === 'function') {
                DS.fx._burstFx._disposeTextures();
            }
            if (_resizeHandler) {
                window.removeEventListener('resize', _resizeHandler);
                _resizeHandler = null;
            }
            if (_visibilityHandler) {
                document.removeEventListener('visibilitychange', _visibilityHandler);
                _visibilityHandler = null;
            }
            if (_canvas && _canvas.parentNode) {
                _canvas.parentNode.removeChild(_canvas);
            }
            if (_app) {
                _app.destroy(true, { children: true, texture: true, baseTexture: true });
            }
        } catch (e) {
            console.warn('DS.fx: dispose ha incontrato un errore.', e);
        } finally {
            _app = null;
            _canvas = null;
            _initPromise = null;
        }
    }

    return {
        init: init,
        dispose: dispose,
        setEnabled: setEnabled,
        get enabled() { return _enabled; },
        get _app() { return _app; },
        get _canvas() { return _canvas; }
    };
})();

// ======================================================================
// DS.fx.statusAura - Aure persistenti per gli 8 status MVP.
//
// Pattern: ogni RuntimeEffectInstance di categoria StatusEffect (vedi
// spec-engine §X) viene rappresentato da un emitter di particelle
// agganciato a un container Pixi figlio dello stage. Il container insegue
// il DOM target (#hero-XXX | #enemy-XXX | #companion-XXX) leggendo
// getBoundingClientRect() ad ogni frame.
//
// Le texture sono procedurali (PIXI.Graphics -> renderTexture) e cached
// per status: niente PNG da preparare offline.
//
// Vedi docs/spec-pixi.md §4.2.
// ======================================================================

DS.fx.statusAura = (function () {

    // ------------------------------------------------------------------
    // Configurazione per status. Forma, tint, comportamento emitter.
    // ------------------------------------------------------------------

    // Forme procedurali. La funzione disegna su un PIXI.Graphics di 32x32
    // centrato sull'origine (-16..+16). Il caller renderizza la Graphics
    // in una texture cached.
    function drawCircle(g, color) {
        g.beginFill(color, 1);
        g.drawCircle(0, 0, 6);
        g.endFill();
    }
    function drawDrop(g, color) {
        // Goccia stilizzata: cerchio + triangolino in alto.
        g.beginFill(color, 1);
        g.drawCircle(0, 2, 5);
        g.moveTo(-3, 0);
        g.lineTo(0, -7);
        g.lineTo(3, 0);
        g.closePath();
        g.endFill();
    }
    function drawHexagon(g, color) {
        const r = 6;
        g.beginFill(color, 1);
        g.moveTo(r, 0);
        for (let i = 1; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.endFill();
    }
    function drawHalfCircle(g, color) {
        g.beginFill(color, 1);
        g.arc(0, 0, 6, Math.PI, 2 * Math.PI);
        g.lineTo(-6, 0);
        g.closePath();
        g.endFill();
    }
    function drawMoon(g, color) {
        g.beginFill(color, 1);
        g.drawCircle(0, 0, 6);
        g.endFill();
        // "morso" per dare l'aria di luna calante.
        g.beginHole();
        g.drawCircle(3, -2, 5);
        g.endHole();
    }
    function drawDiamond(g, color) {
        g.beginFill(color, 1);
        g.moveTo(0, -7);
        g.lineTo(6, 0);
        g.lineTo(0, 7);
        g.lineTo(-6, 0);
        g.closePath();
        g.endFill();
    }
    function drawStar4(g, color) {
        g.beginFill(color, 1);
        g.moveTo(0, -8);
        g.lineTo(2, -2);
        g.lineTo(8, 0);
        g.lineTo(2, 2);
        g.lineTo(0, 8);
        g.lineTo(-2, 2);
        g.lineTo(-8, 0);
        g.lineTo(-2, -2);
        g.closePath();
        g.endFill();
    }
    function drawArrowDown(g, color) {
        g.beginFill(color, 1);
        g.moveTo(-4, -6);
        g.lineTo(4, -6);
        g.lineTo(4, 2);
        g.lineTo(7, 2);
        g.lineTo(0, 8);
        g.lineTo(-7, 2);
        g.lineTo(-4, 2);
        g.closePath();
        g.endFill();
    }

    // Definizioni per status. behaviors e' la config v5 per Emitter.
    // L'ordine dei valori e' { time, value } in [0, 1] (lifetime ratio).
    function buildConfig(statusKey, texture) {
        switch (statusKey) {
            case 'Poison':
                return {
                    lifetime: { min: 0.8, max: 1.4 },
                    frequency: 0.08,
                    emitterLifetime: -1,
                    maxParticles: 25,
                    pos: { x: 0, y: 0 },
                    addAtBack: false,
                    behaviors: [
                        { type: 'alpha', config: { alpha: { list: [{ time: 0, value: 0 }, { time: 0.3, value: 0.7 }, { time: 1, value: 0 }] } } },
                        { type: 'scale', config: { scale: { list: [{ time: 0, value: 0.5 }, { time: 1, value: 1.1 }] }, minMult: 0.8 } },
                        { type: 'moveSpeedStatic', config: { min: 18, max: 28 } },
                        { type: 'rotationStatic', config: { min: 250, max: 290 } },
                        { type: 'spawnShape', config: { type: 'rect', data: { x: -18, y: 4, w: 36, h: 8 } } },
                        { type: 'textureSingle', config: { texture: texture } }
                    ]
                };
            case 'Bleed':
                return {
                    lifetime: { min: 0.6, max: 1.0 },
                    frequency: 0.18,
                    emitterLifetime: -1,
                    maxParticles: 12,
                    pos: { x: 0, y: 0 },
                    addAtBack: false,
                    behaviors: [
                        { type: 'alpha', config: { alpha: { list: [{ time: 0, value: 0.9 }, { time: 1, value: 0 }] } } },
                        { type: 'scale', config: { scale: { list: [{ time: 0, value: 0.7 }, { time: 1, value: 0.9 }] }, minMult: 0.9 } },
                        { type: 'moveSpeedStatic', config: { min: 50, max: 80 } },
                        { type: 'rotationStatic', config: { min: 85, max: 95 } },
                        { type: 'spawnShape', config: { type: 'rect', data: { x: -14, y: -2, w: 28, h: 4 } } },
                        { type: 'textureSingle', config: { texture: texture } }
                    ]
                };
            case 'Frost':
                return {
                    lifetime: { min: 1.2, max: 2.0 },
                    frequency: 0.12,
                    emitterLifetime: -1,
                    maxParticles: 18,
                    pos: { x: 0, y: 0 },
                    addAtBack: false,
                    behaviors: [
                        { type: 'alpha', config: { alpha: { list: [{ time: 0, value: 0 }, { time: 0.2, value: 0.85 }, { time: 1, value: 0 }] } } },
                        { type: 'scale', config: { scale: { list: [{ time: 0, value: 0.7 }, { time: 1, value: 1.0 }] }, minMult: 0.9 } },
                        { type: 'moveSpeedStatic', config: { min: 8, max: 14 } },
                        { type: 'rotationStatic', config: { min: 0, max: 360 } },
                        { type: 'spawnShape', config: { type: 'torus', data: { x: 0, y: 0, radius: 22, innerRadius: 16, affectRotation: false } } },
                        { type: 'textureSingle', config: { texture: texture } }
                    ]
                };
            case 'Slow':
                return {
                    lifetime: { min: 1.4, max: 2.2 },
                    frequency: 0.2,
                    emitterLifetime: -1,
                    maxParticles: 10,
                    pos: { x: 0, y: 0 },
                    addAtBack: true,
                    behaviors: [
                        { type: 'alpha', config: { alpha: { list: [{ time: 0, value: 0 }, { time: 0.3, value: 0.5 }, { time: 1, value: 0 }] } } },
                        { type: 'scale', config: { scale: { list: [{ time: 0, value: 0.8 }, { time: 1, value: 1.0 }] }, minMult: 0.9 } },
                        { type: 'moveSpeedStatic', config: { min: 4, max: 8 } },
                        { type: 'rotationStatic', config: { min: 0, max: 360 } },
                        { type: 'spawnShape', config: { type: 'torus', data: { x: 0, y: 0, radius: 24, innerRadius: 20, affectRotation: false } } },
                        { type: 'textureSingle', config: { texture: texture } }
                    ]
                };
            case 'Sleep':
                return {
                    lifetime: { min: 1.6, max: 2.4 },
                    frequency: 0.35,
                    emitterLifetime: -1,
                    maxParticles: 6,
                    pos: { x: 0, y: 0 },
                    addAtBack: false,
                    behaviors: [
                        { type: 'alpha', config: { alpha: { list: [{ time: 0, value: 0 }, { time: 0.3, value: 0.85 }, { time: 1, value: 0 }] } } },
                        { type: 'scale', config: { scale: { list: [{ time: 0, value: 0.6 }, { time: 1, value: 1.1 }] }, minMult: 0.95 } },
                        { type: 'moveSpeedStatic', config: { min: 10, max: 16 } },
                        { type: 'rotationStatic', config: { min: 260, max: 280 } },
                        { type: 'spawnShape', config: { type: 'rect', data: { x: -8, y: -8, w: 16, h: 6 } } },
                        { type: 'textureSingle', config: { texture: texture } }
                    ]
                };
            case 'Curse':
                return {
                    lifetime: { min: 1.0, max: 1.6 },
                    frequency: 0.15,
                    emitterLifetime: -1,
                    maxParticles: 14,
                    pos: { x: 0, y: 0 },
                    addAtBack: false,
                    behaviors: [
                        { type: 'alpha', config: { alpha: { list: [{ time: 0, value: 0 }, { time: 0.25, value: 0.8 }, { time: 1, value: 0 }] } } },
                        { type: 'scale', config: { scale: { list: [{ time: 0, value: 0.7 }, { time: 1, value: 1.3 }] }, minMult: 0.9 } },
                        { type: 'moveSpeedStatic', config: { min: 6, max: 12 } },
                        { type: 'rotationStatic', config: { min: 0, max: 360 } },
                        { type: 'spawnShape', config: { type: 'circle', data: { x: 0, y: 0, radius: 16 } } },
                        { type: 'textureSingle', config: { texture: texture } }
                    ]
                };
            case 'Inspiration':
                return {
                    lifetime: { min: 0.8, max: 1.3 },
                    frequency: 0.12,
                    emitterLifetime: -1,
                    maxParticles: 16,
                    pos: { x: 0, y: 0 },
                    addAtBack: false,
                    behaviors: [
                        { type: 'alpha', config: { alpha: { list: [{ time: 0, value: 0 }, { time: 0.2, value: 0.9 }, { time: 1, value: 0 }] } } },
                        { type: 'scale', config: { scale: { list: [{ time: 0, value: 0.5 }, { time: 1, value: 1.0 }] }, minMult: 0.9 } },
                        { type: 'moveSpeedStatic', config: { min: 22, max: 36 } },
                        { type: 'rotationStatic', config: { min: 260, max: 280 } },
                        { type: 'spawnShape', config: { type: 'rect', data: { x: -16, y: 0, w: 32, h: 8 } } },
                        { type: 'textureSingle', config: { texture: texture } }
                    ]
                };
            case 'Weakness':
                return {
                    lifetime: { min: 1.0, max: 1.6 },
                    frequency: 0.22,
                    emitterLifetime: -1,
                    maxParticles: 10,
                    pos: { x: 0, y: 0 },
                    addAtBack: true,
                    behaviors: [
                        { type: 'alpha', config: { alpha: { list: [{ time: 0, value: 0 }, { time: 0.3, value: 0.7 }, { time: 1, value: 0 }] } } },
                        { type: 'scale', config: { scale: { list: [{ time: 0, value: 0.7 }, { time: 1, value: 1.0 }] }, minMult: 0.9 } },
                        { type: 'moveSpeedStatic', config: { min: 18, max: 28 } },
                        { type: 'rotationStatic', config: { min: 85, max: 95 } },
                        { type: 'spawnShape', config: { type: 'rect', data: { x: -14, y: -6, w: 28, h: 4 } } },
                        { type: 'textureSingle', config: { texture: texture } }
                    ]
                };
            default:
                return null;
        }
    }

    const DRAWERS = {
        Poison: drawCircle,
        Bleed: drawDrop,
        Frost: drawHexagon,
        Slow: drawHalfCircle,
        Sleep: drawMoon,
        Curse: drawDiamond,
        Inspiration: drawStar4,
        Weakness: drawArrowDown
    };

    const TINTS = {
        Poison: 0x4ade80,
        Bleed: 0xdc2626,
        Frost: 0x60a5fa,
        Slow: 0x9ca3af,
        Sleep: 0x818cf8,
        Curse: 0xa855f7,
        Inspiration: 0xfbbf24,
        Weakness: 0x6b7280
    };

    // ------------------------------------------------------------------
    // Cache delle texture per status. Generate lazy alla prima attach.
    // ------------------------------------------------------------------

    const _textures = {};
    // _auras: Map<effectInstanceId, { stateId, container, emitter }>
    const _auras = new Map();
    let _tickerCallback = null;

    function _getTexture(statusKey) {
        if (_textures[statusKey]) return _textures[statusKey];
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        const drawer = DRAWERS[statusKey];
        const tint = TINTS[statusKey];
        if (!drawer) return null;
        try {
            const g = new PIXI.Graphics();
            drawer(g, tint);
            // Padding per evitare clipping del bordo.
            const region = new PIXI.Rectangle(-16, -16, 32, 32);
            const tex = app.renderer.generateTexture(g, {
                region: region,
                resolution: 2
            });
            g.destroy();
            _textures[statusKey] = tex;
            return tex;
        } catch (e) {
            console.warn('DS.fx.statusAura: generateTexture fallita per ' + statusKey, e);
            return null;
        }
    }

    function _disposeTextures() {
        for (const k in _textures) {
            try { _textures[k].destroy(true); } catch (e) {}
            delete _textures[k];
        }
    }

    // ------------------------------------------------------------------
    // Lookup del DOM target: i 3 namespace di id stabili.
    // ------------------------------------------------------------------

    function _lookupTarget(stateId) {
        if (!stateId) return null;
        return document.getElementById('hero-' + stateId)
            || document.getElementById('enemy-' + stateId)
            || document.getElementById('companion-' + stateId);
    }

    // ------------------------------------------------------------------
    // Ticker: posiziona ogni aura sul centro del proprio DOM target.
    // Auto-detach se il DOM e' sparito.
    // ------------------------------------------------------------------

    function _ensureTicker() {
        const app = DS.fx._app;
        if (!app || _tickerCallback) return;
        _tickerCallback = function (ticker) {
            // PIXI v7 passa il Ticker stesso o un delta numerico a seconda della
            // versione del minor. Estraiamo deltaMS in modo difensivo.
            const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                ? ticker.deltaMS
                : (app.ticker.deltaMS || 16.7);
            const deltaSec = deltaMS / 1000;

            // Iterazione sicura: si puo' modificare _auras durante l'iter
            // (auto-detach). Usiamo un array snapshot.
            const ids = Array.from(_auras.keys());
            for (const id of ids) {
                const aura = _auras.get(id);
                if (!aura) continue;
                const el = _lookupTarget(aura.stateId);
                if (!el) {
                    // DOM scomparso: l'unita' e' uscita dal campo. Detach.
                    detach(id);
                    continue;
                }
                const rect = el.getBoundingClientRect();
                aura.container.x = rect.left + rect.width / 2;
                aura.container.y = rect.top + rect.height / 2;
                try {
                    aura.emitter.update(deltaSec);
                } catch (e) {
                    // Emitter danneggiato: rimuovi.
                    detach(id);
                }
            }

            if (_auras.size === 0 && _tickerCallback) {
                app.ticker.remove(_tickerCallback);
                _tickerCallback = null;
            }
        };
        app.ticker.add(_tickerCallback);
    }

    // ------------------------------------------------------------------
    // API pubblica
    // ------------------------------------------------------------------

    function attach(stateId, effectInstanceId, statusKey) {
        if (!DS.fx.enabled) return;
        if (!effectInstanceId || _auras.has(effectInstanceId)) return;

        const app = DS.fx._app;
        if (!app || !PIXI.particles || !PIXI.particles.Emitter) return;

        const texture = _getTexture(statusKey);
        if (!texture) return; // status sconosciuto o renderer assente

        const config = buildConfig(statusKey, texture);
        if (!config) return;

        try {
            const container = new PIXI.Container();
            container.alpha = 0;
            app.stage.addChild(container);

            const emitter = new PIXI.particles.Emitter(container, config);
            emitter.emit = true;

            _auras.set(effectInstanceId, { stateId: stateId, container: container, emitter: emitter });

            // Fade-in d'ingresso (300ms a frame rate del ticker).
            let elapsed = 0;
            const fadeIn = function (ticker) {
                const dt = (ticker && typeof ticker.deltaMS === 'number')
                    ? ticker.deltaMS
                    : (app.ticker.deltaMS || 16.7);
                elapsed += dt;
                container.alpha = Math.min(1, elapsed / 300);
                if (elapsed >= 300) {
                    container.alpha = 1;
                    app.ticker.remove(fadeIn);
                }
            };
            app.ticker.add(fadeIn);

            _ensureTicker();
        } catch (e) {
            console.warn('DS.fx.statusAura: attach fallita per ' + statusKey, e);
        }
    }

    function detach(effectInstanceId) {
        const aura = _auras.get(effectInstanceId);
        if (!aura) return;
        _auras.delete(effectInstanceId);
        const app = DS.fx._app;
        try {
            // Fade-out 250ms poi destroy. Se il ticker non e' disponibile
            // distruggi subito.
            if (app && app.ticker) {
                let elapsed = 0;
                const initialAlpha = aura.container.alpha;
                const fadeOut = function (ticker) {
                    const dt = (ticker && typeof ticker.deltaMS === 'number')
                        ? ticker.deltaMS
                        : (app.ticker.deltaMS || 16.7);
                    elapsed += dt;
                    const k = Math.min(1, elapsed / 250);
                    aura.container.alpha = initialAlpha * (1 - k);
                    if (elapsed >= 250) {
                        app.ticker.remove(fadeOut);
                        try { aura.emitter.destroy(); } catch (e) {}
                        try {
                            if (aura.container.parent) aura.container.parent.removeChild(aura.container);
                            aura.container.destroy({ children: true });
                        } catch (e) {}
                    }
                };
                app.ticker.add(fadeOut);
            } else {
                try { aura.emitter.destroy(); } catch (e) {}
                try { aura.container.destroy({ children: true }); } catch (e) {}
            }
        } catch (e) {
            console.warn('DS.fx.statusAura: detach fallita.', e);
        }
    }

    function detachAll() {
        const ids = Array.from(_auras.keys());
        for (const id of ids) {
            const aura = _auras.get(id);
            _auras.delete(id);
            try { aura.emitter.destroy(); } catch (e) {}
            try {
                if (aura.container.parent) aura.container.parent.removeChild(aura.container);
                aura.container.destroy({ children: true });
            } catch (e) {}
        }
        const app = DS.fx._app;
        if (app && app.ticker && _tickerCallback) {
            app.ticker.remove(_tickerCallback);
            _tickerCallback = null;
        }
    }

    return {
        attach: attach,
        detach: detach,
        detachAll: detachAll,
        _disposeTextures: _disposeTextures,
        get count() { return _auras.size; }
    };
})();

// ======================================================================
// DS.fx.impact e DS.fx.deathBurst - Effetti one-shot al colpo e al KO.
//
// Sessione 3: ogni HpChangedMutation con delta < 0 genera un burst di
// particelle d'impatto al centro del DOM target; ogni UnitStateChanged
// (Active -> Ko) genera un burst di dissolvenza tematica ricavata dai
// Subtypes dell'unita' (kind passato in input da AnimationService).
//
// Texture procedurali, cache separata dal modulo statusAura. Vita degli
// emitter finita (emitterLifetime > 0); auto-cleanup quando particleCount
// torna a 0. Vedi docs/spec-pixi.md §4.3.
// ======================================================================

// Soglia "colpo critico" usata da AnimationService (specchio della
// costante C# CritThreshold). Tunable da console per il bilanciamento.
DS.fx.CRIT_THRESHOLD = 12;

DS.fx._burstFx = (function () {

    // ------------------------------------------------------------------
    // Texture procedurali per impact e death kinds.
    // ------------------------------------------------------------------

    function shape_shard(g, color) {
        // Rombo allungato (scheggia).
        g.beginFill(color, 1);
        g.moveTo(0, -7);
        g.lineTo(2, 0);
        g.lineTo(0, 7);
        g.lineTo(-2, 0);
        g.closePath();
        g.endFill();
    }
    function shape_circle(g, color) {
        g.beginFill(color, 1);
        g.drawCircle(0, 0, 5);
        g.endFill();
    }
    function shape_drop(g, color) {
        g.beginFill(color, 1);
        g.drawCircle(0, 2, 4);
        g.moveTo(-3, 0);
        g.lineTo(0, -6);
        g.lineTo(3, 0);
        g.closePath();
        g.endFill();
    }
    function shape_hex(g, color) {
        const r = 5;
        g.beginFill(color, 1);
        g.moveTo(r, 0);
        for (let i = 1; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.endFill();
    }
    function shape_leaf(g, color) {
        // Rombo allungato verticale (foglia stilizzata).
        g.beginFill(color, 1);
        g.moveTo(0, -7);
        g.lineTo(3, 0);
        g.lineTo(0, 7);
        g.lineTo(-3, 0);
        g.closePath();
        g.endFill();
    }
    function shape_star4(g, color) {
        g.beginFill(color, 1);
        g.moveTo(0, -7);
        g.lineTo(2, -2);
        g.lineTo(7, 0);
        g.lineTo(2, 2);
        g.lineTo(0, 7);
        g.lineTo(-2, 2);
        g.lineTo(-7, 0);
        g.lineTo(-2, -2);
        g.closePath();
        g.endFill();
    }

    // kind -> { shape, color }
    const KIND_SHAPES = {
        // impact kinds
        physical:    { draw: shape_shard,  color: 0xfde68a },
        poison:      { draw: shape_circle, color: 0x4ade80 },
        bleed:       { draw: shape_drop,   color: 0xdc2626 },
        frost:       { draw: shape_hex,    color: 0x60a5fa },
        // death kinds
        bones:       { draw: shape_shard,  color: 0xe5e7eb },
        ash:         { draw: shape_circle, color: 0x9ca3af },
        gore:        { draw: shape_drop,   color: 0x991b1b },
        leaves:      { draw: shape_leaf,   color: 0x65a30d },
        gold:        { draw: shape_star4,  color: 0xfbbf24 },
        redash:      { draw: shape_circle, color: 0xb91c1c }
    };

    const _textures = {};

    function _getTexture(kind) {
        if (_textures[kind]) return _textures[kind];
        const app = DS.fx._app;
        const spec = KIND_SHAPES[kind];
        if (!app || !app.renderer || !spec) return null;
        try {
            const g = new PIXI.Graphics();
            spec.draw(g, spec.color);
            const region = new PIXI.Rectangle(-12, -12, 24, 24);
            const tex = app.renderer.generateTexture(g, {
                region: region,
                resolution: 2
            });
            g.destroy();
            _textures[kind] = tex;
            return tex;
        } catch (e) {
            console.warn('DS.fx._burstFx: generateTexture fallita per ' + kind, e);
            return null;
        }
    }

    function _disposeTextures() {
        for (const k in _textures) {
            try { _textures[k].destroy(true); } catch (e) {}
            delete _textures[k];
        }
    }

    // ------------------------------------------------------------------
    // Lookup DOM (riusa la convenzione tri-prefisso di statusAura).
    // ------------------------------------------------------------------

    function _lookupTarget(stateId) {
        if (!stateId) return null;
        return document.getElementById('hero-' + stateId)
            || document.getElementById('enemy-' + stateId)
            || document.getElementById('companion-' + stateId);
    }

    // ------------------------------------------------------------------
    // Lancia un burst one-shot al centro del target. emitterLifetime e'
    // FINITO; quando le particelle muoiono il container viene distrutto.
    // ------------------------------------------------------------------

    function spawn(stateId, kind, configBuilder) {
        if (!DS.fx.enabled) return;
        const app = DS.fx._app;
        if (!app || !PIXI.particles || !PIXI.particles.Emitter) return;

        const target = _lookupTarget(stateId);
        if (!target) return;

        const texture = _getTexture(kind);
        if (!texture) return;

        const rect = target.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const config = configBuilder(texture);
        if (!config) return;

        try {
            const container = new PIXI.Container();
            container.x = cx;
            container.y = cy;
            app.stage.addChild(container);

            const emitter = new PIXI.particles.Emitter(container, config);
            emitter.emit = true;

            // Ticker dedicato: aggiorna l'emitter e si auto-rimuove quando
            // emitter.particleCount === 0 e l'emission e' terminata.
            const cb = function (ticker) {
                const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                    ? ticker.deltaMS
                    : (app.ticker.deltaMS || 16.7);
                try {
                    emitter.update(deltaMS / 1000);
                } catch (e) {
                    // Emitter danneggiato.
                }
                if (!emitter.emit && emitter.particleCount === 0) {
                    app.ticker.remove(cb);
                    try { emitter.destroy(); } catch (e) {}
                    try {
                        if (container.parent) container.parent.removeChild(container);
                        container.destroy({ children: true });
                    } catch (e) {}
                }
            };
            app.ticker.add(cb);
        } catch (e) {
            console.warn('DS.fx._burstFx: spawn fallita per ' + kind, e);
        }
    }

    // ------------------------------------------------------------------
    // Config emitter v5 per IMPACT (durata corta, ~0.05s).
    // ------------------------------------------------------------------

    function impactConfig(kind, isCrit, texture) {
        const scaleMax = isCrit ? 1.6 : 1.0;
        const maxParticles = isCrit ? 28 : 14;
        const emitLife = isCrit ? 0.08 : 0.05;

        // Parametri specifici per kind.
        // speed: range velocità iniziale particelle (px/s)
        // rotMin, rotMax: angolo di lancio in gradi (0 = destra, 90 = giù)
        // spawnShape: forma area di spawn
        let speed = { min: 80, max: 120 };
        let rotMin = 0, rotMax = 360; // radial di default
        let spawnShape = { type: 'circle', data: { x: 0, y: 0, radius: 6 } };

        switch (kind) {
            case 'poison':
                speed = { min: 40, max: 70 };
                rotMin = 250; rotMax = 290; // verso l'alto, leggero spread
                spawnShape = { type: 'rect', data: { x: -10, y: -2, w: 20, h: 4 } };
                break;
            case 'bleed':
                speed = { min: 100, max: 160 };
                rotMin = 0; rotMax = 360;
                spawnShape = { type: 'circle', data: { x: 0, y: 0, radius: 3 } };
                break;
            case 'frost':
                speed = { min: 40, max: 70 };
                rotMin = 0; rotMax = 360;
                spawnShape = { type: 'circle', data: { x: 0, y: 0, radius: 5 } };
                break;
            case 'physical':
            default:
                speed = { min: 80, max: 130 };
                rotMin = 0; rotMax = 360;
                spawnShape = { type: 'circle', data: { x: 0, y: 0, radius: 6 } };
                break;
        }

        return {
            lifetime: { min: 0.35, max: 0.65 },
            frequency: 0.008,
            emitterLifetime: emitLife,
            maxParticles: maxParticles,
            pos: { x: 0, y: 0 },
            addAtBack: false,
            behaviors: [
                { type: 'alpha', config: { alpha: { list: [{ time: 0, value: 1 }, { time: 1, value: 0 }] } } },
                { type: 'scale', config: { scale: { list: [{ time: 0, value: scaleMax * 0.8 }, { time: 1, value: scaleMax * 0.2 }] }, minMult: 0.9 } },
                { type: 'moveSpeed', config: { speed: { list: [{ time: 0, value: speed.max }, { time: 1, value: speed.min * 0.3 }] }, minMult: 0.9 } },
                { type: 'rotationStatic', config: { min: rotMin, max: rotMax } },
                { type: 'spawnShape', config: spawnShape },
                { type: 'textureSingle', config: { texture: texture } }
            ]
        };
    }

    // ------------------------------------------------------------------
    // Config emitter v5 per DEATH (durata media, ~0.15s, particelle vivono di più).
    // ------------------------------------------------------------------

    function deathConfig(kind, texture) {
        let speed = { min: 60, max: 110 };
        let rotMin = 0, rotMax = 360;
        let lifetime = { min: 0.8, max: 1.2 };
        let scaleEnd = 0.4;
        let acceleration = { x: 0, y: 0 };
        let maxParticles = 24;
        let emitLife = 0.15;

        switch (kind) {
            case 'bones':
                speed = { min: 60, max: 110 };
                acceleration = { x: 0, y: 80 };  // gravità leggera
                break;
            case 'ash':
                speed = { min: 25, max: 55 };
                rotMin = 250; rotMax = 290; // verso l'alto
                scaleEnd = 0.2;
                lifetime = { min: 1.0, max: 1.5 };
                break;
            case 'gore':
                speed = { min: 80, max: 140 };
                acceleration = { x: 0, y: 220 };  // gravità forte
                maxParticles = 30;
                break;
            case 'leaves':
                speed = { min: 18, max: 38 };
                acceleration = { x: 0, y: 20 };  // caduta lenta
                lifetime = { min: 1.5, max: 2.2 };
                maxParticles = 18;
                break;
            case 'gold':
                speed = { min: 50, max: 80 };
                rotMin = 250; rotMax = 290;
                lifetime = { min: 1.0, max: 1.4 };
                maxParticles = 32;
                break;
            case 'redash':
                speed = { min: 20, max: 45 };
                rotMin = 250; rotMax = 290;
                scaleEnd = 0.2;
                lifetime = { min: 1.2, max: 1.7 };
                break;
            default:
                break;
        }

        const behaviors = [
            { type: 'alpha', config: { alpha: { list: [{ time: 0, value: 1 }, { time: 0.8, value: 0.7 }, { time: 1, value: 0 }] } } },
            { type: 'scale', config: { scale: { list: [{ time: 0, value: 1 }, { time: 1, value: scaleEnd }] }, minMult: 0.9 } },
            { type: 'moveSpeed', config: { speed: { list: [{ time: 0, value: speed.max }, { time: 1, value: speed.min * 0.4 }] }, minMult: 0.9 } },
            { type: 'rotationStatic', config: { min: rotMin, max: rotMax } },
            { type: 'spawnShape', config: { type: 'circle', data: { x: 0, y: 0, radius: 8 } } },
            { type: 'textureSingle', config: { texture: texture } }
        ];
        if (acceleration.x !== 0 || acceleration.y !== 0) {
            behaviors.push({ type: 'moveAcceleration', config: { accel: acceleration, minStart: speed.min, maxStart: speed.max, rotate: true } });
        }

        return {
            lifetime: lifetime,
            frequency: 0.005,
            emitterLifetime: emitLife,
            maxParticles: maxParticles,
            pos: { x: 0, y: 0 },
            addAtBack: false,
            behaviors: behaviors
        };
    }

    return {
        impact: function (stateId, kind, isCrit) {
            const k = (kind || 'physical');
            spawn(stateId, k, function (tex) { return impactConfig(k, !!isCrit, tex); });
        },
        deathBurst: function (stateId, kind) {
            const k = (kind || 'ash');
            spawn(stateId, k, function (tex) { return deathConfig(k, tex); });
        },
        _disposeTextures: _disposeTextures
    };
})();

// Espone le funzioni one-shot al top-level di DS.fx per coerenza
// con statusAura (che vive come oggetto DS.fx.statusAura).
DS.fx.impact = DS.fx._burstFx.impact;
DS.fx.deathBurst = DS.fx._burstFx.deathBurst;

