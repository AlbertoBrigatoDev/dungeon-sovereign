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
            // Stacca aure di status e ferma le sequence di fine run
            // (libera emitter, ticker callback e ripristina lo z-index)
            // prima di svuotare lo stage.
            if (DS.fx.statusAura && typeof DS.fx.statusAura.detachAll === 'function') {
                DS.fx.statusAura.detachAll();
            }
            if (DS.fx._endSequences && typeof DS.fx._endSequences.endSequences === 'function') {
                DS.fx._endSequences.endSequences();
            }
            if (DS.fx.targeting && typeof DS.fx.targeting.clear === 'function') {
                DS.fx.targeting.clear();
            }
            if (DS.fx.cardTrail && typeof DS.fx.cardTrail.clear === 'function') {
                DS.fx.cardTrail.clear();
            }
            if (DS.fx.barrier && typeof DS.fx.barrier.clear === 'function') {
                DS.fx.barrier.clear();
            }
            if (DS.fx.room && typeof DS.fx.room.leave === 'function') {
                DS.fx.room.leave();
            }
            _app.ticker.stop();
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
            if (DS.fx._endSequences && typeof DS.fx._endSequences.endSequences === 'function') {
                DS.fx._endSequences.endSequences();
            }
            if (DS.fx._endSequences && typeof DS.fx._endSequences._disposeTextures === 'function') {
                DS.fx._endSequences._disposeTextures();
            }
            if (DS.fx.targeting && typeof DS.fx.targeting.clear === 'function') {
                DS.fx.targeting.clear();
            }
            if (DS.fx.targeting && typeof DS.fx.targeting._disposeTextures === 'function') {
                DS.fx.targeting._disposeTextures();
            }
            if (DS.fx.cardTrail && typeof DS.fx.cardTrail.clear === 'function') {
                DS.fx.cardTrail.clear();
            }
            if (DS.fx.cardTrail && typeof DS.fx.cardTrail._disposeTextures === 'function') {
                DS.fx.cardTrail._disposeTextures();
            }
            if (DS.fx.healAura && typeof DS.fx.healAura._disposeTextures === 'function') {
                DS.fx.healAura._disposeTextures();
            }
            if (DS.fx.barrier && typeof DS.fx.barrier.clear === 'function') {
                DS.fx.barrier.clear();
            }
            if (DS.fx.barrier && typeof DS.fx.barrier._disposeTextures === 'function') {
                DS.fx.barrier._disposeTextures();
            }
            if (DS.fx.aoe && typeof DS.fx.aoe._disposeTextures === 'function') {
                DS.fx.aoe._disposeTextures();
            }
            if (DS.fx.room && typeof DS.fx.room.leave === 'function') {
                DS.fx.room.leave();
            }
            if (DS.fx.room && typeof DS.fx.room._disposeTextures === 'function') {
                DS.fx.room._disposeTextures();
            }
            if (DS.fx.phaseAura && typeof DS.fx.phaseAura._disposeTextures === 'function') {
                DS.fx.phaseAura._disposeTextures();
            }
            if (DS.fx.equipImpact && typeof DS.fx.equipImpact._disposeTextures === 'function') {
                DS.fx.equipImpact._disposeTextures();
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

// ======================================================================
// DS.fx._endSequences - Sequence cinematiche di fine run.
//
// Sessione 4: all'ingresso in RunEndScreen, victorySequence() o
// defeatSequence() coprono lo schermo con un effetto a tema esito. Il
// canvas FX sale temporaneamente a z-index 70 (sopra l'overlay z-50 di
// RunEndScreen) e torna a 30 quando la sequence finisce.
//
// Una sola sequence per volta. endSequences() la interrompe e ripristina
// il canvas: usata da AnimationService all'avvio di una nuova run.
//
// Vedi docs/spec-pixi.md §4.4.
// ======================================================================

DS.fx._endSequences = (function () {

    const STAGE_Z_ACTIVE = '70';
    const STAGE_Z_IDLE = '30';

    // Stato della sequence corrente (al massimo una alla volta).
    let _active = false;
    let _root = null;        // PIXI.Container che contiene tutto
    let _emitter = null;     // emitter di particelle (scintille / cenere)
    let _tickerCb = null;

    // ------------------------------------------------------------------
    // Texture procedurali (cache locale).
    // ------------------------------------------------------------------

    const _textures = {};

    function _makeTexture(key, drawer) {
        if (_textures[key]) return _textures[key];
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        try {
            const g = new PIXI.Graphics();
            drawer(g);
            const tex = app.renderer.generateTexture(g, {
                region: new PIXI.Rectangle(-12, -12, 24, 24),
                resolution: 2
            });
            g.destroy();
            _textures[key] = tex;
            return tex;
        } catch (e) {
            console.warn('DS.fx._endSequences: generateTexture fallita per ' + key, e);
            return null;
        }
    }

    function _sparkTexture() {
        // Scintilla dorata: stella a 4 punte.
        return _makeTexture('spark', function (g) {
            g.beginFill(0xfbbf24, 1);
            g.moveTo(0, -9);
            g.lineTo(2, -2);
            g.lineTo(9, 0);
            g.lineTo(2, 2);
            g.lineTo(0, 9);
            g.lineTo(-2, 2);
            g.lineTo(-9, 0);
            g.lineTo(-2, -2);
            g.closePath();
            g.endFill();
        });
    }

    function _ashTexture() {
        // Fiocco di cenere: cerchio grigio.
        return _makeTexture('ash', function (g) {
            g.beginFill(0x6b7280, 1);
            g.drawCircle(0, 0, 5);
            g.endFill();
        });
    }

    function _disposeTextures() {
        for (const k in _textures) {
            try { _textures[k].destroy(true); } catch (e) {}
            delete _textures[k];
        }
    }

    // ------------------------------------------------------------------
    // z-index del canvas FX.
    // ------------------------------------------------------------------

    function _raiseStage() {
        if (DS.fx._canvas) DS.fx._canvas.style.zIndex = STAGE_Z_ACTIVE;
    }
    function _restoreStage() {
        if (DS.fx._canvas) DS.fx._canvas.style.zIndex = STAGE_Z_IDLE;
    }

    // ------------------------------------------------------------------
    // Bagliore dorato: cerchi concentrici (centro luminoso, sfuma fuori).
    // Generato una volta, poi scalato/pulsato dal ticker.
    // ------------------------------------------------------------------

    function _buildGlow() {
        const g = new PIXI.Graphics();
        const steps = 8;
        for (let i = steps; i >= 1; i--) {
            const r = 90 * (i / steps);
            g.beginFill(0xfde68a, 0.05);
            g.drawCircle(0, 0, r);
            g.endFill();
        }
        return g;
    }

    // ------------------------------------------------------------------
    // Vignetta rossa: rettangolo full-screen con buco sfumato a strati.
    // Ridisegnata ogni frame mentre holeRatio cambia.
    // ------------------------------------------------------------------

    function _drawVignette(g, vw, vh, holeRadius, alpha) {
        g.clear();
        const cx = vw / 2;
        const cy = vh / 2;
        const layers = 6;
        for (let i = 0; i < layers; i++) {
            // Strati con buco crescente: sovrapposti danno una sfumatura
            // a 6 gradini dal centro (trasparente) al bordo (opaco).
            g.beginFill(0x450a0a, alpha * 0.2);
            g.drawRect(0, 0, vw, vh);
            g.beginHole();
            g.drawCircle(cx, cy, holeRadius * (1 + i * 0.42));
            g.endHole();
            g.endFill();
        }
    }

    // ------------------------------------------------------------------
    // Teardown completo della sequence corrente.
    // ------------------------------------------------------------------

    function _teardown() {
        const app = DS.fx._app;
        if (app && app.ticker && _tickerCb) {
            app.ticker.remove(_tickerCb);
        }
        _tickerCb = null;
        if (_emitter) {
            try { _emitter.destroy(); } catch (e) {}
            _emitter = null;
        }
        if (_root) {
            try {
                if (_root.parent) _root.parent.removeChild(_root);
                _root.destroy({ children: true });
            } catch (e) {}
            _root = null;
        }
        _restoreStage();
        _active = false;
    }

    // ------------------------------------------------------------------
    // Avvio generico di una sequence. kind: 'victory' | 'defeat'.
    // ------------------------------------------------------------------

    function _start(kind) {
        if (!DS.fx.enabled) return;
        const app = DS.fx._app;
        if (!app || !PIXI.particles || !PIXI.particles.Emitter) return;

        // Una sola sequence per volta: la nuova rimpiazza la precedente.
        if (_active) _teardown();

        const vw = app.screen.width;
        const vh = app.screen.height;

        const texture = (kind === 'victory') ? _sparkTexture() : _ashTexture();
        if (!texture) return;

        try {
            _root = new PIXI.Container();
            app.stage.addChild(_root);

            // --- Elemento decorativo specifico per esito -----------------
            let glow = null;          // victory
            let vignette = null;      // defeat
            if (kind === 'victory') {
                glow = _buildGlow();
                glow.x = vw / 2;
                glow.y = vh * 0.26;
                glow.alpha = 0;
                _root.addChild(glow);
            } else {
                vignette = new PIXI.Graphics();
                _root.addChild(vignette);
            }

            // --- Emitter di particelle (pioggia full-width) --------------
            const emitterContainer = new PIXI.Container();
            _root.addChild(emitterContainer);
            _emitter = new PIXI.particles.Emitter(
                emitterContainer,
                _particleConfig(kind, texture, vw));
            _emitter.emit = true;

            _raiseStage();
            _active = true;

            // --- Ticker della sequence ----------------------------------
            const EMIT_MS = 3000;          // durata emissione particelle
            const diag = Math.sqrt(vw * vw + vh * vh);
            let elapsed = 0;

            _tickerCb = function (ticker) {
                const dt = (ticker && typeof ticker.deltaMS === 'number')
                    ? ticker.deltaMS
                    : (app.ticker.deltaMS || 16.7);
                elapsed += dt;

                // Aggiorna l'emitter; stoppa l'emissione dopo EMIT_MS.
                if (_emitter) {
                    if (elapsed >= EMIT_MS && _emitter.emit) {
                        _emitter.emit = false;
                    }
                    try { _emitter.update(dt / 1000); } catch (e) {}
                }

                if (kind === 'victory' && glow) {
                    // Fade-in 400ms, pulsazione di scala, fade-out finale.
                    const fadeIn = Math.min(1, elapsed / 400);
                    const fadeOut = elapsed > EMIT_MS
                        ? Math.max(0, 1 - (elapsed - EMIT_MS) / 800)
                        : 1;
                    glow.alpha = 0.22 * fadeIn * fadeOut;
                    const pulse = 0.85 + 0.2 * Math.sin(elapsed / 320);
                    glow.scale.set(pulse);
                }

                if (kind === 'defeat' && vignette) {
                    // Stringe (1.5s) -> tiene (1s) -> fade-out (0.6s).
                    let holeRatio;
                    if (elapsed < 1500) {
                        const k = elapsed / 1500;
                        holeRatio = 0.70 - 0.28 * k;
                    } else {
                        holeRatio = 0.42;
                    }
                    let vigAlpha = 1;
                    const holdEnd = 1500 + 1000;
                    if (elapsed > holdEnd) {
                        vigAlpha = Math.max(0, 1 - (elapsed - holdEnd) / 600);
                    }
                    _drawVignette(vignette, vw, vh, diag * holeRatio, vigAlpha);
                }

                // Fine sequence: emissione conclusa e particelle esaurite.
                const particlesGone = !_emitter || (!_emitter.emit && _emitter.particleCount === 0);
                const decorDone = (kind === 'victory')
                    ? elapsed > EMIT_MS + 800
                    : elapsed > 1500 + 1000 + 600;
                if (particlesGone && decorDone) {
                    _teardown();
                }
            };
            app.ticker.add(_tickerCb);
        } catch (e) {
            console.warn('DS.fx._endSequences: avvio sequence fallito (' + kind + ').', e);
            _teardown();
        }
    }

    // ------------------------------------------------------------------
    // Config emitter v5 per la pioggia full-width (scintille / cenere).
    // ------------------------------------------------------------------

    function _particleConfig(kind, texture, vw) {
        const isVictory = (kind === 'victory');
        return {
            lifetime: isVictory ? { min: 1.6, max: 2.8 } : { min: 2.2, max: 3.6 },
            frequency: isVictory ? 0.03 : 0.05,
            emitterLifetime: -1, // gestito a mano: emit = false dopo EMIT_MS
            maxParticles: 120,
            pos: { x: 0, y: -20 },
            addAtBack: false,
            behaviors: [
                { type: 'alpha', config: { alpha: { list: [
                    { time: 0, value: 0 },
                    { time: 0.15, value: isVictory ? 0.95 : 0.7 },
                    { time: 0.85, value: isVictory ? 0.9 : 0.6 },
                    { time: 1, value: 0 }
                ] } } },
                { type: 'scale', config: { scale: { list: [
                    { time: 0, value: isVictory ? 0.7 : 0.9 },
                    { time: 1, value: isVictory ? 0.4 : 0.6 }
                ] }, minMult: 0.7 } },
                { type: 'moveSpeed', config: { speed: { list: [
                    { time: 0, value: isVictory ? 110 : 55 },
                    { time: 1, value: isVictory ? 60 : 25 }
                ] }, minMult: 0.7 } },
                { type: 'rotationStatic', config: { min: isVictory ? 70 : 80, max: isVictory ? 110 : 100 } },
                { type: 'rotation', config: { accel: 0, minSpeed: isVictory ? 40 : 10, maxSpeed: isVictory ? 120 : 30, minStart: 0, maxStart: 360 } },
                { type: 'spawnShape', config: { type: 'rect', data: { x: 0, y: 0, w: vw, h: 8 } } },
                { type: 'textureSingle', config: { texture: texture } }
            ]
        };
    }

    return {
        victorySequence: function () { _start('victory'); },
        defeatSequence: function () { _start('defeat'); },
        endSequences: function () {
            if (_active) {
                _teardown();
            } else {
                // Salvaguardia: ripristina comunque lo z-index del canvas.
                _restoreStage();
            }
        },
        _disposeTextures: _disposeTextures
    };
})();

DS.fx.victorySequence = DS.fx._endSequences.victorySequence;
DS.fx.defeatSequence = DS.fx._endSequences.defeatSequence;
DS.fx.endSequences = DS.fx._endSequences.endSequences;

// ======================================================================
// DS.fx.targeting - Outline dei bersagli validi e corona dell'unita attiva.
//
// Sessione 5: a differenza degli altri moduli (guidati dalle Mutation),
// questo e' pilotato direttamente da GameSession.razor, perche' la
// selezione bersaglio e' stato UI locale, non una Mutation.
//
//   setTargetables(stateIds) - cornice azzurra pulsante sui bersagli
//                              validi (diff incrementale).
//   setActiveUnit(stateId, isAlly) - corona di particelle attorno
//                              all'unita di turno (oro = alleato,
//                              rosso = nemico).
//   clear() - rimuove tutto.
//
// Outline e corona inseguono il bounding rect del DOM target, come le
// aure di status (Sess. 2). Vedi docs/spec-pixi.md §4.5.
// ======================================================================

DS.fx.targeting = (function () {

    const OUTLINE_COLOR = 0x60a5fa; // accent azzurro
    const ALLY_COLOR = 0xfbbf24;    // oro
    const ENEMY_COLOR = 0xdc2626;   // rosso

    // _outlines: Map<stateId, { graphics }>
    const _outlines = new Map();
    // _active: { stateId, ally, container, emitter } | null
    let _active = null;
    let _tickerCb = null;
    let _elapsed = 0;
    let _coronaTexture = null;

    function _lookupTarget(stateId) {
        if (!stateId) return null;
        return document.getElementById('hero-' + stateId)
            || document.getElementById('enemy-' + stateId)
            || document.getElementById('companion-' + stateId);
    }

    function _getCoronaTexture() {
        if (_coronaTexture) return _coronaTexture;
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        try {
            const g = new PIXI.Graphics();
            g.beginFill(0xffffff, 1);
            g.drawCircle(0, 0, 4);
            g.endFill();
            _coronaTexture = app.renderer.generateTexture(g, {
                region: new PIXI.Rectangle(-8, -8, 16, 16),
                resolution: 2
            });
            g.destroy();
            return _coronaTexture;
        } catch (e) {
            console.warn('DS.fx.targeting: generateTexture corona fallita.', e);
            return null;
        }
    }

    function _disposeTextures() {
        if (_coronaTexture) {
            try { _coronaTexture.destroy(true); } catch (e) {}
            _coronaTexture = null;
        }
    }

    // ------------------------------------------------------------------
    // Config emitter v5 della corona: scintillio sull'anello attorno
    // alla card. Il container viene scalato a runtime sulla card.
    // ------------------------------------------------------------------

    function _coronaConfig(texture, tint) {
        return {
            lifetime: { min: 0.6, max: 1.2 },
            frequency: 0.045,
            emitterLifetime: -1,
            maxParticles: 40,
            pos: { x: 0, y: 0 },
            addAtBack: false,
            behaviors: [
                { type: 'alpha', config: { alpha: { list: [
                    { time: 0, value: 0 },
                    { time: 0.35, value: 0.9 },
                    { time: 1, value: 0 }
                ] } } },
                { type: 'scale', config: { scale: { list: [
                    { time: 0, value: 0.6 },
                    { time: 1, value: 1.0 }
                ] }, minMult: 0.7 } },
                { type: 'color', config: { color: { list: [
                    { time: 0, value: _hex(tint) },
                    { time: 1, value: _hex(tint) }
                ] } } },
                { type: 'moveSpeedStatic', config: { min: 6, max: 16 } },
                { type: 'rotationStatic', config: { min: 0, max: 360 } },
                { type: 'spawnShape', config: { type: 'torus', data: { x: 0, y: 0, radius: 60, innerRadius: 52, affectRotation: false } } },
                { type: 'textureSingle', config: { texture: texture } }
            ]
        };
    }

    // particle-emitter v5 vuole il colore come stringa hex senza '#'.
    function _hex(num) {
        return num.toString(16).padStart(6, '0');
    }

    // ------------------------------------------------------------------
    // Ticker condiviso: insegue il DOM di outline e corona.
    // ------------------------------------------------------------------

    function _ensureTicker() {
        const app = DS.fx._app;
        if (!app || _tickerCb) return;
        _tickerCb = function (ticker) {
            const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                ? ticker.deltaMS
                : (app.ticker.deltaMS || 16.7);
            _elapsed += deltaMS;
            const pulse = 0.55 + 0.45 * Math.sin(_elapsed / 260);

            // --- Outline dei bersagli -----------------------------------
            const ids = Array.from(_outlines.keys());
            for (const id of ids) {
                const entry = _outlines.get(id);
                if (!entry) continue;
                const el = _lookupTarget(id);
                if (!el) {
                    _removeOutline(id);
                    continue;
                }
                const rect = el.getBoundingClientRect();
                const g = entry.graphics;
                const pad = 5;
                g.clear();
                g.lineStyle(2 + 2 * pulse, OUTLINE_COLOR, 0.45 + 0.55 * pulse);
                g.drawRoundedRect(
                    rect.left - pad,
                    rect.top - pad,
                    rect.width + pad * 2,
                    rect.height + pad * 2,
                    10);
            }

            // --- Corona dell'unita attiva -------------------------------
            if (_active) {
                const el = _lookupTarget(_active.stateId);
                if (!el) {
                    _clearActive();
                } else {
                    const rect = el.getBoundingClientRect();
                    _active.container.x = rect.left + rect.width / 2;
                    _active.container.y = rect.top + rect.height / 2;
                    // Adatta l'anello (raggio base 60) alla card, con cap.
                    const sx = Math.min(2.4, Math.max(0.7, (rect.width / 2) / 60));
                    const sy = Math.min(2.4, Math.max(0.7, (rect.height / 2) / 60));
                    _active.container.scale.set(sx, sy);
                    try { _active.emitter.update(deltaMS / 1000); } catch (e) {}
                }
            }

            if (_outlines.size === 0 && !_active && _tickerCb) {
                app.ticker.remove(_tickerCb);
                _tickerCb = null;
            }
        };
        app.ticker.add(_tickerCb);
    }

    // ------------------------------------------------------------------
    // Outline: create / remove
    // ------------------------------------------------------------------

    function _createOutline(stateId) {
        const app = DS.fx._app;
        if (!app) return;
        try {
            const g = new PIXI.Graphics();
            app.stage.addChild(g);
            _outlines.set(stateId, { graphics: g });
        } catch (e) {
            console.warn('DS.fx.targeting: createOutline fallita per ' + stateId, e);
        }
    }

    function _removeOutline(stateId) {
        const entry = _outlines.get(stateId);
        if (!entry) return;
        _outlines.delete(stateId);
        try {
            if (entry.graphics.parent) entry.graphics.parent.removeChild(entry.graphics);
            entry.graphics.destroy();
        } catch (e) {}
    }

    function _clearActive() {
        if (!_active) return;
        try { _active.emitter.destroy(); } catch (e) {}
        try {
            if (_active.container.parent) _active.container.parent.removeChild(_active.container);
            _active.container.destroy({ children: true });
        } catch (e) {}
        _active = null;
    }

    // ------------------------------------------------------------------
    // API pubblica
    // ------------------------------------------------------------------

    function setTargetables(stateIds) {
        const app = DS.fx._app;
        if (!app) return;
        if (!DS.fx.enabled) { clear(); return; }

        const wanted = new Set(stateIds || []);

        // Rimuovi gli outline non piu' validi.
        for (const id of Array.from(_outlines.keys())) {
            if (!wanted.has(id)) _removeOutline(id);
        }
        // Aggiungi i nuovi.
        for (const id of wanted) {
            if (!_outlines.has(id)) _createOutline(id);
        }
        if (_outlines.size > 0) _ensureTicker();
    }

    function setActiveUnit(stateId, isAlly) {
        const app = DS.fx._app;
        if (!app) return;
        if (!DS.fx.enabled || !stateId) { _clearActive(); return; }
        if (!PIXI.particles || !PIXI.particles.Emitter) return;

        // Gia' attiva sulla stessa unita con lo stesso schieramento.
        if (_active && _active.stateId === stateId && _active.ally === !!isAlly) return;

        _clearActive();

        const texture = _getCoronaTexture();
        if (!texture) return;

        try {
            const container = new PIXI.Container();
            app.stage.addChild(container);
            const tint = isAlly ? ALLY_COLOR : ENEMY_COLOR;
            const emitter = new PIXI.particles.Emitter(container, _coronaConfig(texture, tint));
            emitter.emit = true;
            _active = { stateId: stateId, ally: !!isAlly, container: container, emitter: emitter };
            _ensureTicker();
        } catch (e) {
            console.warn('DS.fx.targeting: setActiveUnit fallita per ' + stateId, e);
        }
    }

    function clear() {
        for (const id of Array.from(_outlines.keys())) _removeOutline(id);
        _clearActive();
        const app = DS.fx._app;
        if (app && app.ticker && _tickerCb) {
            app.ticker.remove(_tickerCb);
            _tickerCb = null;
        }
    }

    return {
        setTargetables: setTargetables,
        setActiveUnit: setActiveUnit,
        clear: clear,
        _disposeTextures: _disposeTextures,
        get outlineCount() { return _outlines.size; },
        get hasActive() { return _active !== null; }
    };
})();

// ======================================================================
// DS.fx.cardTrail - Scia di particelle dietro la carta in volo.
//
// Sessione 6: pilotato da DS.cardFlight (animations.js). L'emitter resta
// fermo (container a 0,0); cio' che si muove e' la spawnPos, cosi' le
// particelle nascono lungo la traiettoria e restano indietro = scia.
//
//   start(typeKey) - avvia l'emissione; il colore dipende dal tipo carta.
//   move(x, y)     - sposta il punto di emissione.
//   stop()         - ferma l'emissione; auto-cleanup a particelle esaurite.
//
// Vedi docs/spec-pixi.md §4.6.
// ======================================================================

DS.fx.cardTrail = (function () {

    // Colore della scia per tipo di carta.
    const TYPE_TINT = {
        action: 0x60a5fa,      // blu
        equip: 0xfbbf24,       // oro
        companion: 0x4ade80,   // verde
        consumable: 0xa855f7   // viola
    };

    let _container = null;
    let _emitter = null;
    let _tickerCb = null;
    let _texture = null;

    function _getTexture() {
        if (_texture) return _texture;
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        try {
            const g = new PIXI.Graphics();
            g.beginFill(0xffffff, 1);
            g.drawCircle(0, 0, 4);
            g.endFill();
            _texture = app.renderer.generateTexture(g, {
                region: new PIXI.Rectangle(-8, -8, 16, 16),
                resolution: 2
            });
            g.destroy();
            return _texture;
        } catch (e) {
            console.warn('DS.fx.cardTrail: generateTexture fallita.', e);
            return null;
        }
    }

    function _disposeTextures() {
        if (_texture) {
            try { _texture.destroy(true); } catch (e) {}
            _texture = null;
        }
    }

    function _hex(num) {
        return num.toString(16).padStart(6, '0');
    }

    function _config(texture, tint) {
        return {
            lifetime: { min: 0.35, max: 0.7 },
            frequency: 0.012,
            emitterLifetime: -1,
            maxParticles: 50,
            pos: { x: 0, y: 0 },
            addAtBack: false,
            behaviors: [
                { type: 'alpha', config: { alpha: { list: [
                    { time: 0, value: 0.85 },
                    { time: 1, value: 0 }
                ] } } },
                { type: 'scale', config: { scale: { list: [
                    { time: 0, value: 0.9 },
                    { time: 1, value: 0.25 }
                ] }, minMult: 0.7 } },
                { type: 'color', config: { color: { list: [
                    { time: 0, value: _hex(tint) },
                    { time: 1, value: _hex(tint) }
                ] } } },
                { type: 'moveSpeedStatic', config: { min: 6, max: 22 } },
                { type: 'rotationStatic', config: { min: 0, max: 360 } },
                { type: 'spawnShape', config: { type: 'circle', data: { x: 0, y: 0, radius: 6 } } },
                { type: 'textureSingle', config: { texture: texture } }
            ]
        };
    }

    function _teardown() {
        const app = DS.fx._app;
        if (app && app.ticker && _tickerCb) {
            app.ticker.remove(_tickerCb);
        }
        _tickerCb = null;
        if (_emitter) {
            try { _emitter.destroy(); } catch (e) {}
            _emitter = null;
        }
        if (_container) {
            try {
                if (_container.parent) _container.parent.removeChild(_container);
                _container.destroy({ children: true });
            } catch (e) {}
            _container = null;
        }
    }

    function start(typeKey) {
        if (!DS.fx.enabled) return;
        const app = DS.fx._app;
        if (!app || !PIXI.particles || !PIXI.particles.Emitter) return;

        // Un solo trail per volta: il nuovo rimpiazza il precedente.
        _teardown();

        const texture = _getTexture();
        if (!texture) return;
        const tint = TYPE_TINT[typeKey] || TYPE_TINT.action;

        try {
            _container = new PIXI.Container();
            app.stage.addChild(_container);
            _emitter = new PIXI.particles.Emitter(_container, _config(texture, tint));
            _emitter.emit = true;

            _tickerCb = function (ticker) {
                const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                    ? ticker.deltaMS
                    : (app.ticker.deltaMS || 16.7);
                if (_emitter) {
                    try { _emitter.update(deltaMS / 1000); } catch (e) {}
                    if (!_emitter.emit && _emitter.particleCount === 0) {
                        _teardown();
                    }
                }
            };
            app.ticker.add(_tickerCb);
        } catch (e) {
            console.warn('DS.fx.cardTrail: start fallita.', e);
            _teardown();
        }
    }

    function move(x, y) {
        if (!_emitter) return;
        try { _emitter.updateSpawnPos(x, y); } catch (e) {}
    }

    function stop() {
        if (_emitter) _emitter.emit = false;
    }

    return {
        start: start,
        move: move,
        stop: stop,
        clear: _teardown,
        _disposeTextures: _disposeTextures
    };
})();

// ======================================================================
// DS.fx.healAura - Burst verde ascendente sull'unita curata.
//
// Sessione 6: effetto one-shot, trigger HpChangedMutation con delta > 0.
// Riusa lo schema dei burst (emitter a vita finita + auto-cleanup).
// ======================================================================

DS.fx.healAura = (function () {

    let _texture = null;

    function _getTexture() {
        if (_texture) return _texture;
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        try {
            const g = new PIXI.Graphics();
            g.beginFill(0x4ade80, 1);
            g.drawCircle(0, 0, 5);
            g.endFill();
            _texture = app.renderer.generateTexture(g, {
                region: new PIXI.Rectangle(-8, -8, 16, 16),
                resolution: 2
            });
            g.destroy();
            return _texture;
        } catch (e) {
            console.warn('DS.fx.healAura: generateTexture fallita.', e);
            return null;
        }
    }

    function _disposeTextures() {
        if (_texture) {
            try { _texture.destroy(true); } catch (e) {}
            _texture = null;
        }
    }

    function _lookupTarget(stateId) {
        if (!stateId) return null;
        return document.getElementById('hero-' + stateId)
            || document.getElementById('enemy-' + stateId)
            || document.getElementById('companion-' + stateId);
    }

    function play(stateId) {
        if (!DS.fx.enabled) return;
        const app = DS.fx._app;
        if (!app || !PIXI.particles || !PIXI.particles.Emitter) return;

        const el = _lookupTarget(stateId);
        if (!el) return;
        const texture = _getTexture();
        if (!texture) return;

        const rect = el.getBoundingClientRect();

        try {
            const container = new PIXI.Container();
            container.x = rect.left + rect.width / 2;
            container.y = rect.top + rect.height / 2;
            app.stage.addChild(container);

            const emitter = new PIXI.particles.Emitter(container, {
                lifetime: { min: 0.7, max: 1.2 },
                frequency: 0.02,
                emitterLifetime: 0.35,
                maxParticles: 28,
                pos: { x: 0, y: 0 },
                addAtBack: false,
                behaviors: [
                    { type: 'alpha', config: { alpha: { list: [
                        { time: 0, value: 0 },
                        { time: 0.25, value: 0.9 },
                        { time: 1, value: 0 }
                    ] } } },
                    { type: 'scale', config: { scale: { list: [
                        { time: 0, value: 0.5 },
                        { time: 1, value: 1.0 }
                    ] }, minMult: 0.8 } },
                    { type: 'moveSpeed', config: { speed: { list: [
                        { time: 0, value: 55 },
                        { time: 1, value: 20 }
                    ] }, minMult: 0.7 } },
                    { type: 'rotationStatic', config: { min: 255, max: 285 } },
                    { type: 'spawnShape', config: { type: 'rect', data: { x: -rect.width / 3, y: rect.height / 4, w: rect.width * 2 / 3, h: rect.height / 3 } } },
                    { type: 'textureSingle', config: { texture: texture } }
                ]
            });
            emitter.emit = true;

            const cb = function (ticker) {
                const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                    ? ticker.deltaMS
                    : (app.ticker.deltaMS || 16.7);
                try { emitter.update(deltaMS / 1000); } catch (e) {}
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
            console.warn('DS.fx.healAura: play fallita.', e);
        }
    }

    // Esposto come funzione chiamabile + _disposeTextures per il cleanup.
    play._disposeTextures = _disposeTextures;
    return play;
})();

// ======================================================================
// DS.fx.barrier - Scudo di Barriera persistente e frantumazione.
//
// Sessione 7: la keyword Barrier e' un RuntimeEffectInstance di categoria
// KeywordGrant. Questo modulo, indicizzato per effectInstanceId (come
// statusAura), disegna una cornice esagonale azzurra attorno alla card
// protetta:
//
//   attach(effectInstanceId, stateId, amount) - crea lo scudo.
//   update(effectInstanceId, amount)          - assorbimento: flash +
//                                               crepa, intensita' ridotta.
//   shatter(effectInstanceId)                 - esaurimento: frantumazione.
//   clear()                                   - rimuove tutti gli scudi.
//
// Il dispatch su RuntimeEffectRemovedMutation chiama sia statusAura.detach
// sia barrier.shatter: entrambi idempotenti, agisce solo il modulo che
// possiede l'id. Vedi docs/spec-pixi.md §4.7.
// ======================================================================

DS.fx.barrier = (function () {

    const SHIELD_COLOR = 0x60a5fa; // accent azzurro

    // _barriers: Map<effectInstanceId, {
    //   stateId, container, hex, amountInitial, amountCurrent,
    //   cracks: [{ ox, oy, ix, iy }], flashUntil, elapsed }>
    const _barriers = new Map();
    let _tickerCb = null;
    let _shardTexture = null;

    function _lookupTarget(stateId) {
        if (!stateId) return null;
        return document.getElementById('hero-' + stateId)
            || document.getElementById('enemy-' + stateId)
            || document.getElementById('companion-' + stateId);
    }

    function _getShardTexture() {
        if (_shardTexture) return _shardTexture;
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        try {
            const g = new PIXI.Graphics();
            g.beginFill(0xffffff, 1);
            g.moveTo(0, -6);
            g.lineTo(2, 0);
            g.lineTo(0, 6);
            g.lineTo(-2, 0);
            g.closePath();
            g.endFill();
            _shardTexture = app.renderer.generateTexture(g, {
                region: new PIXI.Rectangle(-8, -8, 16, 16),
                resolution: 2
            });
            g.destroy();
            return _shardTexture;
        } catch (e) {
            console.warn('DS.fx.barrier: generateTexture fallita.', e);
            return null;
        }
    }

    function _disposeTextures() {
        if (_shardTexture) {
            try { _shardTexture.destroy(true); } catch (e) {}
            _shardTexture = null;
        }
    }

    // Vertici di un esagono "verticale" di semiassi rx, ry.
    function _hexPoints(rx, ry) {
        // top, top-right, bottom-right, bottom, bottom-left, top-left
        return [
            { x: 0, y: -ry },
            { x: rx, y: -ry * 0.5 },
            { x: rx, y: ry * 0.5 },
            { x: 0, y: ry },
            { x: -rx, y: ry * 0.5 },
            { x: -rx, y: -ry * 0.5 }
        ];
    }

    // ------------------------------------------------------------------
    // Ridisegna la cornice esagonale + le crepe di una barriera.
    // ------------------------------------------------------------------

    function _redraw(b, rect, pulse, flash) {
        const g = b.hex;
        const rx = rect.width / 2 + 8;
        const ry = rect.height / 2 + 8;
        const ratio = b.amountInitial > 0
            ? Math.max(0.15, b.amountCurrent / b.amountInitial)
            : 0.5;
        const baseAlpha = (0.35 + 0.4 * ratio) * (0.7 + 0.3 * pulse) + flash * 0.6;
        const lineW = 2 + 1.5 * ratio + flash * 2;

        g.clear();
        const pts = _hexPoints(rx, ry);
        g.lineStyle(lineW, SHIELD_COLOR, Math.min(1, baseAlpha));
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        // Riempimento tenue.
        g.beginFill(SHIELD_COLOR, 0.06 * ratio + flash * 0.15);
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        g.endFill();

        // Crepe: linee dal bordo verso l'interno.
        g.lineStyle(1.5, SHIELD_COLOR, Math.min(1, 0.5 + flash));
        for (const c of b.cracks) {
            g.moveTo(c.ox * rx, c.oy * ry);
            g.lineTo(c.ix * rx, c.iy * ry);
        }
    }

    // ------------------------------------------------------------------
    // Ticker condiviso.
    // ------------------------------------------------------------------

    function _ensureTicker() {
        const app = DS.fx._app;
        if (!app || _tickerCb) return;
        _tickerCb = function (ticker) {
            const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                ? ticker.deltaMS
                : (app.ticker.deltaMS || 16.7);
            const ids = Array.from(_barriers.keys());
            for (const id of ids) {
                const b = _barriers.get(id);
                if (!b) continue;
                const el = _lookupTarget(b.stateId);
                if (!el) {
                    _remove(id);
                    continue;
                }
                b.elapsed += deltaMS;
                const rect = el.getBoundingClientRect();
                b.container.x = rect.left + rect.width / 2;
                b.container.y = rect.top + rect.height / 2;
                // Rotazione lenta.
                b.container.rotation = Math.sin(b.elapsed / 1400) * 0.06;
                const pulse = 0.5 + 0.5 * Math.sin(b.elapsed / 480);
                const flash = b.flashUntil > b.elapsed
                    ? (b.flashUntil - b.elapsed) / 220
                    : 0;
                _redraw(b, rect, pulse, Math.max(0, Math.min(1, flash)));
            }
            if (_barriers.size === 0 && _tickerCb) {
                app.ticker.remove(_tickerCb);
                _tickerCb = null;
            }
        };
        app.ticker.add(_tickerCb);
    }

    function _remove(effectInstanceId) {
        const b = _barriers.get(effectInstanceId);
        if (!b) return;
        _barriers.delete(effectInstanceId);
        try {
            if (b.container.parent) b.container.parent.removeChild(b.container);
            b.container.destroy({ children: true });
        } catch (e) {}
    }

    // Aggiunge una crepa pseudo-casuale (vettore bordo -> interno).
    function _addCrack(b) {
        const ang = Math.random() * Math.PI * 2;
        const ox = Math.cos(ang);
        const oy = Math.sin(ang);
        const depth = 0.35 + Math.random() * 0.4;
        b.cracks.push({ ox: ox, oy: oy, ix: ox * (1 - depth), iy: oy * (1 - depth) });
        if (b.cracks.length > 8) b.cracks.shift();
    }

    // ------------------------------------------------------------------
    // API pubblica
    // ------------------------------------------------------------------

    function attach(effectInstanceId, stateId, amount) {
        if (!DS.fx.enabled) return;
        if (!effectInstanceId || _barriers.has(effectInstanceId)) return;
        const app = DS.fx._app;
        if (!app) return;
        try {
            const container = new PIXI.Container();
            const hex = new PIXI.Graphics();
            container.addChild(hex);
            app.stage.addChild(container);
            const amt = Math.max(1, amount || 1);
            _barriers.set(effectInstanceId, {
                stateId: stateId,
                container: container,
                hex: hex,
                amountInitial: amt,
                amountCurrent: amt,
                cracks: [],
                flashUntil: 0,
                elapsed: 0
            });
            _ensureTicker();
        } catch (e) {
            console.warn('DS.fx.barrier: attach fallita per ' + effectInstanceId, e);
        }
    }

    function update(effectInstanceId, amount) {
        const b = _barriers.get(effectInstanceId);
        if (!b) return;
        b.amountCurrent = Math.max(0, amount || 0);
        b.flashUntil = b.elapsed + 220;
        _addCrack(b);
    }

    function shatter(effectInstanceId) {
        const b = _barriers.get(effectInstanceId);
        if (!b) return;
        const app = DS.fx._app;
        const cx = b.container.x;
        const cy = b.container.y;
        _remove(effectInstanceId);

        // Burst di schegge azzurre nel punto dove stava lo scudo.
        if (!app || !PIXI.particles || !PIXI.particles.Emitter) return;
        const texture = _getShardTexture();
        if (!texture) return;
        try {
            const container = new PIXI.Container();
            container.x = cx;
            container.y = cy;
            app.stage.addChild(container);
            const emitter = new PIXI.particles.Emitter(container, {
                lifetime: { min: 0.5, max: 0.9 },
                frequency: 0.004,
                emitterLifetime: 0.12,
                maxParticles: 26,
                pos: { x: 0, y: 0 },
                addAtBack: false,
                behaviors: [
                    { type: 'alpha', config: { alpha: { list: [
                        { time: 0, value: 0.95 }, { time: 1, value: 0 }
                    ] } } },
                    { type: 'scale', config: { scale: { list: [
                        { time: 0, value: 1.0 }, { time: 1, value: 0.4 }
                    ] }, minMult: 0.8 } },
                    { type: 'color', config: { color: { list: [
                        { time: 0, value: '60a5fa' }, { time: 1, value: '60a5fa' }
                    ] } } },
                    { type: 'moveSpeed', config: { speed: { list: [
                        { time: 0, value: 150 }, { time: 1, value: 40 }
                    ] }, minMult: 0.8 } },
                    { type: 'rotationStatic', config: { min: 0, max: 360 } },
                    { type: 'spawnShape', config: { type: 'circle', data: { x: 0, y: 0, radius: 14 } } },
                    { type: 'textureSingle', config: { texture: texture } }
                ]
            });
            emitter.emit = true;
            const cb = function (ticker) {
                const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                    ? ticker.deltaMS
                    : (app.ticker.deltaMS || 16.7);
                try { emitter.update(deltaMS / 1000); } catch (e) {}
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
            console.warn('DS.fx.barrier: shatter burst fallito.', e);
        }
    }

    function clear() {
        for (const id of Array.from(_barriers.keys())) _remove(id);
        const app = DS.fx._app;
        if (app && app.ticker && _tickerCb) {
            app.ticker.remove(_tickerCb);
            _tickerCb = null;
        }
    }

    return {
        attach: attach,
        update: update,
        shatter: shatter,
        clear: clear,
        _disposeTextures: _disposeTextures,
        get count() { return _barriers.size; }
    };
})();

// ======================================================================
// DS.fx.aoe - Onde e nuvole per le azioni multi-bersaglio.
//
// Sessione 8: una azione che tocca >=2 unita distinte produce un'onda
// globale che parte dall'attaccante e copre l'area dei bersagli. E'
// additiva agli impatti individuali (Sess. 3) e alle aure (Sess. 2).
//
//   aoe(kind, originStateId, targetStateIds)
//     kind: 'sweep' (onda neutra) | 'poisonCloud' (verde) | 'frostBurst' (azzurro)
//
// Effetto one-shot con auto-cleanup. Vedi docs/spec-pixi.md §4.8.
// ======================================================================

DS.fx.aoe = (function () {

    const KIND_TINT = {
        sweep: 0xfde68a,
        poisonCloud: 0x4ade80,
        frostBurst: 0x60a5fa
    };

    let _texture = null;

    function _lookupTarget(stateId) {
        if (!stateId) return null;
        return document.getElementById('hero-' + stateId)
            || document.getElementById('enemy-' + stateId)
            || document.getElementById('companion-' + stateId);
    }

    function _getTexture() {
        if (_texture) return _texture;
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        try {
            const g = new PIXI.Graphics();
            g.beginFill(0xffffff, 1);
            g.drawCircle(0, 0, 6);
            g.endFill();
            _texture = app.renderer.generateTexture(g, {
                region: new PIXI.Rectangle(-8, -8, 16, 16),
                resolution: 2
            });
            g.destroy();
            return _texture;
        } catch (e) {
            console.warn('DS.fx.aoe: generateTexture fallita.', e);
            return null;
        }
    }

    function _disposeTextures() {
        if (_texture) {
            try { _texture.destroy(true); } catch (e) {}
            _texture = null;
        }
    }

    function _hex(num) {
        return num.toString(16).padStart(6, '0');
    }

    // Bounding box che racchiude un insieme di elementi DOM.
    function _boundsOf(stateIds) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let found = false;
        for (const id of stateIds) {
            const el = _lookupTarget(id);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            found = true;
            if (r.left < minX) minX = r.left;
            if (r.top < minY) minY = r.top;
            if (r.right > maxX) maxX = r.right;
            if (r.bottom > maxY) maxY = r.bottom;
        }
        if (!found) return null;
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY,
                 cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
                 w: maxX - minX, h: maxY - minY };
    }

    // Config emitter v5 per la nuvola (poisonCloud / frostBurst).
    function _cloudConfig(texture, tint, box) {
        return {
            lifetime: { min: 0.7, max: 1.2 },
            frequency: 0.012,
            emitterLifetime: 0.4,
            maxParticles: 150,
            pos: { x: 0, y: 0 },
            addAtBack: false,
            behaviors: [
                { type: 'alpha', config: { alpha: { list: [
                    { time: 0, value: 0 },
                    { time: 0.3, value: 0.8 },
                    { time: 1, value: 0 }
                ] } } },
                { type: 'scale', config: { scale: { list: [
                    { time: 0, value: 0.6 },
                    { time: 1, value: 1.4 }
                ] }, minMult: 0.7 } },
                { type: 'color', config: { color: { list: [
                    { time: 0, value: _hex(tint) },
                    { time: 1, value: _hex(tint) }
                ] } } },
                { type: 'moveSpeedStatic', config: { min: 8, max: 28 } },
                { type: 'rotationStatic', config: { min: 0, max: 360 } },
                { type: 'spawnShape', config: { type: 'rect', data: {
                    x: -box.w / 2 - 20, y: -box.h / 2 - 20,
                    w: box.w + 40, h: box.h + 40 } } },
                { type: 'textureSingle', config: { texture: texture } }
            ]
        };
    }

    function play(kind, originStateId, targetStateIds) {
        if (!DS.fx.enabled) return;
        const app = DS.fx._app;
        if (!app) return;
        const k = KIND_TINT[kind] ? kind : 'sweep';
        const tint = KIND_TINT[k];

        const box = _boundsOf(targetStateIds || []);
        if (!box) return;

        // Origine: l'attaccante, o il centro dell'area se non risolvibile.
        let ox = box.cx, oy = box.cy;
        const originEl = _lookupTarget(originStateId);
        if (originEl) {
            const r = originEl.getBoundingClientRect();
            ox = r.left + r.width / 2;
            oy = r.top + r.height / 2;
        }

        // Raggio finale dell'onda: copre l'area dei bersagli dall'origine.
        const dx = Math.max(Math.abs(box.maxX - ox), Math.abs(box.minX - ox));
        const dy = Math.max(Math.abs(box.maxY - oy), Math.abs(box.minY - oy));
        const finalR = Math.sqrt(dx * dx + dy * dy) + 40;

        try {
            const root = new PIXI.Container();
            app.stage.addChild(root);

            // Anello d'urto.
            const ring = new PIXI.Graphics();
            ring.x = ox;
            ring.y = oy;
            root.addChild(ring);

            // Nuvola di particelle (solo per poisonCloud / frostBurst).
            let emitter = null;
            if (k === 'poisonCloud' || k === 'frostBurst') {
                const texture = _getTexture();
                if (texture) {
                    const cloud = new PIXI.Container();
                    cloud.x = box.cx;
                    cloud.y = box.cy;
                    root.addChild(cloud);
                    emitter = new PIXI.particles.Emitter(cloud, _cloudConfig(texture, tint, box));
                    emitter.emit = true;
                }
            }

            const RING_MS = 600;
            let elapsed = 0;
            const cb = function (ticker) {
                const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                    ? ticker.deltaMS
                    : (app.ticker.deltaMS || 16.7);
                elapsed += deltaMS;

                // Anello: raggio 20 -> finalR, alpha 0.85 -> 0.
                const t = Math.min(1, elapsed / RING_MS);
                const radius = 20 + (finalR - 20) * t;
                const alpha = 0.85 * (1 - t);
                ring.clear();
                if (alpha > 0.01) {
                    ring.lineStyle(6 * (1 - t) + 1.5, tint, alpha);
                    ring.drawCircle(0, 0, radius);
                }

                if (emitter) {
                    try { emitter.update(deltaMS / 1000); } catch (e) {}
                }

                const ringDone = elapsed >= RING_MS;
                const cloudDone = !emitter || (!emitter.emit && emitter.particleCount === 0);
                if (ringDone && cloudDone) {
                    app.ticker.remove(cb);
                    if (emitter) { try { emitter.destroy(); } catch (e) {} }
                    try {
                        if (root.parent) root.parent.removeChild(root);
                        root.destroy({ children: true });
                    } catch (e) {}
                }
            };
            app.ticker.add(cb);
        } catch (e) {
            console.warn('DS.fx.aoe: play fallita (' + k + ').', e);
        }
    }

    play._disposeTextures = _disposeTextures;
    return play;
})();

// ======================================================================
// DS.fx.room - Particelle ambient a tema stanza nel RoomRevealOverlay.
//
// Sessione 9: enter(subtype, isForest) avvia un emitter ambient
// persistente full-width (cenere/polvere per le Catacombe, foglie per
// la Foresta; tint e densita' dal sottotipo stanza). Il canvas sale a
// z-index 70 per stare sopra l'overlay z-50. leave() ferma l'emissione,
// lascia sfumare le particelle e riporta il canvas a z-30.
//
// Vedi docs/spec-pixi.md §4.9.
// ======================================================================

DS.fx.room = (function () {

    const STAGE_Z_ACTIVE = '70';
    const STAGE_Z_IDLE = '30';

    // sottotipo stanza -> { tint, freq } (freq = intervallo di spawn)
    const ROOM_THEME = {
        combat_room: { tint: 0x991b1b, freq: 0.10 },
        elite_room:  { tint: 0xc2410c, freq: 0.07 },
        boss_room:   { tint: 0xdc2626, freq: 0.05 },
        event_room:  { tint: 0xa855f7, freq: 0.10 },
        loot_room:   { tint: 0xfbbf24, freq: 0.10 },
        rest_room:   { tint: 0x65a30d, freq: 0.16 }
    };

    let _container = null;
    let _emitter = null;
    let _tickerCb = null;
    const _textures = {};

    function _hex(num) { return num.toString(16).padStart(6, '0'); }

    // Particella foglia (rombo) per la Foresta.
    function _leafTexture() {
        if (_textures.leaf) return _textures.leaf;
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        try {
            const g = new PIXI.Graphics();
            g.beginFill(0xffffff, 1);
            g.moveTo(0, -7);
            g.lineTo(4, 0);
            g.lineTo(0, 7);
            g.lineTo(-4, 0);
            g.closePath();
            g.endFill();
            _textures.leaf = app.renderer.generateTexture(g, {
                region: new PIXI.Rectangle(-10, -10, 20, 20), resolution: 2
            });
            g.destroy();
            return _textures.leaf;
        } catch (e) { return null; }
    }

    // Particella cenere/polvere (cerchio) per le Catacombe.
    function _dustTexture() {
        if (_textures.dust) return _textures.dust;
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        try {
            const g = new PIXI.Graphics();
            g.beginFill(0xffffff, 1);
            g.drawCircle(0, 0, 5);
            g.endFill();
            _textures.dust = app.renderer.generateTexture(g, {
                region: new PIXI.Rectangle(-8, -8, 16, 16), resolution: 2
            });
            g.destroy();
            return _textures.dust;
        } catch (e) { return null; }
    }

    function _disposeTextures() {
        for (const k in _textures) {
            try { _textures[k].destroy(true); } catch (e) {}
            delete _textures[k];
        }
    }

    function _config(texture, tint, freq, isForest, vw) {
        const behaviors = [
            { type: 'alpha', config: { alpha: { list: [
                { time: 0, value: 0 },
                { time: 0.2, value: isForest ? 0.8 : 0.55 },
                { time: 0.85, value: isForest ? 0.7 : 0.45 },
                { time: 1, value: 0 }
            ] } } },
            { type: 'scale', config: { scale: { list: [
                { time: 0, value: isForest ? 0.8 : 0.6 },
                { time: 1, value: isForest ? 1.0 : 0.4 }
            ] }, minMult: 0.7 } },
            { type: 'color', config: { color: { list: [
                { time: 0, value: _hex(tint) },
                { time: 1, value: _hex(tint) }
            ] } } },
            { type: 'moveSpeedStatic', config: { min: isForest ? 22 : 14, max: isForest ? 48 : 34 } },
            { type: 'rotationStatic', config: { min: isForest ? 70 : 85, max: isForest ? 110 : 95 } },
            { type: 'spawnShape', config: { type: 'rect', data: { x: 0, y: 0, w: vw, h: 10 } } },
            { type: 'textureSingle', config: { texture: texture } }
        ];
        if (isForest) {
            // Le foglie roteano mentre cadono.
            behaviors.push({ type: 'rotation', config: { accel: 0, minSpeed: 20, maxSpeed: 90, minStart: 0, maxStart: 360 } });
        }
        return {
            lifetime: isForest ? { min: 2.4, max: 4.0 } : { min: 2.0, max: 3.4 },
            frequency: freq,
            emitterLifetime: -1,
            maxParticles: 120,
            pos: { x: 0, y: -20 },
            addAtBack: false,
            behaviors: behaviors
        };
    }

    function _teardown() {
        const app = DS.fx._app;
        if (app && app.ticker && _tickerCb) app.ticker.remove(_tickerCb);
        _tickerCb = null;
        if (_emitter) { try { _emitter.destroy(); } catch (e) {} _emitter = null; }
        if (_container) {
            try {
                if (_container.parent) _container.parent.removeChild(_container);
                _container.destroy({ children: true });
            } catch (e) {}
            _container = null;
        }
        if (DS.fx._canvas) DS.fx._canvas.style.zIndex = STAGE_Z_IDLE;
    }

    function enter(subtype, isForest) {
        if (!DS.fx.enabled) return;
        const app = DS.fx._app;
        if (!app || !PIXI.particles || !PIXI.particles.Emitter) return;

        // Una sola ambientazione per volta.
        _teardown();

        const theme = ROOM_THEME[subtype] || { tint: 0x9ca3af, freq: 0.12 };
        const texture = isForest ? _leafTexture() : _dustTexture();
        if (!texture) return;

        try {
            _container = new PIXI.Container();
            app.stage.addChild(_container);
            _emitter = new PIXI.particles.Emitter(
                _container,
                _config(texture, theme.tint, theme.freq, !!isForest, app.screen.width));
            _emitter.emit = true;

            if (DS.fx._canvas) DS.fx._canvas.style.zIndex = STAGE_Z_ACTIVE;

            _tickerCb = function (ticker) {
                const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                    ? ticker.deltaMS
                    : (app.ticker.deltaMS || 16.7);
                if (_emitter) {
                    try { _emitter.update(deltaMS / 1000); } catch (e) {}
                    // Dopo lo stop dell'emissione, smonta a particelle esaurite.
                    if (!_emitter.emit && _emitter.particleCount === 0) {
                        _teardown();
                    }
                }
            };
            app.ticker.add(_tickerCb);
        } catch (e) {
            console.warn('DS.fx.room: enter fallita.', e);
            _teardown();
        }
    }

    function leave() {
        // Ferma l'emissione: le particelle residue sfumano, poi _teardown
        // viene chiamato dal ticker. Se non c'e' emitter, ripristina solo
        // lo z-index (salvaguardia).
        if (_emitter) {
            _emitter.emit = false;
        } else {
            if (DS.fx._canvas) DS.fx._canvas.style.zIndex = STAGE_Z_IDLE;
        }
    }

    return {
        enter: enter,
        leave: leave,
        _disposeTextures: _disposeTextures
    };
})();

// ======================================================================
// DS.fx.phaseAura - Alone dietro l'annuncio di cambio fase.
//
// Sessione 9: one-shot ~1.1s, sincronizzato con DS.announcePhaseChange.
// Motes dorati attorno alla posizione di #phase-announce. Il canvas
// resta a z-30 (l'alone sta tra il gioco e il testo announce z-50).
// ======================================================================

DS.fx.phaseAura = (function () {

    let _texture = null;

    function _getTexture() {
        if (_texture) return _texture;
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        try {
            const g = new PIXI.Graphics();
            g.beginFill(0xfde68a, 1);
            g.drawCircle(0, 0, 4);
            g.endFill();
            _texture = app.renderer.generateTexture(g, {
                region: new PIXI.Rectangle(-8, -8, 16, 16), resolution: 2
            });
            g.destroy();
            return _texture;
        } catch (e) { return null; }
    }

    function _disposeTextures() {
        if (_texture) { try { _texture.destroy(true); } catch (e) {} _texture = null; }
    }

    function play() {
        if (!DS.fx.enabled) return;
        const app = DS.fx._app;
        if (!app || !PIXI.particles || !PIXI.particles.Emitter) return;
        const texture = _getTexture();
        if (!texture) return;

        // Posizione: centro di #phase-announce, o alto-centro del viewport.
        let cx = app.screen.width / 2;
        let cy = app.screen.height * 0.12;
        const el = document.getElementById('phase-announce');
        if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 0) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
        }

        try {
            const container = new PIXI.Container();
            container.x = cx;
            container.y = cy;
            app.stage.addChild(container);
            const emitter = new PIXI.particles.Emitter(container, {
                lifetime: { min: 0.8, max: 1.4 },
                frequency: 0.04,
                emitterLifetime: 1.1,
                maxParticles: 40,
                pos: { x: 0, y: 0 },
                addAtBack: false,
                behaviors: [
                    { type: 'alpha', config: { alpha: { list: [
                        { time: 0, value: 0 }, { time: 0.3, value: 0.7 }, { time: 1, value: 0 }
                    ] } } },
                    { type: 'scale', config: { scale: { list: [
                        { time: 0, value: 0.5 }, { time: 1, value: 1.0 }
                    ] }, minMult: 0.7 } },
                    { type: 'moveSpeedStatic', config: { min: 10, max: 30 } },
                    { type: 'rotationStatic', config: { min: 0, max: 360 } },
                    { type: 'spawnShape', config: { type: 'rect', data: { x: -160, y: -14, w: 320, h: 28 } } },
                    { type: 'textureSingle', config: { texture: texture } }
                ]
            });
            emitter.emit = true;
            const cb = function (ticker) {
                const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                    ? ticker.deltaMS
                    : (app.ticker.deltaMS || 16.7);
                try { emitter.update(deltaMS / 1000); } catch (e) {}
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
            console.warn('DS.fx.phaseAura: play fallita.', e);
        }
    }

    play._disposeTextures = _disposeTextures;
    return play;
})();

// ======================================================================
// DS.fx.combatStartFlash - Flash + onda d'urto all'ingresso in combat.
//
// Sessione 9: one-shot ~0.5s, trigger PhaseChangedMutation -> CombatInit.
// ======================================================================

DS.fx.combatStartFlash = function () {
    if (!DS.fx.enabled) return;
    const app = DS.fx._app;
    if (!app) return;
    try {
        const vw = app.screen.width;
        const vh = app.screen.height;
        const root = new PIXI.Container();
        app.stage.addChild(root);

        // Velo full-screen che lampeggia.
        const veil = new PIXI.Graphics();
        veil.beginFill(0xfde68a, 1);
        veil.drawRect(0, 0, vw, vh);
        veil.endFill();
        veil.alpha = 0;
        root.addChild(veil);

        // Anello d'urto dal centro.
        const ring = new PIXI.Graphics();
        ring.x = vw / 2;
        ring.y = vh / 2;
        root.addChild(ring);

        const DURATION = 500;
        const finalR = Math.sqrt(vw * vw + vh * vh) / 2;
        let elapsed = 0;
        const cb = function (ticker) {
            const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                ? ticker.deltaMS
                : (app.ticker.deltaMS || 16.7);
            elapsed += deltaMS;
            const t = Math.min(1, elapsed / DURATION);

            // Flash: sale rapido e scende.
            veil.alpha = t < 0.25 ? (t / 0.25) * 0.5 : 0.5 * (1 - (t - 0.25) / 0.75);

            // Anello.
            const radius = 20 + (finalR - 20) * t;
            ring.clear();
            const ringAlpha = 0.9 * (1 - t);
            if (ringAlpha > 0.01) {
                ring.lineStyle(8 * (1 - t) + 2, 0xfde68a, ringAlpha);
                ring.drawCircle(0, 0, radius);
            }

            if (t >= 1) {
                app.ticker.remove(cb);
                try {
                    if (root.parent) root.parent.removeChild(root);
                    root.destroy({ children: true });
                } catch (e) {}
            }
        };
        app.ticker.add(cb);
    } catch (e) {
        console.warn('DS.fx.combatStartFlash: fallita.', e);
    }
};

// ======================================================================
// DS.fx.equipImpact - Scintilla all'arrivo di un equipaggiamento.
//
// Sessione 10: one-shot, chiamato da DS.equipFlight al termine del volo.
// category: 'weapon' (scintille metalliche), 'armor' (bagliore ambra),
// 'trinket' (luccichio oro). Vedi docs/spec-pixi.md §4.10.
// ======================================================================

DS.fx.equipImpact = (function () {

    const CATEGORY_TINT = {
        weapon:  0xe5e7eb,  // bianco-metallo
        armor:   0xf59e0b,  // ambra
        trinket: 0xfbbf24   // oro
    };

    let _texture = null;

    function _getTexture() {
        if (_texture) return _texture;
        const app = DS.fx._app;
        if (!app || !app.renderer) return null;
        try {
            const g = new PIXI.Graphics();
            g.beginFill(0xffffff, 1);
            g.moveTo(0, -6);
            g.lineTo(1.6, 0);
            g.lineTo(0, 6);
            g.lineTo(-1.6, 0);
            g.closePath();
            g.endFill();
            _texture = app.renderer.generateTexture(g, {
                region: new PIXI.Rectangle(-8, -8, 16, 16), resolution: 2
            });
            g.destroy();
            return _texture;
        } catch (e) { return null; }
    }

    function _disposeTextures() {
        if (_texture) { try { _texture.destroy(true); } catch (e) {} _texture = null; }
    }

    function _hex(num) { return num.toString(16).padStart(6, '0'); }

    function play(slotElId, category) {
        if (!DS.fx.enabled) return;
        const app = DS.fx._app;
        if (!app || !PIXI.particles || !PIXI.particles.Emitter) return;
        const el = document.getElementById(slotElId);
        if (!el) return;
        const texture = _getTexture();
        if (!texture) return;

        const tint = CATEGORY_TINT[category] || CATEGORY_TINT.weapon;
        const rect = el.getBoundingClientRect();

        try {
            const container = new PIXI.Container();
            container.x = rect.left + rect.width / 2;
            container.y = rect.top + rect.height / 2;
            app.stage.addChild(container);

            const emitter = new PIXI.particles.Emitter(container, {
                lifetime: { min: 0.4, max: 0.7 },
                frequency: 0.006,
                emitterLifetime: 0.08,
                maxParticles: 22,
                pos: { x: 0, y: 0 },
                addAtBack: false,
                behaviors: [
                    { type: 'alpha', config: { alpha: { list: [
                        { time: 0, value: 1 }, { time: 1, value: 0 }
                    ] } } },
                    { type: 'scale', config: { scale: { list: [
                        { time: 0, value: 0.9 }, { time: 1, value: 0.3 }
                    ] }, minMult: 0.8 } },
                    { type: 'color', config: { color: { list: [
                        { time: 0, value: _hex(tint) }, { time: 1, value: _hex(tint) }
                    ] } } },
                    { type: 'moveSpeed', config: { speed: { list: [
                        { time: 0, value: 110 }, { time: 1, value: 30 }
                    ] }, minMult: 0.8 } },
                    { type: 'rotationStatic', config: { min: 0, max: 360 } },
                    { type: 'spawnShape', config: { type: 'circle', data: { x: 0, y: 0, radius: 8 } } },
                    { type: 'textureSingle', config: { texture: texture } }
                ]
            });
            emitter.emit = true;
            const cb = function (ticker) {
                const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                    ? ticker.deltaMS
                    : (app.ticker.deltaMS || 16.7);
                try { emitter.update(deltaMS / 1000); } catch (e) {}
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
            console.warn('DS.fx.equipImpact: play fallita.', e);
        }
    }

    play._disposeTextures = _disposeTextures;
    return play;
})();

// ======================================================================
// DS.fx.summonRune - Runa magica per l'evocazione di un compagno.
//
// Sessione 10: one-shot ~1.2s, agganciata al centro di un elemento DOM
// (lo slot compagno). Cerchio runico Graphics che appare, ruota e svanisce.
// ======================================================================

DS.fx.summonRune = function (slotElId) {
    if (!DS.fx.enabled) return;
    const app = DS.fx._app;
    if (!app) return;
    const el = document.getElementById(slotElId);
    if (!el) return;

    try {
        const rect = el.getBoundingClientRect();
        const RUNE_COLOR = 0x818cf8; // indaco magico
        const radius = Math.min(70, Math.max(36, Math.min(rect.width, rect.height) / 2));

        const rune = new PIXI.Graphics();
        rune.x = rect.left + rect.width / 2;
        rune.y = rect.top + rect.height / 2;
        rune.alpha = 0;
        app.stage.addChild(rune);

        function redraw() {
            const g = rune;
            g.clear();
            // Cerchio esterno.
            g.lineStyle(2.5, RUNE_COLOR, 0.9);
            g.drawCircle(0, 0, radius);
            // Cerchio interno.
            g.lineStyle(1.5, RUNE_COLOR, 0.7);
            g.drawCircle(0, 0, radius * 0.62);
            // Segmenti runici radiali tra i due cerchi.
            g.lineStyle(2, RUNE_COLOR, 0.85);
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI / 4) * i;
                g.moveTo(Math.cos(a) * radius * 0.62, Math.sin(a) * radius * 0.62);
                g.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
            }
            // Riempimento tenue.
            g.beginFill(RUNE_COLOR, 0.10);
            g.drawCircle(0, 0, radius * 0.62);
            g.endFill();
        }
        redraw();

        const DURATION = 1200;
        let elapsed = 0;
        const cb = function (ticker) {
            const deltaMS = (ticker && typeof ticker.deltaMS === 'number')
                ? ticker.deltaMS
                : (app.ticker.deltaMS || 16.7);
            elapsed += deltaMS;
            const t = Math.min(1, elapsed / DURATION);

            // Fade-in 0-0.2, tieni, fade-out 0.7-1; flash a meta'.
            let alpha;
            if (t < 0.2) alpha = t / 0.2;
            else if (t > 0.7) alpha = Math.max(0, 1 - (t - 0.7) / 0.3);
            else alpha = 1;
            const flash = (t > 0.4 && t < 0.55) ? 0.4 : 0;
            rune.alpha = Math.min(1, alpha + flash);

            // Rotazione lenta + leggera pulsazione di scala.
            rune.rotation = t * 0.9;
            rune.scale.set(0.85 + 0.15 * Math.sin(t * Math.PI));

            if (t >= 1) {
                app.ticker.remove(cb);
                try {
                    if (rune.parent) rune.parent.removeChild(rune);
                    rune.destroy();
                } catch (e) {}
            }
        };
        app.ticker.add(cb);
    } catch (e) {
        console.warn('DS.fx.summonRune: fallita.', e);
    }
};

